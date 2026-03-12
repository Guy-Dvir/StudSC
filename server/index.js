import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import draftsRouter from './routes/drafts.js'
import plansRouter from './routes/plans.js'

dotenv.config()

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use('/uploads', express.static(join(__dirname, '../artifacts/plans')))

app.use('/api/drafts', draftsRouter)
app.use('/api/plans', plansRouter)

// In production, serve the Vite build
const distPath = join(__dirname, '../dist')
app.use(express.static(distPath))
app.get('*', (req, res) => {
  res.sendFile(join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
