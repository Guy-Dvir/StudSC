import express from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs-extra'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const router = express.Router()
const __dirname = dirname(fileURLToPath(import.meta.url))
const DRAFTS_DIR = join(__dirname, '../../artifacts/drafts')

const STYLE_DIRECTIONS = [
  'modern/bold', 'clean/minimal', 'warm/expressive',
  'retro/vintage', 'luxury/elegant', 'playful/vibrant',
  'brutalist/raw', 'organic/natural', 'editorial/typographic',
  'futuristic/tech',
]

const SINGLE_DRAFT_PROMPT = (userPrompt, direction, index, previousStyles) => {
  const avoid = previousStyles.length
    ? `\nIMPORTANT: You already generated: ${previousStyles.join(', ')}. This design MUST be dramatically different in layout, color, and typography.`
    : ''
  return `You are an expert web designer and creative director. Generate ONE homepage design for the following business/project:

"${userPrompt}"

Design direction: ${direction} (design #${index + 1})${avoid}

Return a JSON object with:
- "style": a catchy 2-3 word style name (e.g., "Bold Editorial", "Clean Minimalist")
- "palette": brief description like "Deep navy + warm gold"
- "mood": one sentence capturing the feeling
- "html": a COMPLETE, self-contained HTML document

HTML requirements:
- All CSS embedded in a <style> tag — NO external dependencies, NO CDN links
- Use system fonts: -apple-system, 'Segoe UI', or 'Georgia' only
- Use CSS custom properties for theming
- Replace images with beautiful CSS gradients, SVG patterns, or solid colored blocks
- Include realistic, relevant placeholder content (not generic Lorem Ipsum — make it specific to the business)
- CRITICAL: The homepage MUST contain between 5 and 10 distinct sections (not including the header and footer). Always include: a nav bar, a hero (full viewport height), and a footer. Fill the remaining sections (minimum 5 more) from this pool — choose what fits the business: features/services, pricing, testimonials/social proof, stats/numbers, team, about, process/how-it-works, FAQ, CTA banner, gallery/portfolio.
- Use CSS animations (fade-in, slide-up) for polish
- The page should look like a real, production-ready website — impressive typography, spacing, and color use
- Responsive (works at 1280px width)`
}

const DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    style: { type: 'STRING' },
    palette: { type: 'STRING' },
    mood: { type: 'STRING' },
    html: { type: 'STRING' },
  },
  required: ['style', 'palette', 'mood', 'html'],
}

/** Matches the plan → quick-draft handoff in PlanMode.jsx */
const PLAN_DRAFT_PROMPT_PREFIX = 'Based on this comprehensive website plan:'

function stripMdInline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

/**
 * When displayName never reached the server (long URLs, older clients), derive a short list title
 * from the synthetic plan prompt instead of showing the full markdown blob.
 */
