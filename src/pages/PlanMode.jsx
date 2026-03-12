import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Send, Paperclip, Zap, X, Download,
  FileText, Target, Map,
  CheckCircle2, Circle, Save, MessageSquare, ChevronRight, Upload,
  Image, FileType2, Film, Pencil,
} from 'lucide-react'
import { getPlan, sendChat, uploadFile, saveSection, generateDrafts } from '../lib/api.js'
import ThemeToggle from '../components/ThemeToggle.jsx'

const SECTIONS = [
  { id: 'goals-brief',       label: 'goals-brief.md',       display: 'Goals & Brief',       icon: Target   },
  { id: 'brand-theme',       label: 'brand-theme.md',       display: 'Brand & Theme',      icon: FileText },
  { id: 'sitemap-structure', label: 'sitemap-structure.md', display: 'Sitemap & Structure', icon: Map      },
]

function assetTypeInfo(file) {
  if (file.type.startsWith('image/')) return { label: 'Image',    Icon: Image,     color: 'var(--blue)'   }
  if (file.type.startsWith('video/')) return { label: 'Video',    Icon: Film,      color: 'var(--purple)' }
  if (file.type === 'application/pdf') return { label: 'PDF',     Icon: FileType2, color: 'var(--red)'    }
  return { label: 'File', Icon: FileText, color: 'var(--text-3)' }
}

const ease = [0.22, 1, 0.36, 1]

