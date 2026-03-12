import express from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'
import fs from 'fs-extra'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const router = express.Router()
const __dirname = dirname(fileURLToPath(import.meta.url))
const DRAFTS_DIR = join(__dirname, '../../drafts')

const DRAFT_PROMPT = (userPrompt) => `You are an expert web designer and creative director. Generate 3 completely different homepage designs for the following business/project:

"${userPrompt}"

Return ONLY a valid JSON array (no markdown fences, no explanation) with exactly 3 objects. Each object must have:
- "style": string - a catchy 2-3 word style name (e.g., "Bold Editorial", "Clean Minimalist")
- "palette": string - brief description like "Deep navy + warm gold"
- "mood": string - one sentence capturing the feeling
- "html": string - a COMPLETE, self-contained HTML document

HTML requirements:
- All CSS embedded in a <style> tag — NO external dependencies, NO CDN links
- Use system fonts: -apple-system, 'Segoe UI', or 'Georgia' only
- Use CSS custom properties for theming
- Replace images with beautiful CSS gradients, SVG patterns, or solid colored blocks
- Include realistic, relevant placeholder content (not generic Lorem Ipsum — make it specific to the business)
- CRITICAL: Each homepage MUST contain between 5 and 10 distinct sections (not including the header and footer). Always include: a nav bar, a hero (full viewport height), and a footer. Fill the remaining sections (minimum 5 more) from this pool — choose what fits the business: features/services, pricing, testimonials/social proof, stats/numbers, team, about, process/how-it-works, FAQ, CTA banner, gallery/portfolio. Each design should use a different selection of sections.
- Use CSS animations (fade-in, slide-up) for polish
- The page should look like a real, production-ready website — impressive typography, spacing, and color use
- Responsive (works at 1280px width)

The 3 designs MUST be dramatically different: vary the layout structure, color palette, typography scale, section arrangements, and overall visual personality. Think: one modern/bold, one clean/minimal, one warm/expressive.`

router.post('/generate', async (req, res) => {
  const { prompt } = req.body
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' })

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' })

    const result = await model.generateContent(DRAFT_PROMPT(prompt))
    const text = result.response.text()

    // Strip markdown fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const drafts = JSON.parse(cleaned)

    res.json({ drafts })
  } catch (err) {
    console.error('Draft generation error:', err)
    res.status(500).json({ error: err.message || 'Failed to generate drafts' })
  }
})

// List saved draft sessions (metadata only, no HTML)
router.get('/history', async (req, res) => {
  await fs.ensureDir(DRAFTS_DIR)
  const files = await fs.readdir(DRAFTS_DIR)
  const sessions = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const { id, prompt, generatedAt, drafts } = await fs.readJson(join(DRAFTS_DIR, file))
      sessions.push({ id, prompt, generatedAt, drafts: drafts.map(({ html: _html, ...meta }) => meta) })
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
