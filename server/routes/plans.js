import express from 'express'
import multer from 'multer'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs-extra'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const router = express.Router()
const __dirname = dirname(fileURLToPath(import.meta.url))
const PLANS_DIR = join(__dirname, '../../plans')

const SECTIONS = [
  { id: 'brand-theme', label: 'Brand & Theme', emoji: '🎨' },
  { id: 'goals-brief', label: 'Goals & Brief', emoji: '🎯' },
  { id: 'sitemap-structure', label: 'Sitemap & Structure', emoji: '🗺️' },
  { id: 'integrations', label: 'Apps & Integrations', emoji: '🔌' },
  { id: 'content-inventory', label: 'Content Inventory', emoji: '📦' },
  { id: 'inspiration', label: 'Inspiration & References', emoji: '✨' },
]

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = join(PLANS_DIR, req.params.id, 'uploads')
    await fs.ensureDir(dir)
    cb(null, dir)
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

const SYSTEM_PROMPT = `You are a skilled website strategist and planner helping a web agency plan a client website. Your job is to guide the conversation naturally while building a comprehensive website plan.

You are building a plan with these sections:
1. brand-theme: Visual identity — colors, fonts, personality, tone of voice
2. goals-brief: Business objectives, target audience, KPIs, timeline
3. sitemap-structure: Pages, navigation hierarchy, key user flows
4. integrations: Required apps — CRM, booking, e-commerce, forms, analytics, etc.
5. content-inventory: Existing content, assets, copy to write, images needed
6. inspiration: Style references, competitor sites, mood, what to avoid

Rules:
- Be conversational, warm, and professional — like a smart colleague
- Ask 1-2 focused questions at a time, not a long list
- Extract details from the user's answers and build the plan incrementally
- Start by asking about the business if you don't know it yet
- Gradually cover all sections over the conversation — don't rush

CRITICAL: Always respond with ONLY valid JSON, no markdown, no explanation:
{
  "message": "your conversational reply to the user",
  "updates": {
    "section-id": "markdown content (append to existing — write the full updated content for this section)"
  }
}

The "updates" object should only include sections you have new information for. Use clear markdown formatting in section content (headers, bullet lists, etc.).`

// List all plans
router.get('/', async (req, res) => {
  await fs.ensureDir(PLANS_DIR)
  const entries = await fs.readdir(PLANS_DIR, { withFileTypes: true })
  const plans = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metaPath = join(PLANS_DIR, entry.name, 'meta.json')
    if (await fs.pathExists(metaPath)) {
      plans.push(await fs.readJson(metaPath))
    }
  }
  res.json(plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)))
})

const PLAN_GEN_PROMPT = (prompt) => `You are an expert website strategist and planner working for a web agency.

Based on the following project description, generate a thorough, specific website plan.

Project description: "${prompt}"

Return ONLY valid JSON (no markdown fences, no explanation) with exactly these keys:
{
  "brand-theme": "...",
  "goals-brief": "...",
  "sitemap-structure": "...",
  "integrations": "...",
  "content-inventory": "...",
  "inspiration": "..."
}

For each key, write detailed markdown content (use ## headers, bullet lists, bold labels). Be specific to the business type — make intelligent assumptions. Aim for 150-250 words per section.

brand-theme: Visual identity — color palette suggestions (with hex values), typography direction, brand personality, tone of voice, visual references.
goals-brief: Business objectives, primary/secondary goals for the website, target audience breakdown, success metrics/KPIs, project constraints.
sitemap-structure: Full page list with hierarchy, main navigation structure, key user flows (2-3 flows), page-level notes.
integrations: All likely third-party tools — CRM, booking, payments, forms, analytics, live chat, social feeds, email marketing. Note which are essential vs nice-to-have.
content-inventory: Content that needs to be created or gathered — copy sections per page, image types needed, existing assets to collect, video/media needs.
inspiration: Design direction references, competitor sites to study, visual mood description, what to avoid, 3-5 specific aesthetic references.`

// Create a new plan
router.post('/', async (req, res) => {
  const { name, initialPrompt } = req.body
  const id = randomUUID()
  const dir = join(PLANS_DIR, id)
  await fs.ensureDir(dir)

  const meta = { id, name, initialPrompt: initialPrompt || '', createdAt: new Date().toISOString() }
  await fs.writeJson(join(dir, 'meta.json'), meta)

  for (const section of SECTIONS) {
    await fs.writeFile(join(dir, `${section.id}.md`), '')
  }
  await fs.writeJson(join(dir, 'history.json'), [])

  res.json({ ...meta, sections: await readSections(id) })
})