/* ── AvatarFace ─────────────────────────────────────────── */
function AvatarFace({ size = 44 }) {
  const ref = useRef(null)
  const [p, setP] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const onMove = (e) => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx)
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
      const pull = Math.min(dist / 40, 1) * (size * 0.22)
      setP({ x: Math.cos(angle) * pull, y: Math.sin(angle) * pull })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [size])

  const eyeW = Math.max(3, Math.round(size * 0.11))
  const eyeH = Math.max(5, Math.round(size * 0.17))
  const eye = (side) => ({
    position: 'absolute',
    width: eyeW, height: eyeH,
    background: 'var(--bg)',
    borderRadius: 99,
    top: '54%',
    left: `calc(50% + ${side * size * 0.17}px)`,
    transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`,
    transition: 'transform 0.06s ease-out',
  })

  return (
    <div ref={ref} style={{ width: size, height: size, borderRadius: '50%', background: 'var(--text)', position: 'relative', flexShrink: 0 }}>
      <div style={eye(-1)} />
      <div style={eye(1)} />
    </div>
  )
}

/* ── SkeletonLines ──────────────────────────────────────── */
const SKELETON_ROWS = [
  { w: '55%', h: 20 }, { w: '82%', h: 13 }, { w: '91%', h: 13 }, { w: '67%', h: 13 },
  { w: '38%', h: 17 }, { w: '88%', h: 13 }, { w: '76%', h: 13 }, { w: '93%', h: 13 },
  { w: '50%', h: 13 }, { w: '42%', h: 17 }, { w: '85%', h: 13 }, { w: '71%', h: 13 },
]
function SkeletonLines() {
  return (
    <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {SKELETON_ROWS.map((r, i) => (
        <motion.div key={i}
          style={{ width: r.w, height: r.h, borderRadius: 5, background: 'var(--bg-raised)' }}
          animate={{ opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.06 }}
        />
      ))}
    </div>
  )
}

/* ── Markdown renderer ──────────────────────────────────── */
function inlineMd(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g)
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92em', background: 'var(--bg-raised)', padding: '1px 5px', borderRadius: 4 }}>{p.slice(1, -1)}</code>
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if ((p.startsWith('*') && p.endsWith('*')) || (p.startsWith('_') && p.endsWith('_'))) return <em key={i}>{p.slice(1, -1)}</em>
    return p
  })
}

function MarkdownView({ content }) {
  const lines = (content || '').split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <pre key={i} style={s.mdPre}>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>{codeLines.join('\n')}</code>
        </pre>
      )
      i++
      continue
    }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={s.mdH3}>{inlineMd(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={s.mdH2}>{inlineMd(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={s.mdH1}>{inlineMd(line.slice(2))}</h1>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <p key={i} style={{ paddingLeft: 16, position: 'relative', marginBottom: 3, fontSize: 13, lineHeight: 1.75, color: 'var(--text-2)' }}>
          <span style={{ position: 'absolute', left: 4, opacity: 0.45 }}>·</span>
          {inlineMd(line.slice(2))}
        </p>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 8 }} />)
    } else {
      elements.push(<p key={i} style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text-2)', marginBottom: 3 }}>{inlineMd(line)}</p>)
    }
    i++
  }

  return <div style={{ padding: '22px 28px', overflow: 'auto', flex: 1 }}>{elements}</div>
}

/* ── Visual enrichment helpers ──────────────────────────── */
function parseFonts(md) {
  const results = [], seen = new Set()
  // handles **Label:** *FontName* — negative lookahead excludes color names like "Midnight Onyx (#hex)"
  const re = /\*\*([^*]+?)\*\*:?\s*(?:\*([A-Za-z][A-Za-z\s]+?)\*|([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+))(?=\s|,|–|-|$)(?!\s*\(#)/gm
  let m
  while ((m = re.exec(md)) !== null) {
    const label = m[1].trim().replace(/:$/, '')
    const fontName = (m[2] || m[3] || '').trim()
    // skip if label is too long (not a font role name) or fontName looks like a color/place
    if (label.length > 25) continue
    if (fontName.length >= 3 && !seen.has(fontName)) {
      seen.add(fontName); results.push({ label, fontName })
    }
  }
  return results
}

function parseSitemapTree(md) {
  const root = [], stack = [{ depth: -1, children: root }]
  for (const line of (md || '').split('\n')) {
    const m = line.match(/^(\s*)[*-]\s+(.+)/)
    if (!m) continue
    const depth = Math.floor(m[1].length / 2)
    const name = m[2].replace(/\*\*/g, '').replace(/\s*\([^)]*\)/g, '').trim()
    const node = { name, children: [] }
    while (stack.length > 1 && stack[stack.length-1].depth >= depth) stack.pop()
    stack[stack.length-1].children.push(node)
    stack.push({ depth, children: node.children })
  }
  return root
}

const CONTENT_ICONS = [
  [/\b(images?|photos?|photography|banners?|headshots?|heros?|thumbnails?)\b/i, '🖼'],
  [/\b(videos?|animations?|reels?|films?|screencasts?)\b/i,                     '▶'],
  [/\b(copy|copies|article|blog|writing|text|intro|testimonial|bio)s?\b/i,      '✍'],
  [/\b(icons?|logos?|svg|illustrations?|graphics?)\b/i,                         '◆'],
]
function contentTypeIcon(text) {
  for (const [re, icon] of CONTENT_ICONS) if (re.test(text)) return icon
  return null
}

/* ── GenSummaryWidget ───────────────────────────────────── */
function GenSummaryWidget({ sections }) {
  return (
    <div style={s.genSummaryCard}>
      <div style={s.genSummaryHeader}>
        <CheckCircle2 size={12} color="var(--amber)" />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)' }}>Plan generated</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sections.map((sec, i) => (
          <motion.div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: i * 0.07 }}
          >
            <CheckCircle2 size={10} color="var(--green)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{sec.display}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default function PlanMode({ theme, onToggleTheme }) {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { state } = useLocation()

  const [plan,           setPlan]          = useState(null)
  const [activeFile,     setActiveFile]    = useState(SECTIONS[0].id)
  const [editContent,    setEditContent]   = useState('')
  const [saveStatus,     setSaveStatus]    = useState('saved')
  const [messages,       setMessages]      = useState([])
  const [input,          setInput]         = useState('')
  const [sending,        setSending]       = useState(false)
  const [uploads,        setUploads]       = useState([])
  const [error,          setError]         = useState('')
  const [generating,     setGenerating]    = useState(false)
  const [generatingPlan,      setGeneratingPlan]      = useState(false)
  const [hasStartedStreaming, setHasStartedStreaming] = useState(false)
  const [genLines,            setGenLines]            = useState([])
  const [sectionStatus,       setSectionStatus]       = useState({})
  const [hoveredFile,    setHoveredFile]    = useState(null)
  const [siteAssets,       setSiteAssets]       = useState([])
  const [renamingPlan,     setRenamingPlan]     = useState(false)
  const [planNameDraft,    setPlanNameDraft]    = useState('')
  const [hoverPlanName,    setHoverPlanName]    = useState(false)
  const [chatFocused,      setChatFocused]      = useState(false)
  const [chatGlowPos,      setChatGlowPos]      = useState(null)
  const [chatCaretVisible, setChatCaretVisible] = useState(true)

  const bottomRef    = useRef(null)
  const genBottomRef = useRef(null)
  const fileRef      = useRef(null)
  const assetRef     = useRef(null)
  const chatWrapRef  = useRef(null)
  const chatBlinkRef = useRef(null)
  const chatBlinkTO  = useRef(null)
  const inputRef     = useRef(null)
  const saveTimer    = useRef(null)
  const esRef        = useRef(null)
  const typingRef    = useRef(null)

  useEffect(() => () => {
    esRef.current?.close()
    clearInterval(typingRef.current)
    clearInterval(chatBlinkRef.current)
    clearTimeout(chatBlinkTO.current)
  }, [])

  const updateChatGlow = useCallback(() => {
    const ta = inputRef.current, wrap = chatWrapRef.current
    if (!ta || !wrap) return
    const cs = window.getComputedStyle(ta)
    const taRect = ta.getBoundingClientRect()
    const m = document.createElement('div')
    m.style.cssText = [
      'position:fixed', `top:${taRect.top}px`, `left:${taRect.left}px`,
      `width:${taRect.width}px`, `padding:${cs.padding}`,
      `font-family:${cs.fontFamily}`, `font-size:${cs.fontSize}`,
      `line-height:${cs.lineHeight}`, 'white-space:pre-wrap',
      'word-wrap:break-word', 'box-sizing:border-box',
      'overflow:hidden', 'visibility:hidden', 'pointer-events:none',
    ].join(';')
    m.appendChild(document.createTextNode(ta.value.substring(0, ta.selectionStart)))
    const mark = document.createElement('span')
    mark.textContent = '\u200b'
    m.appendChild(mark)
    document.body.appendChild(m)
    const mr = mark.getBoundingClientRect(), wr = wrap.getBoundingClientRect()
    const lh = parseFloat(cs.lineHeight) || 20
    document.body.removeChild(m)
    setChatGlowPos({ x: mr.left - wr.left, y: mr.top - wr.top + lh * 0.35 })
  }, [])

  const stopChatBlink = useCallback(() => {
    clearInterval(chatBlinkRef.current); clearTimeout(chatBlinkTO.current)
  }, [])

  const startChatBlink = useCallback(() => {
    stopChatBlink()
    setChatCaretVisible(true)
    chatBlinkTO.current = setTimeout(() => {
      chatBlinkRef.current = setInterval(() => setChatCaretVisible(v => !v), 530)
    }, 530)
  }, [stopChatBlink])

  useEffect(() => {
    if (!id || id === 'new') { navigate('/'); return }
    getPlan(id).then(data => {
      setPlan(data)
      const firstFilled = SECTIONS.find(s => data.sections?.[s.id]?.trim()) || SECTIONS[0]
      setActiveFile(firstFilled.id)
      setEditContent(data.sections?.[firstFilled.id] || '')
      if (state?.autoGenerate) {
        startGeneration(id)
      }
    }).catch(() => navigate('/'))
  }, [id])

  const activeSectionContent = plan?.sections?.[activeFile]
  useEffect(() => {
    if (saveStatus === 'saved') setEditContent(activeSectionContent || '')
  }, [activeFile, activeSectionContent])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    genBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [genLines])

  function typeContent(content) {
    clearInterval(typingRef.current)
    let pos = 0
    setEditContent('')
    typingRef.current = setInterval(() => {
      pos = Math.min(pos + 10, content.length)
      setEditContent(content.slice(0, pos))
      if (pos >= content.length) clearInterval(typingRef.current)
    }, 16)
  }

  function startGeneration(planId) {
    setGeneratingPlan(true)
    setHasStartedStreaming(false)
    setGenLines([{ type: 'working', text: 'Analyzing your brief…' }])
    setSectionStatus({})

    const linesLog = []
    const streamBuf = {}  // accumulate content per section
    const es = new EventSource(`/api/plans/${planId}/generate`)
    esRef.current = es

    es.addEventListener('section_start', e => {
      const { id: secId } = JSON.parse(e.data)
      const sec = SECTIONS.find(s => s.id === secId)
      streamBuf[secId] = ''
      setSectionStatus(p => ({ ...p, [secId]: 'writing' }))
      setGenLines(p => [...p, { type: 'working', text: `Writing ${sec?.display}…`, id: secId }])
      setActiveFile(secId)
      setEditContent('')
      setHasStartedStreaming(true)
    })

    es.addEventListener('section_chunk', e => {
      const { id: secId, chunk } = JSON.parse(e.data)
      streamBuf[secId] = (streamBuf[secId] || '') + chunk
      setEditContent(streamBuf[secId])
    })

    es.addEventListener('section_done', e => {
      const { id: secId, content } = JSON.parse(e.data)
      const sec = SECTIONS.find(s => s.id === secId)
      setSectionStatus(p => ({ ...p, [secId]: 'done' }))
      setPlan(p => p ? { ...p, sections: { ...p.sections, [secId]: content } } : p)
      setGenLines(p => p.map(l => l.id === secId ? { ...l, type: 'done' } : l))
      if (sec) linesLog.push({ id: secId, display: sec.display })
    })

    es.addEventListener('fail', e => {
      const { message } = JSON.parse(e.data)
      setError(message)
      setGeneratingPlan(false)
      esRef.current = null
      es.close()
    })

    es.addEventListener('done', () => {
      setGeneratingPlan(false)
      setSectionStatus({})
      setGenLines(p => [...p, { type: 'complete', text: `All ${SECTIONS.length} sections ready.` }])
      esRef.current = null
      es.close()
      if (linesLog.length > 0) {
        setMessages(p => [{ role: 'system', type: 'gen-summary', sections: [...linesLog], ts: Date.now() }, ...p])
      }
    })

    es.onerror = () => {
      if (esRef.current === es) {
        setGeneratingPlan(false)
        setError('Generation stream failed. Try refreshing.')
        esRef.current = null
        es.close()
      }
    }
  }

  function startRename() {
    setPlanNameDraft(plan.name)
    setRenamingPlan(true)
  }

  function commitRename() {
    if (planNameDraft.trim()) setPlan(p => ({ ...p, name: planNameDraft.trim() }))
    setRenamingPlan(false)
    setHoverPlanName(false)
  }

  function openFile(sectionId) {
    setActiveFile(sectionId)
    setSaveStatus('saved')
  }

  const handleEdit = useCallback((val) => {
    setEditContent(val)
    setSaveStatus('unsaved')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await saveSection(id, activeFile, val)
        setPlan(p => ({ ...p, sections: { ...p.sections, [activeFile]: val } }))
        setSaveStatus('saved')
      } catch {
        setSaveStatus('unsaved')
      }
    }, 600)
  }, [id, activeFile])

  async function send() {
    if (!input.trim() || sending || generatingPlan) return
    const msg = { role: 'user', content: input.trim(), ts: Date.now() }
    setMessages(p => [...p, msg])
    setInput('')
    setSending(true); setError('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    try {
      const res = await sendChat(id, msg.content)
      setMessages(p => [...p, { role: 'assistant', content: res.message, ts: Date.now() }])
      setPlan(p => ({ ...p, sections: res.sections }))
      if (res.sections) {
        const updated = SECTIONS.filter(s => res.sections[s.id] !== plan?.sections?.[s.id])
        updated.forEach(s => {
          setSectionStatus(p => ({ ...p, [s.id]: 'done' }))
          setTimeout(() => setSectionStatus(p => { const n = { ...p }; delete n[s.id]; return n }), 2000)
        })
        if (updated.length > 0) {
          setMessages(p => [...p, { role: 'system', type: 'file-edit', files: updated.map(s => s.id), ts: Date.now() + 1 }])
        }
        if (res.sections[activeFile] && res.sections[activeFile] !== plan?.sections?.[activeFile]) {
          typeContent(res.sections[activeFile])
        }
      }
    } catch { setError('Send failed. Check your API key.') }
    finally { setSending(false) }
  }

  async function onUpload(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      await uploadFile(id, file)
      setUploads(p => [...p, file.name])
      setInput(`I've uploaded "${file.name}" — incorporate it into the plan.`)
    } catch { setError('Upload failed.') }
    finally { e.target.value = '' }
  }

  function onAssetUpload(e) {
    Array.from(e.target.files).forEach(file => {
      const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      setSiteAssets(p => [...p, { name: file.name, type: file.type, size: file.size, url }])
    })
    e.target.value = ''
  }

  async function handleGenerate() {
    if (!plan || generating) return
    setGenerating(true); setError('')
    try {
      const planContext = SECTIONS
        .filter(s => plan.sections?.[s.id]?.trim())
        .map(s => `## ${s.display}\n${plan.sections[s.id]}`)
        .join('\n\n')
      const prompt = `Based on this comprehensive website plan:\n\n${planContext}\n\nGenerate 3 homepage designs that faithfully reflect the brand, goals, and aesthetic direction described above.`
      const { drafts } = await generateDrafts(prompt)
      navigate('/quick-draft', { state: { drafts, prompt: plan.name, fromPlan: true } })
    } catch (err) {
      setError(err.message)
      setGenerating(false)
    }
  }

  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadAll() {
    const combined = SECTIONS
      .filter(s => plan?.sections?.[s.id]?.trim())
      .map(s => `# ${s.display}\n\n${plan.sections[s.id]}`)
      .join('\n\n---\n\n')
    const slug = plan.name.toLowerCase().replace(/\s+/g, '-').slice(0, 30)
    downloadFile(`${slug}-plan.md`, combined)
  }

  const filled   = plan ? SECTIONS.filter(s => plan.sections?.[s.id]?.trim()) : []
  const progress = Math.round((filled.length / SECTIONS.length) * 100)
  const activeSection = SECTIONS.find(s => s.id === activeFile)

  if (!plan) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', gap: 20 }}>
      <motion.div
        style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--amber-border)', borderTopColor: 'var(--amber)' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
      <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading…</p>
    </div>
  )

  return (
    <div style={s.root}>

      {/* ── Top bar ── */}
      <div style={s.topBar}>
        <div style={s.topLeft}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ padding: '5px 10px' }}>
            <ArrowLeft size={13} />
          </button>
          <div style={s.topDivider} />
          <div
            style={s.projNameWrap}
            onMouseEnter={() => setHoverPlanName(true)}
            onMouseLeave={() => setHoverPlanName(false)}
          >
            {renamingPlan ? (
              <input
                autoFocus
                value={planNameDraft}
                onChange={e => setPlanNameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingPlan(false) }}
                style={s.projNameInput}
              />
            ) : (
              <>
                <span style={s.projName}>{plan.name}</span>
                <button
                  onClick={startRename}
                  style={{ ...s.renameBtn, opacity: hoverPlanName ? 1 : 0 }}
                  title="Rename"
                >
                  <Pencil size={11} />
                </button>
              </>
            )}
          </div>
          {generatingPlan && (
            <motion.span
              style={s.genBadge}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            >
              <motion.span
                style={{ display: 'block', width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }}
                animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }}
              />
              Generating…
            </motion.span>
          )}
        </div>

        <div style={s.topRight}>
          {error && (
            <span style={s.errBadge}>
              {error}
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center' }}><X size={11} /></button>
            </span>
          )}
          {filled.length > 0 && (
            <button className="btn btn-ghost" onClick={downloadAll} style={{ gap: 6 }}>
              <Download size={13} />
              Export Plan
            </button>
          )}
          <motion.button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating || generatingPlan || filled.length === 0}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            {generating ? <Spinner /> : <Zap size={14} />}
            {generating ? 'Generating…' : 'Generate Homepage'}
            {!generating && <ChevronRight size={13} />}
          </motion.button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>

      {/* ── Main panels ── */}
      <div style={s.panels}>

        {/* Chat panel — LEFT */}
        <div style={{ ...s.chatPanel, flexGrow: (generatingPlan && !hasStartedStreaming) ? 2 : 1, transition: 'flex-grow 0.7s cubic-bezier(0.22,1,0.36,1)' }}>
          <div style={s.panelHead}>
            {generatingPlan
              ? <span style={{ ...s.panelLabel, color: 'var(--amber)' }}>Generating</span>
              : <span style={s.panelLabel}>Aria</span>
            }
          </div>

          {generatingPlan ? (
            <div style={s.genLog}>
              {/* Progress bar */}
              {(() => {
                const total = SECTIONS.length
                const done = genLines.filter(l => l.type === 'complete' || l.type === 'done').length
                const pct = Math.round((done / total) * 100)
                return (
                  <div style={{ padding: '0 20px', marginBottom: 24 }}>
                    <div style={{ height: 3, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                      <motion.div
                        style={{ height: '100%', borderRadius: 99, background: 'var(--amber)', transformOrigin: 'left' }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                )
              })()}

              {/* Step rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 16px' }}>
                <AnimatePresence initial={false}>
                  {genLines.map((line, i) => {
                    const isDone = line.type === 'complete' || line.type === 'done'
                    const isActive = line.type === 'working'
                    return (
                      <motion.div
                        key={i}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 12px', borderRadius: 10,
                          background: isActive ? 'var(--bg-elevated)' : 'transparent',
                          border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
                          transition: 'background 0.3s, border-color 0.3s',
                        }}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {isDone ? (
                          <motion.div
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          >
                            <CheckCircle2 size={14} color="var(--green)" />
                          </motion.div>
                        ) : (
                          <motion.div
                            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }}
                            animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        )}
                        <span style={{
                          fontSize: 12.5, fontFamily: 'var(--font-ui)', lineHeight: 1.4,
                          color: isDone ? 'var(--text-3)' : 'var(--text)',
                          fontWeight: isActive ? 500 : 400,
                          textDecoration: isDone ? 'none' : 'none',
                        }}>
                          {line.text}
                        </span>
                        {isActive && (
                          <motion.span
                            style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--amber)', fontFamily: 'var(--font-ui)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.4, repeat: Infinity }}
                          >
                            writing
                          </motion.span>
                        )}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>

              <div ref={genBottomRef} />
            </div>
          ) : (
            <div style={s.msgs}>
              {messages.length === 0 && (
                <div style={s.chatEmpty}>
                  <AvatarFace size={52} />
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4 }}>How can I help?</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    Ask me to refine a section,<br />adjust tone, or add detail.
                  </p>
                </div>
              )}
              <AnimatePresence initial={false}>
                {messages.map((m, i) => {
                  if (m.type === 'gen-summary') {
                    return (
                      <motion.div key={m.ts || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease }}>
                        <GenSummaryWidget sections={m.sections} />
                      </motion.div>
                    )
                  }
                  if (m.type === 'file-edit') {
                    return (
                      <motion.div key={m.ts || i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease }}>
                        <FileEditWidget files={m.files} />
                      </motion.div>
                    )
                  }
                  return (
                    <motion.div
                      key={m.ts || i}
                      style={{ ...s.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease }}
                    >
                      <div style={{ ...s.bubble, ...(m.role === 'user' ? s.bubbleUser : s.bubbleAI) }}>
                        <MsgContent content={m.content} />
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              {sending && (
                <motion.div style={{ ...s.msgRow, justifyContent: 'flex-start' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div style={{ padding: '6px 4px' }}><ThinkDots /></div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {messages.length > 0 && (
            <div style={{ padding: '4px 12px 6px 12px' }}>
              <AvatarFace size={34} />
            </div>
          )}

          <motion.div
            ref={chatWrapRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: generatingPlan ? 0.4 : 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            style={{
              ...s.chatInputCard,
              marginBottom: messages.length === 0 ? 24 : 10,
              pointerEvents: generatingPlan ? 'none' : 'auto',
              boxShadow: chatFocused
                ? 'var(--shadow-md), 0 0 0 1px rgba(90,132,166,0.25), 0 0 32px rgba(90,132,166,0.08)'
                : 'var(--shadow-md)',
            }}
          >
            <input type="file" ref={fileRef} onChange={onUpload} style={{ display: 'none' }} />

            {/* Fake caret glow */}
            {chatFocused && chatGlowPos && (
              <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 0, opacity: chatCaretVisible ? 1 : 0 }}>
                {theme === 'dark' && (
                  <div style={{
                    position: 'absolute',
                    left: chatGlowPos.x - 5, top: chatGlowPos.y - 18,
                    width: 120, height: 32,
                    background: 'radial-gradient(ellipse 10% 80% at 3% 50%, rgba(210,215,255,0.95) 0%, rgba(170,180,255,0.65) 12%, rgba(130,148,255,0.28) 38%, transparent 62%)',
                    filter: 'blur(3px)',
                  }} />
                )}
                <div style={{
                  position: 'absolute',
                  left: chatGlowPos.x - 0.5, top: chatGlowPos.y - 8,
                  width: 2, height: 14,
                  background: theme === 'dark' ? 'rgba(220,225,255,0.95)' : '#4A7BD4',
                  borderRadius: 1,
                  boxShadow: theme === 'dark'
                    ? 'none'
                    : '-1px -1px 3px rgba(255,255,255,0.92), 1px 1px 4px rgba(0,0,0,0.18)',
                }} />
              </div>
            )}

            <textarea
              ref={inputRef}
              value={input}
              placeholder={generatingPlan ? 'Generating plan…' : 'Refine a section…'}
              rows={2}
              disabled={sending || generatingPlan}
              style={{ ...s.chatTA, position: 'relative', zIndex: 1, caretColor: chatFocused ? 'transparent' : undefined }}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
                updateChatGlow(); startChatBlink()
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              onFocus={() => { setChatFocused(true); updateChatGlow(); startChatBlink() }}
              onBlur={() => { setChatFocused(false); stopChatBlink(); setChatCaretVisible(true) }}
              onKeyUp={updateChatGlow}
              onClick={updateChatGlow}
            />
            <div style={s.chatInputFooter}>
              <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()} title="Upload file" style={{ padding: '4px 6px' }}>
                <Paperclip size={12} />
              </button>
              <button className="btn btn-primary btn-xs" onClick={send} disabled={!input.trim() || sending || generatingPlan}>
                <Send size={11} />
              </button>
            </div>
          </motion.div>
        </div>

        <div style={s.divider} />

        {/* File Explorer */}
        <div style={s.explorer}>
          <div style={s.panelHead}>
            <span style={s.panelLabel}>Context & Files</span>
          </div>

          <div style={s.fileList}>
            {SECTIONS.map((sec, secIdx) => {
              const Icon      = sec.icon
              const isDone    = plan.sections?.[sec.id]?.trim().length > 0
              const isActive  = activeFile === sec.id
              const wc        = plan.sections?.[sec.id]?.trim().split(/\s+/).filter(Boolean).length || 0
              const genStatus = sectionStatus[sec.id]
              const iconColor = genStatus === 'writing' || isActive ? 'var(--amber)' : isDone ? 'var(--amber)' : 'var(--text-3)'

              return (
                <motion.button
                  key={sec.id}
                  style={{
                    ...s.fileCard,
                    ...(isActive ? s.fileCardActive : isDone ? s.fileCardDone : {}),
                    ...(genStatus === 'writing' ? s.fileCardWriting : {}),
                  }}
                  onClick={() => openFile(sec.id)}
                  onMouseEnter={() => setHoveredFile(sec.id)}
                  onMouseLeave={() => setHoveredFile(null)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -1 }}
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1], delay: 0.1 + secIdx * 0.08 }}
                >
                  <div style={s.fileCardTop}>
                    <Icon size={13} color={iconColor} strokeWidth={1.6} />
                    <span style={{ ...s.fileCardDisplay, color: isActive ? 'var(--text)' : isDone ? 'var(--text)' : 'var(--text-3)' }}>
                      {sec.display}
                    </span>
                    <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      {genStatus === 'writing' ? (
                        <motion.div
                          style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--amber-border)', borderTopColor: 'var(--amber)' }}
                          animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                        />
                      ) : genStatus === 'done' ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                          <CheckCircle2 size={11} color="var(--green)" />
                        </motion.div>
                      ) : isDone ? (
                        <CheckCircle2 size={11} color="var(--green)" />
                      ) : (
                        <Circle size={11} color="var(--border)" />
                      )}
                    </div>
                  </div>
                  <div style={s.fileCardBottom}>
                    <span style={s.fileCardLabel}>{sec.label}</span>
                    {isDone && <span style={s.fileCardWc}>{wc}w</span>}
                  </div>
                </motion.button>
              )
            })}
          </div>

          {/* ── Site Assets ── */}
          <motion.div style={s.assetsDivider}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.42 }}
          />
          <motion.div style={s.assetsPanel}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.45 }}
          >
            <div style={s.assetsPanelHead}>
              <p style={s.assetsPanelTitle}>Site Assets</p>
              <p style={s.assetsPanelSub}>Assets & content that will be used in the website as-is</p>
            </div>
            <input ref={assetRef} type="file" multiple onChange={onAssetUpload} style={{ display: 'none' }} accept="image/*,video/*,.pdf,.txt,.md,.doc,.docx" />
            {siteAssets.length === 0 ? (
              <button style={s.assetsDropZone} onClick={() => assetRef.current?.click()}>
                <Upload size={13} color="var(--text-3)" />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Drop files or click to upload</span>
              </button>
            ) : (
              <div style={s.assetsList}>
                {siteAssets.map((asset, i) => {
                  const { label, Icon: AIcon, color } = assetTypeInfo(asset)
                  return (
                    <motion.div key={asset.name + i} style={s.assetRow}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {asset.url
                        ? <img src={asset.url} alt="" style={s.assetThumb} />
                        : <div style={{ ...s.assetThumbPlaceholder, background: `color-mix(in srgb, ${color} 12%, var(--bg-raised))` }}>
                            <AIcon size={11} color={color} />
                          </div>
                      }
                      <div style={s.assetMeta}>
                        <span style={s.assetName}>{asset.name}</span>
                        <span style={{ ...s.assetType, color }}>{label}</span>
                      </div>
                    </motion.div>
                  )
                })}
                <button style={s.assetsAddMore} onClick={() => assetRef.current?.click()}>
                  <Upload size={10} color="var(--text-3)" /> <span>Add more</span>
                </button>
              </div>
            )}
          </motion.div>
        </div>

        <div style={{ ...s.divider, opacity: (generatingPlan && !hasStartedStreaming) ? 0 : 1, transition: 'opacity 0.4s ease' }} />

        {/* Editor panel — remaining */}
        <div style={{ ...s.editor, flexGrow: (generatingPlan && !hasStartedStreaming) ? 0 : 3, opacity: (generatingPlan && !hasStartedStreaming) ? 0 : 1, transition: 'flex-grow 0.7s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease' }}>
          <div style={s.panelHead}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {activeSection && <activeSection.icon size={12} color="var(--amber)" strokeWidth={1.7} />}
              <span style={s.editorFileName}>{activeSection?.label}</span>
              {sectionStatus[activeFile] === 'writing' && (
                <motion.span
                  style={{ fontSize: 10.5, color: 'var(--amber)', fontFamily: 'var(--font-ui)' }}
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }}
                >
                  writing…
                </motion.span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SaveIndicator status={saveStatus} />
              {editContent?.trim() && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => downloadFile(activeSection?.label, editContent)}
                  style={{ gap: 5, fontSize: 11, padding: '4px 8px' }}
                >
                  <Download size={11} />
                  Download .md
                </button>
              )}
            </div>
          </div>

          {activeFile === 'brand-theme' && <ColorPaletteBar content={editContent} />}
          {activeFile === 'brand-theme' && <FontPreviewBar content={editContent} />}
          {activeFile === 'sitemap-structure' && <SitemapCardGrid content={editContent} />}

          {/* Skeleton while writing, fade-in content when done */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <AnimatePresence>
              {sectionStatus[activeFile] === 'writing' && (
                <motion.div key="skeleton" style={{ position: 'absolute', inset: 0, overflowY: 'auto', zIndex: 1 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <SkeletonLines />
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              style={{ height: '100%', overflow: 'auto' }}
              animate={{ opacity: sectionStatus[activeFile] === 'writing' ? 0 : 1 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <WysiwygEditor
                value={editContent}
                onChange={handleEdit}
                placeholder={generatingPlan ? 'AI is filling this section…' : 'Start writing or ask AI to fill this section…'}
                readOnly={generatingPlan}
                sectionId={activeFile}
              />
            </motion.div>
          </div>
        </div>

      </div>
    </div>
  )
}

/* ── FileEditWidget ────────────────────────────────────── */
function FileEditWidget({ files }) {
  return (
    <div style={s.fileEditWidget}>
      <span style={s.fileEditHeader}>Files updated</span>
      {files.map(fileId => {
        const sec = SECTIONS.find(s => s.id === fileId)
        const Icon = sec?.icon
        return (
          <div key={fileId} style={s.fileEditRow}>
            {Icon && <Icon size={10} color="var(--green)" strokeWidth={1.7} />}
            <span style={s.fileEditName}>{sec?.label}</span>
            <CheckCircle2 size={9} color="var(--green)" />
          </div>
        )
      })}
    </div>
  )
}

/* ── ColorPaletteBar ───────────────────────────────────── */
function ColorPaletteBar({ content }) {
  const hexes = [...new Set((content || '').match(/#[0-9A-Fa-f]{6}\b/gi) || [])]
  if (!hexes.length) return null
  return (
    <motion.div style={s.paletteBar} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      {hexes.map((hex, i) => (
        <motion.div key={hex} style={s.paletteSwatch}
          initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }}
        >
          <div style={{ ...s.paletteColor, background: hex }} />
          <span style={s.paletteHexLabel}>{hex.toUpperCase()}</span>
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ── FontPreviewBar ────────────────────────────────────── */
function fontSpecimen(label) {
  if (/heading|title|display|h1|h2|header/i.test(label))
    return { sample: 'The Quick Brown Fox', fontSize: 22, fontWeight: 700, lineHeight: 1.2 }
  if (/body|text|paragraph|copy|content/i.test(label))
    return { sample: 'The quick brown fox jumps over the lazy dog', fontSize: 13, fontWeight: 400, lineHeight: 1.6 }
  return { sample: 'The Quick Brown Fox', fontSize: 16, fontWeight: 500, lineHeight: 1.3 }
}

function FontPreviewBar({ content }) {
  const fonts = useMemo(() => parseFonts(content || ''), [content])
  useEffect(() => {
    fonts.forEach(({ fontName }) => {
      const slug = fontName.replace(/\s+/g, '+')
      const id = `gfont-${slug}`
      if (document.querySelector(`[data-gfont="${id}"]`)) return
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${slug}:ital,wght@0,400;0,700;1,400&display=swap`
      link.setAttribute('data-gfont', id)
      document.head.appendChild(link)
    })
  }, [fonts])
  if (!fonts.length) return null
  return (
    <motion.div style={s.fontBar} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      {fonts.map(({ label, fontName }) => {
        const { sample, fontSize, fontWeight, lineHeight } = fontSpecimen(label)
        return (
          <div key={fontName} style={s.fontSwatch}>
            <span style={s.fontRoleLabel}>{label}</span>
            <span style={{ fontFamily: `"${fontName}", serif`, fontSize, fontWeight, lineHeight, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {sample}
            </span>
            <span style={s.fontNameLabel}>{fontName}</span>
          </div>
        )
      })}
    </motion.div>
  )
}

/* ── SitemapCardGrid ───────────────────────────────────── */
function SitemapCardGrid({ content }) {
  const tree = useMemo(() => parseSitemapTree(content), [content])
  if (!tree.length) return null
  return (
    <motion.div style={s.sitemapBar} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      <div style={s.sitemapScroll}>
        {tree.map((page, i) => (
          <motion.div key={i} style={s.sitemapCard}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
          >
            <span style={s.sitemapCardName}>{page.name}</span>
            {page.children.length > 0 && (
              <div style={s.sitemapChildren}>
                {page.children.slice(0, 4).map((c, j) => (
                  <span key={j} style={s.sitemapChip}>{c.name}</span>
                ))}
                {page.children.length > 4 && (
                  <span style={{ ...s.sitemapChip, opacity: 0.45 }}>+{page.children.length - 4}</span>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

/* ── WysiwygEditor ─────────────────────────────────────── */
function WysiwygEditor({ value, onChange, placeholder, readOnly, sectionId }) {
  const ref = useRef(null)
  const isFocused = useRef(false)
  const lastMd = useRef(null)
  const [isEmpty, setIsEmpty] = useState(!value?.trim())

  useEffect(() => {
    if (document.querySelector('[data-wysiwyg-md]')) return
    const style = document.createElement('style')
    style.setAttribute('data-wysiwyg-md', '1')
    style.textContent = `
      .wysiwyg-md { caret-color: var(--amber); outline: none; }
      .wysiwyg-md h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); margin: 4px 0 10px; line-height: 1.3; }
      .wysiwyg-md h2 { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); margin: 18px 0 7px; line-height: 1.4; }
      .wysiwyg-md h3 { font-size: 13px; font-weight: 600; color: var(--text-2); margin: 14px 0 5px; line-height: 1.4; }
      .wysiwyg-md p  { font-size: 13px; line-height: 1.75; color: var(--text-2); margin: 0 0 3px; }
      .wysiwyg-md ul { padding-left: 20px; margin: 0 0 4px; }
      .wysiwyg-md li { font-size: 13px; line-height: 1.75; color: var(--text-2); margin-bottom: 2px; }
      .wysiwyg-md code { font-family: var(--font-mono); font-size: 0.92em; background: var(--bg-raised); padding: 1px 5px; border-radius: 4px; }
      .wysiwyg-md pre { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin: 8px 0; overflow: auto; }
      .wysiwyg-md .color-chip { display:inline-flex; align-items:center; gap:6px; padding:2px 9px 2px 5px; border-radius:100px; background:var(--bg-raised); border:1px solid var(--border); font-family:var(--font-ui); font-size:0.85em; font-weight:500; color:var(--text-2); letter-spacing:0.01em; cursor:default; user-select:none; vertical-align:middle; white-space:nowrap; }
      .wysiwyg-md .color-chip::before { content:''; display:inline-block; width:12px; height:12px; border-radius:50%; background:var(--chip-color); box-shadow:inset 0 1px 0 rgba(255,255,255,0.25),0 1px 3px rgba(0,0,0,0.18); flex-shrink:0; }
      .wysiwyg-md .content-type-icon { user-select:none; cursor:default; font-style:normal; }
      .wysiwyg-sitemap ul { list-style:none; padding-left:0; margin-left:12px; border-left:1.5px solid var(--border-mid); }
      .wysiwyg-sitemap > ul { border-left:none; margin-left:0; }
      .wysiwyg-sitemap li { position:relative; padding-left:18px; margin-bottom:4px; }
      .wysiwyg-sitemap li::before { content:''; position:absolute; left:0; top:0.875em; width:14px; height:1.5px; background:var(--border-mid); }
    `
    document.head.appendChild(style)
  }, [])

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function inlineToHtml(text) {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|#[0-9A-Fa-f]{6}\b)/g)
    return parts.map(p => {
      if (p.startsWith('`') && p.endsWith('`')) return `<code>${esc(p.slice(1,-1))}</code>`
      if (p.startsWith('**') && p.endsWith('**')) return `<strong>${esc(p.slice(2,-2))}</strong>`
      if (p.startsWith('*') && p.endsWith('*')) return `<em>${esc(p.slice(1,-1))}</em>`
      if (/^#[0-9A-Fa-f]{6}$/i.test(p)) return `<span class="color-chip" contenteditable="false" style="--chip-color:${p}">${esc(p)}</span>`
      return esc(p)
    }).join('')
  }

  function mdToHtml(md, sectionId) {
    if (!md) return ''
    const out = []; let inList = false
    for (const line of md.split('\n')) {
      if (line.startsWith('### ')) { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h3>${inlineToHtml(line.slice(4))}</h3>`) }
      else if (line.startsWith('## ')) { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h2>${inlineToHtml(line.slice(3))}</h2>`) }
      else if (line.startsWith('# '))  { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h1>${inlineToHtml(line.slice(2))}</h1>`) }
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        const raw = line.slice(2)
        const icon = sectionId === 'content-inventory' ? contentTypeIcon(raw) : null
        const iconHtml = icon ? `<span class="content-type-icon" contenteditable="false" aria-hidden="true">${icon} </span>` : ''
        if (!inList) { out.push('<ul>'); inList = true }
        out.push(`<li>${iconHtml}${inlineToHtml(raw)}</li>`)
      }
      else if (line === '') { if (inList) { out.push('</ul>'); inList = false }; out.push('<p><br></p>') }
      else { if (inList) { out.push('</ul>'); inList = false }; out.push(`<p>${inlineToHtml(line)}</p>`) }
    }
    if (inList) out.push('</ul>')
    return out.join('')
  }

  function readInline(el) {
    let r = ''
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) { r += node.textContent; continue }
      if (node.classList?.contains('content-type-icon')) continue
      const t = node.tagName?.toLowerCase()
      const inner = readInline(node)
      if (t === 'strong' || t === 'b') r += `**${inner}**`
      else if (t === 'em' || t === 'i') r += `*${inner}*`
      else if (t === 'code') r += `\`${inner}\``
      else r += inner
    }
    return r
  }

  function htmlToMd(el) {
    const parts = []
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { if (child.textContent.trim()) parts.push(child.textContent); continue }
      const tag = child.tagName?.toLowerCase()
      if (tag === 'h1') parts.push(`# ${readInline(child)}`)
      else if (tag === 'h2') parts.push(`## ${readInline(child)}`)
      else if (tag === 'h3') parts.push(`### ${readInline(child)}`)
      else if (tag === 'ul') { for (const li of child.querySelectorAll(':scope > li')) parts.push(`- ${readInline(li)}`) }
      else if (tag === 'p' || tag === 'div') { const t = readInline(child); parts.push(child.innerHTML === '<br>' ? '' : t) }
      else if (tag === 'br') parts.push('')
    }
    return parts.join('\n')
  }

  useEffect(() => {
    if (!ref.current) return
    if (value === lastMd.current) return
    if (isFocused.current) return
    ref.current.innerHTML = mdToHtml(value, sectionId)
    lastMd.current = value
    setIsEmpty(!value?.trim())
  }, [value, sectionId])

  function sync() {
    if (!ref.current) return
    const md = htmlToMd(ref.current)
    lastMd.current = md
    setIsEmpty(!md.trim())
    onChange(md)
  }

  function placeCursor(el) {
    const sel = window.getSelection()
    const range = document.createRange()
    range.setStart(el, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    el.focus?.()
  }

  function handleKeyDown(e) {
    if (readOnly) return
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    const block = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
    if (!ref.current?.contains(block)) return
    const tag = block.tagName?.toLowerCase()

    if (e.key === ' ' && ['p', 'div'].includes(tag)) {
      const text = block.textContent
      const headingMap = { '###': 'h3', '##': 'h2', '#': 'h1' }
      const newTag = headingMap[text]
      if (newTag) {
        e.preventDefault()
        const el = document.createElement(newTag)
        el.innerHTML = '<br>'
        block.replaceWith(el)
        placeCursor(el)
        sync()
        return
      }
      if (text === '-' || text === '*') {
        e.preventDefault()
        const ul = document.createElement('ul')
        const li = document.createElement('li'); li.innerHTML = '<br>'
        ul.appendChild(li); block.replaceWith(ul)
        placeCursor(li); sync()
        return
      }
    }

    if (e.key === 'Enter' && ['h1', 'h2', 'h3'].includes(tag)) {
      e.preventDefault()
      const p = document.createElement('p'); p.innerHTML = '<br>'
      block.after(p); placeCursor(p); sync()
      return
    }

    if (e.key === 'Enter' && tag === 'li' && !block.textContent.trim()) {
      e.preventDefault()
      const ul = block.closest('ul')
      const p = document.createElement('p'); p.innerHTML = '<br>'
      ul.after(p); block.remove()
      if (!ul.children.length) ul.remove()
      placeCursor(p); sync()
      return
    }

    if (e.key === 'Backspace' && range.collapsed && range.startOffset === 0 && ['h1','h2','h3'].includes(tag) && !block.textContent) {
      e.preventDefault()
      const p = document.createElement('p'); p.innerHTML = '<br>'
      block.replaceWith(p); placeCursor(p); sync()
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {isEmpty && (
        <div style={s.wysiwygPlaceholder} onClick={() => ref.current?.focus()}>
          {placeholder}
        </div>
      )}
      <div
        ref={ref}
        className={`wysiwyg-md${sectionId === 'sitemap-structure' ? ' wysiwyg-sitemap' : ''}`}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={sync}
        onKeyDown={handleKeyDown}
        onFocus={() => { isFocused.current = true; setIsEmpty(false) }}
        onBlur={() => { isFocused.current = false; setIsEmpty(!ref.current?.textContent?.trim()) }}
        style={s.wysiwygEditor}
      />
    </div>
  )
}

/* ── SaveIndicator ─────────────────────────────────────── */
function SaveIndicator({ status }) {
  const color = status === 'saved' ? 'var(--green)' : status === 'saving' ? 'var(--amber)' : 'var(--text-3)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color }}>
      {status === 'saving'
        ? <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }}><Save size={11} /></motion.span>
        : <Save size={11} />}
      {status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Unsaved'}
    </div>
  )
}

/* ── Message rendering ─────────────────────────────────── */
function MsgContent({ content }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.65 }}>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('- ')) return <p key={i} style={{ paddingLeft: 12, position: 'relative', marginBottom: 2 }}><span style={{ position: 'absolute', left: 2, opacity: 0.4 }}>·</span>{inlineMd(line.slice(2))}</p>
        if (line === '') return <div key={i} style={{ height: 5 }} />
        return <p key={i} style={{ marginBottom: 3 }}>{inlineMd(line)}</p>
      })}
    </div>
  )
}

