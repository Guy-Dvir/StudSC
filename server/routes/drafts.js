import express from 'express'
import { GoogleGenerativeAI } from '@google/generative-ai'

const router = express.Router()

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
- Structure: nav bar, hero section (full viewport height), features/services section (3 items), a testimonial or stats section, footer
- Use CSS animations (fade-in, slide-up) for polish
- The page should look like a real, production-ready website — impressive typography, spacing, and color use
- Responsive (works at 1280px width)
- Each homepage should include at least 5 sections, and no more than 10 sections.

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

export default router