// Stream plan generation via SSE
router.get('/:id/generate', async (req, res) => {
  const dir = join(PLANS_DIR, req.params.id)
  if (!await fs.pathExists(dir)) return res.status(404).json({ error: 'Not found' })

  const meta = await fs.readJson(join(dir, 'meta.json'))

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  if (!meta.initialPrompt) {
    send('done', {})
    return res.end()
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

    const result = await model.generateContentStream(PLAN_GEN_PROMPT(meta.initialPrompt))

    let fullText = ''
    const appearing = new Set()

    for await (const chunk of result.stream) {
      const chunkText = chunk.text()
      fullText += chunkText
      // Detect section keys appearing in the stream
      for (const section of SECTIONS) {
        if (!appearing.has(section.id) && fullText.includes(`"${section.id}"`)) {
          appearing.add(section.id)
          send('section_start', { id: section.id })
        }
      }
    }

    const cleaned = fullText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const generated = JSON.parse(cleaned)

    for (const section of SECTIONS) {
      if (generated[section.id]) {
        await fs.writeFile(join(dir, `${section.id}.md`), generated[section.id])
        send('section_done', { id: section.id, content: generated[section.id] })
      }
    }

    send('done', {})
  } catch (err) {
    console.error('SSE generation error:', err.message)
    send('fail', { message: err.message || 'Generation failed' })
  }

  res.end()
})

// Get a plan
router.get('/:id', async (req, res) => {
  const dir = join(PLANS_DIR, req.params.id)
  if (!await fs.pathExists(dir)) return res.status(404).json({ error: 'Not found' })
  const meta = await fs.readJson(join(dir, 'meta.json'))
  const sections = await readSections(req.params.id)
  const history = await fs.readJson(join(dir, 'history.json')).catch(() => [])
  res.json({ ...meta, sections, history })
})

// Chat endpoint
router.post('/:id/chat', async (req, res) => {
  const { message } = req.body
  const dir = join(PLANS_DIR, req.params.id)
  if (!await fs.pathExists(dir)) return res.status(404).json({ error: 'Not found' })

  const history = await fs.readJson(join(dir, 'history.json')).catch(() => [])
  const sections = await readSections(req.params.id)
  const meta = await fs.readJson(join(dir, 'meta.json'))

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

    const currentPlan = SECTIONS.map(s =>
      `### ${s.label}\n${sections[s.id] || '(empty)'}`
    ).join('\n\n')

    // Include pending user message in context without saving it yet
    const contextHistory = [...history, { role: 'user', content: message }]

    const contextPrompt = `${SYSTEM_PROMPT}

Project name: "${meta.name}"

Current plan state:
${currentPlan}

Conversation so far:
${contextHistory.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

User's latest message: "${message}"

Respond with JSON only.`

    const result = await model.generateContent(contextPrompt)
    const text = result.response.text()
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)

    // Save updates to .md files
    if (parsed.updates) {
      for (const [sectionId, content] of Object.entries(parsed.updates)) {
        const sectionPath = join(dir, `${sectionId}.md`)
        await fs.writeFile(sectionPath, content)
      }
    }

    // Only persist history once we have a valid response
    history.push({ role: 'user', content: message, ts: Date.now() })
    history.push({ role: 'assistant', content: parsed.message, ts: Date.now() })
    await fs.writeJson(join(dir, 'history.json'), history)

    const updatedSections = await readSections(req.params.id)
    res.json({ message: parsed.message, sections: updatedSections })
  } catch (err) {
    console.error('Chat error:', err)
    res.status(500).json({ error: err.message || 'AI error' })
  }
})

// Direct section save (from editable preview)
router.put('/:id/sections/:sectionId', async (req, res) => {
  const { id, sectionId } = req.params
  const { content } = req.body
  const dir = join(PLANS_DIR, id)
  if (!await fs.pathExists(dir)) return res.status(404).json({ error: 'Not found' })
  const validSection = SECTIONS.find(s => s.id === sectionId)
  if (!validSection) return res.status(400).json({ error: 'Invalid section' })
  await fs.writeFile(join(dir, `${sectionId}.md`), content ?? '')
  res.json({ ok: true })
})

// File upload
router.post('/:id/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  // Append file reference to content-inventory
  const dir = join(PLANS_DIR, req.params.id)
  const inventoryPath = join(dir, 'content-inventory.md')
  const existing = await fs.readFile(inventoryPath, 'utf-8').catch(() => '')
  const note = `\n- **Uploaded file:** \`${req.file.originalname}\` (${(req.file.size / 1024).toFixed(1)} KB)`
  await fs.writeFile(inventoryPath, existing + note)

  res.json({ filename: req.file.filename, originalname: req.file.originalname })
})

async function readSections(planId) {
  const dir = join(PLANS_DIR, planId)
  const result = {}
  for (const section of SECTIONS) {
    result[section.id] = await fs.readFile(join(dir, `${section.id}.md`), 'utf-8').catch(() => '')
  }
  return result
}

export { SECTIONS }
export default router
