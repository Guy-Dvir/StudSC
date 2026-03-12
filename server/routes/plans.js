import express from 'express'
import multer from 'multer'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs-extra'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const router = express.Router()
const __dirname = dirname(fileURLToPath(import.meta.url))
const PLANS_DIR = join(__dirname, '../../artifacts/plans')

const SECTIONS = [
  { id: 'goals-brief', label: 'Goals & Brief', emoji: '🎯' },
  { id: 'brand-theme', label: 'Brand & Theme', emoji: '🎨' },
  { id: 'sitemap-structure', label: 'Sitemap & Structure', emoji: '🗺️' },
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

const SECTION_PROMPTS = {
  'goals-brief': (prompt) => `You are an expert website strategist. Write the "Goals & Brief" section for this website plan.

Project: "${prompt}"

Write ONLY the markdown content — no JSON, no preamble, no section title. Use ## subheaders, bullet lists, and bold labels.
Cover: business objectives, primary/secondary website goals, target audience breakdown, success metrics/KPIs, project constraints.
Aim for 150-250 words. Be specific to the business type — make intelligent assumptions.`,

  'brand-theme': (prompt) => `You are an expert website strategist. Write the "Brand & Theme" section for this website plan.

Project: "${prompt}"

Write ONLY the markdown content — no JSON, no preamble, no section title. Use ## subheaders, bullet lists, and bold labels.
Cover: color palette (suggest 4-5 colors with hex values), typography direction, brand personality, tone of voice, visual style references.
Aim for 150-250 words. Be specific to the business type — make intelligent assumptions.`,

  'sitemap-structure': (prompt) => `You are an expert website strategist. Write the "Sitemap & Structure" section for this website plan.

Project: "${prompt}"

Write ONLY the markdown content — no JSON, no preamble, no section title. Use ## subheaders, nested bullet lists for hierarchy, and bold labels.
Cover: full page list with hierarchy, main navigation structure, 2-3 key user flows, page-level notes.
Aim for 150-250 words. Be specific to the business type — make intelligent assumptions.`,
}

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

    for (const section of SECTIONS) {
      send('section_start', { id: section.id })

      const result = await model.generateContentStream(SECTION_PROMPTS[section.id](meta.initialPrompt))
      let fullContent = ''

      for await (const chunk of result.stream) {
        const text = chunk.text()
        fullContent += text
        send('section_chunk', { id: section.id, chunk: text })
      }

      await fs.writeFile(join(dir, `${section.id}.md`), fullContent)
      send('section_done', { id: section.id, content: fullContent })
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
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            message: { type: 'STRING' },
            updates: {
              type: 'OBJECT',
              properties: {
                'goals-brief': { type: 'STRING' },
                'brand-theme': { type: 'STRING' },
                'sitemap-structure': { type: 'STRING' },
              },
            },
          },
          required: ['message'],
        },
      },
    })

    const currentPlan = SECTIONS.map(s =>
      `### ${s.label}\n${sections[s.id] || '(empty)'}`
    ).join('\n\n')

    const contextHistory = [...history, { role: 'user', content: message }]

    const contextPrompt = `${SYSTEM_PROMPT}

Project name: "${meta.name}"

Current plan state:
${currentPlan}

Conversation so far:
${contextHistory.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}

User's latest message: "${message}"`

    const result = await model.generateContent(contextPrompt)
    const text = result.response.text()
    const parsed = JSON.parse(text)

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