function ThinkDots() {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[0,1,2].map(i => (
        <motion.div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)' }}
          animate={{ y: [0,-4,0], opacity: [0.35,1,0.35] }}
          transition={{ duration: 0.85, repeat: Infinity, delay: i * 0.17 }}
        />
      ))}
    </div>
  )
}

function Spinner() {
  return (
    <motion.span style={{ display: 'block', width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,248,240,0.3)', borderTopColor: '#fff8f0' }}
      animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
    />
  )
}

/* ── Styles ─────────────────────────────────────────────── */
const s = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)' },

  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 50, padding: '0 16px',
    background: 'var(--bg-topbar)', borderBottom: '1px solid var(--border)',
    backdropFilter: 'var(--glass)', WebkitBackdropFilter: 'var(--glass)',
    flexShrink: 0, gap: 12,
  },
  topLeft:   { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
  topDivider: { width: 1, height: 16, background: 'var(--border)', flexShrink: 0 },
  projNameWrap:  { display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 },
  projName:      { fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', whiteSpace: 'nowrap' },
  projNameInput: { fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', background: 'var(--bg-raised)', border: '1px solid var(--amber)', borderRadius: 5, padding: '2px 7px', outline: 'none', minWidth: 120 },
  renameBtn:     { display: 'flex', alignItems: 'center', padding: '3px 4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', borderRadius: 4, transition: 'opacity 0.15s' },
  genBadge:  { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--font-ui)', flexShrink: 0 },
  topRight:  { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  errBadge:  { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red)', background: 'rgba(200,90,90,0.1)', padding: '3px 10px', borderRadius: 100, border: '1px solid rgba(200,90,90,0.2)' },

  panels:  { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
  divider: { width: 1, background: 'var(--border)', flexShrink: 0 },

  panelHead:  { height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  panelLabel: { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)' },

  /* Chat — 20% */
  chatPanel: { flexBasis: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)' },
  chatEmpty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 18px', gap: 10, textAlign: 'center' },
  msgs:      { flex: 1, overflow: 'auto', padding: '12px 12px 6px', display: 'flex', flexDirection: 'column', gap: 10 },
  msgRow:    { display: 'flex' },
  bubble:    { maxWidth: '90%', fontSize: 13.5, lineHeight: 1.7 },
  bubbleAI:  { color: 'var(--text)', padding: '0 4px' },
  bubbleUser: { padding: '9px 13px', borderRadius: 14, borderBottomRightRadius: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13 },
  chatInputCard: { position:'relative', margin:'0 10px 0', background:'var(--bg-card)', border:'1px solid var(--border-mid)', borderRadius:'var(--r-lg)', overflow:'hidden', display:'flex', flexDirection:'column', flexShrink:0, transition:'box-shadow 0.3s ease, opacity 0.2s' },
  chatTA:        { fontSize:13, lineHeight:1.55, minHeight:52, maxHeight:120, overflow:'auto', background:'transparent', border:'none', outline:'none', resize:'none', fontFamily:'var(--font-ui)', color:'var(--text)', padding:'14px 14px 8px' },
  chatInputFooter: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px 10px', borderTop:'1px solid var(--border)', background:'var(--bg-raised)' },

  /* FileEditWidget */
  fileEditWidget: { display:'flex', flexDirection:'column', gap:5, padding:'8px 10px', background:'var(--bg-raised)', border:'1px solid var(--border)', borderLeft:'2px solid var(--green)', borderRadius:8, fontSize:11 },
  fileEditHeader: { fontSize:9, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)', fontFamily:'var(--font-ui)', marginBottom:1 },
  fileEditRow:    { display:'flex', alignItems:'center', gap:6 },
  fileEditName:   { flex:1, fontSize:11, fontFamily:'var(--font-ui)', color:'var(--text-2)' },

  /* GenSummaryWidget */
  genSummaryCard:   { background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  genSummaryHeader: { display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' },

  /* Generation log */
  genLog:  { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' },

  /* Explorer — 20% */
  explorer:   { flexGrow: 1, flexBasis: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)' },
  planSlug:   { fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileList:   { padding: '10px 10px 6px', display: 'flex', flexDirection: 'column', gap: 6 },

  /* File cards */
  fileCard:        { display:'flex', flexDirection:'column', gap:6, width:'100%', padding:'11px 13px', border:'1px solid var(--border)', background:'var(--bg)', borderRadius:'var(--r)', cursor:'pointer', textAlign:'left', fontFamily:'var(--font-ui)', transition:'all 0.12s ease' },
  fileCardActive:  { border:'1px solid var(--amber)', background:'var(--bg-active)', boxShadow:'0 0 0 1px var(--amber-border)' },
  fileCardDone:    { background:'var(--bg-raised)' },
  fileCardWriting: { border:'1px solid var(--amber-border)', background:'rgba(90,132,166,0.04)' },
  fileCardTop:     { display:'flex', alignItems:'center', gap:8 },
  fileCardDisplay: { fontSize:12.5, fontWeight:600, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', letterSpacing:'-0.01em' },
  fileCardBottom:  { display:'flex', alignItems:'center', justifyContent:'space-between' },
  fileCardLabel:   { fontSize:10, fontFamily:'var(--font-ui)', color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  fileCardWc:      { fontSize:10, color:'var(--text-3)', fontFamily:'var(--font-ui)', flexShrink:0 },

  /* Site Assets panel */
  assetsDivider:    { height:1, background:'var(--border)', margin:'14px 0 20px' },
  assetsPanel:      { margin:'0 10px 10px', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden', background:'var(--bg-raised)' },
  assetsPanelHead:  { padding:'10px 12px 8px', borderBottom:'1px solid var(--border)' },
  assetsPanelTitle: { fontSize:11.5, fontWeight:600, color:'var(--text)', letterSpacing:'-0.01em', marginBottom:2 },
  assetsPanelSub:   { fontSize:9.5, color:'var(--text-3)', fontFamily:'var(--font-ui)' },
  assetsDropZone:   { display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'16px 12px', margin:8, border:'1.5px dashed var(--border)', borderRadius:'var(--r-sm)', background:'transparent', cursor:'pointer', width:'calc(100% - 16px)', transition:'border-color 0.12s' },
  assetsList:       { display:'flex', flexDirection:'column', gap:1, padding:'4px 0' },
  assetRow:         { display:'flex', alignItems:'center', gap:8, padding:'6px 12px' },
  assetThumb:       { width:28, height:28, borderRadius:4, objectFit:'cover', flexShrink:0, border:'1px solid var(--border)' },
  assetThumbPlaceholder: { width:28, height:28, borderRadius:4, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' },
  assetMeta:        { flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:1 },
  assetName:        { fontSize:11, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'var(--font-ui)' },
  assetType:        { fontSize:9.5, fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', fontFamily:'var(--font-ui)' },
  assetsAddMore:    { display:'flex', alignItems:'center', gap:5, padding:'6px 12px', fontSize:10.5, color:'var(--text-3)', background:'transparent', border:'none', cursor:'pointer', borderTop:'1px solid var(--border)', width:'100%', fontFamily:'var(--font-ui)' },

  /* Editor — remaining */
  editor:         { flexBasis: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: 'var(--bg-editor)' },
  editorFileName: { fontSize: 11.5, fontFamily: 'var(--font-ui)', color: 'var(--text-2)' },
  wysiwygEditor:  { padding: '22px 28px', minHeight: '100%', cursor: 'text' },
  wysiwygPlaceholder: { position: 'absolute', top: 22, left: 28, right: 28, fontSize: 13, lineHeight: 1.75, color: 'var(--text-3)', pointerEvents: 'none', fontFamily: 'var(--font-ui)' },

  /* Font preview bar */
  fontBar:       { display:'flex', gap:32, padding:'14px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-raised)', flexShrink:0, alignItems:'flex-end', overflowX:'auto' },
  fontSwatch:    { display:'flex', flexDirection:'column', alignItems:'flex-start', gap:5 },
  fontRoleLabel: { fontSize:9, fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)', fontFamily:'var(--font-ui)' },
  fontNameLabel: { fontSize:9.5, color:'var(--text-3)', fontFamily:'var(--font-ui)', whiteSpace:'nowrap' },

  /* Sitemap card grid */
  sitemapBar:      { padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-raised)', flexShrink:0 },
  sitemapScroll:   { display:'flex', gap:8, overflowX:'auto', paddingBottom:2 },
  sitemapCard:     { flexShrink:0, border:'1px solid var(--border)', borderRadius:'var(--r-sm)', padding:'8px 12px', minWidth:80, maxWidth:140, background:'var(--bg)', display:'flex', flexDirection:'column', gap:5 },
  sitemapCardName: { fontSize:11.5, fontWeight:600, color:'var(--text)', fontFamily:'var(--font-ui)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  sitemapChildren: { display:'flex', flexWrap:'wrap', gap:3 },
  sitemapChip:     { fontSize:9.5, padding:'1px 6px', borderRadius:100, background:'var(--bg-raised)', border:'1px solid var(--border)', color:'var(--text-3)', fontFamily:'var(--font-ui)', whiteSpace:'nowrap' },

  /* Color palette bar */
  paletteBar:      { display:'flex', flexWrap:'wrap', gap:12, padding:'14px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg-raised)', flexShrink:0, alignItems:'flex-end' },
  paletteSwatch:   { display:'flex', flexDirection:'column', alignItems:'center', gap:6 },
  paletteColor:    { width:36, height:36, borderRadius:'var(--r)', boxShadow:'inset 0 1px 0 rgba(255,255,255,0.20),0 2px 6px rgba(0,0,0,0.14)' },
  paletteHexLabel: { fontSize:10.5, fontFamily:'var(--font-ui)', fontWeight:500, color:'var(--text-3)', letterSpacing:'0.02em' },

  /* Markdown preview */
  mdH1:  { fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 10, marginTop: 4, lineHeight: 1.3 },
  mdH2:  { fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: 7, marginTop: 18, lineHeight: 1.4 },
  mdH3:  { fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, marginTop: 14, lineHeight: 1.4 },
  mdPre: { background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', margin: '8px 0', overflow: 'auto' },
}
