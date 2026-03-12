import express from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs-extra'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const router = express.Router()
const __dirname = dirname(fileURLToPath(import.meta.url))
const DRAFTS_DIR = join(__dirname, '../../artifacts/drafts')

const STYLES = [
  { direction: 'modern/bold', label: 'first' },
  { direction: 'clean/minimal', label: 'second' },
  { direction: 'warm/expressive', label: 'third' },
]

const SINGLE_DRAFT_PROMPT = (userPrompt, direction, index, previousStyles) => {
  const avoid = previousStyles.length
    ? `\nIMPORTANT: You already generated: ${previousStyles.join(', ')}. This design MUST be dramatically different in layout, color, and typography.`
    : ''
  return `You are an expert web designer and creative director. Generate ONE homepage design for the following business/project:

"${userPrompt}"

Design direction: ${direction} (this is design #${index + 1} of 3)${avoid}

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

// SSE endpoint — streams each draft as it's ready, saves progressively
router.get('/generate', async (req, res) => {
  const prompt = req.query.prompt
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' })

  await fs.ensureDir(DRAFTS_DIR)
  const id = randomUUID()
  const sessionPath = join(DRAFTS_DIR, `${id}.json`)

  const session = { id, prompt, generatedAt: new Date().toISOString(), status: 'generating', drafts: [] }
  await fs.writeJson(sessionPath, session)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  send('session_created', { sessionId: id })

  const previousStyles = []

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

    for (let i = 0; i < STYLES.length; i++) {
      send('draft_start', { index: i })

      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: DRAFT_SCHEMA,
        },
      })

      const result = await model.generateContent(
        SINGLE_DRAFT_PROMPT(prompt, STYLES[i].direction, i, previousStyles)
      )
      const draft = JSON.parse(result.response.text())
      session.drafts.push(draft)
      previousStyles.push(draft.style)
      await fs.writeJson(sessionPath, session)
      send('draft_ready', { index: i, draft })
    }

    session.status = 'complete'
    await fs.writeJson(sessionPath, session)
    send('done', { sessionId: id })
  } catch (err) {
    console.error('Draft generation error:', err)
    session.status = 'error'
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
      const { id, prompt, generatedAt, status, drafts } = await fs.readJson(join(DRAFTS_DIR, file))
      sessions.push({
        id, prompt, generatedAt,
        status: status || 'complete',
        drafts: (drafts || []).map(({ html: _html, ...meta }) => meta),
      })
    } catch (_) {}
  }
  res.json(sessions.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)))
})

// Save a draft session
router.post('/history', async (req, res) => {
  const { prompt, drafts } = req.body
  if (!prompt || !Array.isArray(drafts)) return res.status(400).json({ error: 'Invalid payload' })
  await fs.ensureDir(DRAFTS_DIR)
  const id = randomUUID()
  const session = { id, prompt, generatedAt: new Date().toISOString(), drafts }
  await fs.writeJson(join(DRAFTS_DIR, `${id}.json`), session)
  res.json({ id })
})

// Get a single draft session (full, with HTML)
router.get('/history/:id', async (req, res) => {
  const file = join(DRAFTS_DIR, `${req.params.id}.json`)
  if (!await fs.pathExists(file)) return res.status(404).json({ error: 'Not found' })
  res.json(await fs.readJson(file))
})

export default router