function titleFromPlanDraftPrompt(prompt) {
  if (typeof prompt !== 'string') return ''
  const text = prompt.replace(/\r\n/g, '\n')
  if (!text.trimStart().startsWith(PLAN_DRAFT_PROMPT_PREFIX)) return ''
  let rest = text.slice(text.indexOf(PLAN_DRAFT_PROMPT_PREFIX) + PLAN_DRAFT_PROMPT_PREFIX.length).trimStart()
  const lines = rest.split('\n')
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (i >= lines.length) return 'Website plan'
  // First ## block: use first substantive body line, else the section heading
  if (/^##\s+/.test(lines[i].trim())) {
    const sectionHeading = stripMdInline(lines[i].trim()).replace(/^##\s+/, '')
    i++
    while (i < lines.length && !lines[i].trim()) i++
    if (i < lines.length) {
      const raw = lines[i].trim()
      if (!/^##\s/.test(raw)) {
        const body = stripMdInline(raw).replace(/^[-*]\s+/, '')
        if (body.length >= 8) {
          return body.length > 72 ? `${body.slice(0, 69).trimEnd()}…` : body
        }
      }
    }
    return sectionHeading ? `Plan · ${sectionHeading}` : 'Website plan'
  }
  const snippet = stripMdInline(lines[i]).slice(0, 72)
  return snippet || 'Website plan'
}

function resolveSessionDisplayName(storedDisplayName, prompt) {
  const s = typeof storedDisplayName === 'string' ? storedDisplayName.trim() : ''
  if (s) return s
  return titleFromPlanDraftPrompt(prompt) || ''
}

function sessionJsonForClient(raw) {
  const { id, prompt, displayName, generatedAt, status, drafts, generatingTarget } = raw
  return {
    id,
    prompt,
    displayName: resolveSessionDisplayName(displayName, prompt),
    generatedAt,
    status: status || 'complete',
    generatingTarget: generatingTarget ?? null,
    drafts,
  }
}

// SSE endpoint — streams each draft as it's ready, saves progressively
// Query params: prompt, displayName, count (default 3), startIndex (default 0), existingStyles (comma-sep), sessionId (append to existing)
router.get('/generate', async (req, res) => {
  const prompt = req.query.prompt
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' })

  const count = Math.min(Math.max(parseInt(req.query.count) || 3, 1), 6)
  const startIndex = Math.max(parseInt(req.query.startIndex) || 0, 0)
  const existingStyles = req.query.existingStyles
    ? req.query.existingStyles.split(',').map(s => s.trim()).filter(Boolean)
    : []
  const appendId = req.query.sessionId && /^[0-9a-f-]{36}$/i.test(req.query.sessionId) ? req.query.sessionId : null

  await fs.ensureDir(DRAFTS_DIR)

  const queryDisplay =
    typeof req.query.displayName === 'string' ? req.query.displayName.trim() : ''
  const displayName = queryDisplay || titleFromPlanDraftPrompt(prompt) || ''
  let id
  let sessionPath
  let session

  const appendPath = appendId ? join(DRAFTS_DIR, `${appendId}.json`) : null
  if (appendPath && await fs.pathExists(appendPath)) {
    session = await fs.readJson(appendPath)
    if (session.prompt !== prompt) {
      return res.status(400).json({ error: 'Session prompt mismatch' })
    }
    id = session.id
    sessionPath = appendPath
    session.status = 'generating'
    session.generatingTarget = startIndex + count
    if (!Array.isArray(session.drafts)) session.drafts = []
    if (!(typeof session.displayName === 'string' && session.displayName.trim())) {
      session.displayName = displayName
    }
  } else {
    id = randomUUID()
    sessionPath = join(DRAFTS_DIR, `${id}.json`)
    session = {
      id,
      prompt,
      displayName,
      generatedAt: new Date().toISOString(),
      status: 'generating',
      drafts: [],
      generatingTarget: startIndex + count,
    }
  }

  await fs.writeJson(sessionPath, session)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  send('session_created', { sessionId: id, generatingTarget: session.generatingTarget })

  let drafts = Array.isArray(session.drafts) ? [...session.drafts] : []
  const previousStyles = [...existingStyles]

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

    for (let i = 0; i < count; i++) {
      const globalIndex = startIndex + i
      const dirIndex = globalIndex % STYLE_DIRECTIONS.length
      while (drafts.length <= globalIndex) drafts.push(null)
      send('draft_start', { index: globalIndex })

      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: DRAFT_SCHEMA,
        },
      })

      const result = await model.generateContent(
        SINGLE_DRAFT_PROMPT(prompt, STYLE_DIRECTIONS[dirIndex], globalIndex, previousStyles)
      )
      const draft = JSON.parse(result.response.text())
      drafts[globalIndex] = draft
      previousStyles.push(draft.style)
      session.drafts = drafts
      await fs.writeJson(sessionPath, session)
      send('draft_ready', { index: globalIndex, draft })
    }

    session.status = 'complete'
    delete session.generatingTarget
    session.drafts = drafts.filter(d => d != null)
    await fs.writeJson(sessionPath, session)
    send('done', { sessionId: id })
  } catch (err) {
    console.error('Draft generation error:', err)
    session.status = 'error'
    delete session.generatingTarget
    await fs.writeJson(sessionPath, session).catch(() => {})
    send('error', { message: err.message || 'Generation failed' })
  }

  res.end()
})

// List saved draft sessions (metadata only, no HTML)
router.get('/history', async (req, res) => {
  await fs.ensureDir(DRAFTS_DIR)
  const files = await fs.readdir(DRAFTS_DIR)
  const sessions = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const row = await fs.readJson(join(DRAFTS_DIR, file))
      const slimDrafts = (row.drafts || []).map(d => {
        if (!d || typeof d !== 'object') return null
        const { html: _html, ...meta } = d
        return meta
      })
      sessions.push(sessionJsonForClient({ ...row, drafts: slimDrafts }))
    } catch (_) {}
  }
  res.json(sessions.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)))
})

// Save a draft session
router.post('/history', async (req, res) => {
  const { prompt, drafts, displayName } = req.body
  if (!prompt || !Array.isArray(drafts)) return res.status(400).json({ error: 'Invalid payload' })
  await fs.ensureDir(DRAFTS_DIR)
  const id = randomUUID()
  const resolved =
    (typeof displayName === 'string' && displayName.trim()) || titleFromPlanDraftPrompt(prompt) || ''
  const session = { id, prompt, displayName: resolved, generatedAt: new Date().toISOString(), drafts }
  await fs.writeJson(join(DRAFTS_DIR, `${id}.json`), session)
  res.json({ id })
})

// Get a single draft session (full, with HTML)
router.get('/history/:id', async (req, res) => {
  const file = join(DRAFTS_DIR, `${req.params.id}.json`)
  if (!await fs.pathExists(file)) return res.status(404).json({ error: 'Not found' })
  const raw = await fs.readJson(file)
  res.json({
    ...raw,
    displayName: resolveSessionDisplayName(raw.displayName, raw.prompt),
  })
})

export default router
