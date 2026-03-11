import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Send, Paperclip, Zap, X, Download,
  FileText, Target, Map, Puzzle, Archive, Bookmark,
  CheckCircle2, Circle, Save, MessageSquare, ChevronRight,
} from 'lucide-react'
import { getPlan, sendChat, uploadFile, saveSection, generateDrafts, createPlan } from '../lib/api.js'
import ThemeToggle from '../components/ThemeToggle.jsx'

const SECTIONS = [
  { id: 'brand-theme',       label: 'brand-theme.md',       display: 'Brand & Theme',       icon: FileText },
  { id: 'goals-brief',       label: 'goals-brief.md',       display: 'Goals & Brief',        icon: Target   },
  { id: 'sitemap-structure', label: 'sitemap-structure.md', display: 'Sitemap & Structure',  icon: Map      },
  { id: 'integrations',      label: 'integrations.md',      display: 'Apps & Integrations',  icon: Puzzle   },
  { id: 'content-inventory', label: 'content-inventory.md', display: 'Content Inventory',    icon: Archive  },
  { id: 'inspiration',       label: 'inspiration.md',       display: 'Inspiration & Refs',   icon: Bookmark },
]

const ease = [0.22, 1, 0.36, 1]

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
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={10} color="var(--green)" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>{sec.display}</span>
          </div>
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
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [genLines,       setGenLines]       = useState([])
  const [sectionStatus,  setSectionStatus]  = useState({})
  const [hoveredFile,    setHoveredFile]    = useState(null)

  const bottomRef    = useRef(null)
  const genBottomRef = useRef(null)
  const fileRef      = useRef(null)
  const inputRef     = useRef(null)
  const saveTimer    = useRef(null)
  const esRef        = useRef(null)
  const shouldGenRef = useRef(false)
  const firstDoneRef = useRef(false)
  const typingRef    = useRef(null)

  useEffect(() => () => {
    esRef.current?.close()
    clearInterval(typingRef.current)
  }, [])

  useEffect(() => {
    if (id === 'new') {
      const { prompt, name } = state || {}
      if (!prompt) { navigate('/'); return }
      createPlan(name || 'Untitled', prompt).then(data => {
        shouldGenRef.current = true
        navigate(`/plan/${data.id}`, { replace: true })
      }).catch(err => {
        setError(err.message || 'Failed to create plan')
        navigate('/')
      })
      return
    }
    getPlan(id).then(data => {
      setPlan(data)
      const firstFilled = SECTIONS.find(s => data.sections?.[s.id]?.trim()) || SECTIONS[0]
      setActiveFile(firstFilled.id)
      setEditContent(data.sections?.[firstFilled.id] || '')
      if (shouldGenRef.current) {
        shouldGenRef.current = false
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
    firstDoneRef.current = false
    setGeneratingPlan(true)
    setGenLines([{ type: 'working', text: 'Analyzing your brief…' }])
    setSectionStatus({})

    const linesLog = []
    const es = new EventSource(`/api/plans/${planId}/generate`)
    esRef.current = es

    es.addEventListener('section_start', e => {
      const { id: secId } = JSON.parse(e.data)
      const sec = SECTIONS.find(s => s.id === secId)
      setSectionStatus(p => ({ ...p, [secId]: 'writing' }))
      setGenLines(p => [...p, { type: 'working', text: `Writing ${sec?.display}…`, id: secId }])
    })

    es.addEventListener('section_done', e => {
      const { id: secId, content } = JSON.parse(e.data)
      const sec = SECTIONS.find(s => s.id === secId)
      setSectionStatus(p => ({ ...p, [secId]: 'done' }))
      setPlan(p => p ? { ...p, sections: { ...p.sections, [secId]: content } } : p)
      setGenLines(p => p.map(l => l.id === secId ? { ...l, type: 'done' } : l))
      if (sec) linesLog.push({ id: secId, display: sec.display })
      if (!firstDoneRef.current) {
        firstDoneRef.current = true
        setActiveFile(secId)
        typeContent(content)
      }
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
        // Animate content into editor for the currently active file if it was updated
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
          <span style={s.projName}>{plan.name}</span>
          <div style={s.progWrap}>
            <div style={s.progTrack}>
              <motion.div style={s.progBar} animate={{ width: `${progress}%` }} transition={{ duration: 0.7, ease }} />
            </div>
            <span style={s.progPct}>{progress}%</span>
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

        {/* Chat panel — LEFT 20% */}
        <div style={s.chatPanel}>
          <div style={s.panelHead}>
            {generatingPlan
              ? <>
                  <span style={{ ...s.panelLabel, color: 'var(--amber)' }}>AI Working</span>
                  <motion.div
                    style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid var(--amber-border)', borderTopColor: 'var(--amber)' }}
                    animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                  />
                </>
              : <>
                  <span style={s.panelLabel}>Refine with AI</span>
                  <MessageSquare size={12} color="var(--text-3)" />
                </>
            }
          </div>

          {generatingPlan ? (
            <div style={s.genLog}>
              <AnimatePresence initial={false}>
                {genLines.map((line, i) => (
                  <motion.div
                    key={i}
                    style={s.genLine}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease }}
                  >
                    {line.type === 'done'
                      ? <CheckCircle2 size={11} color="var(--green)" style={{ flexShrink: 0 }} />
                      : line.type === 'complete'
                      ? <CheckCircle2 size={11} color="var(--amber)" style={{ flexShrink: 0 }} />
                      : <motion.div
                          style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }}
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                        />
                    }
                    <span style={{
                      fontSize: 12, lineHeight: 1.5,
                      color: line.type === 'complete' ? 'var(--text)' : 'var(--text-2)',
                      fontWeight: line.type === 'complete' ? 500 : 400,
                    }}>
                      {line.text}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={genBottomRef} />
            </div>
          ) : (
            <div style={s.msgs}>
              {messages.length === 0 && (
                <div style={s.chatEmpty}>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
                    Ask me to update any section, add details, or adjust the tone.
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
                    e.g. "Make the brand tone more playful"
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
                  <div style={{ ...s.bubble, ...s.bubbleAI }}><ThinkDots /></div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          <div style={{ ...s.chatInput, opacity: generatingPlan ? 0.4 : 1, pointerEvents: generatingPlan ? 'none' : 'auto' }}>
            <input type="file" ref={fileRef} onChange={onUpload} style={{ display: 'none' }} />
            <button className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()} title="Upload file" style={{ flexShrink: 0, padding: '4px 5px' }}>
              <Paperclip size={12} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              placeholder={generatingPlan ? 'Generating plan…' : 'Refine a section…'}
              rows={1}
              disabled={sending || generatingPlan}
              style={s.chatTA}
              onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            />
            <button className="btn btn-primary btn-xs" onClick={send} disabled={!input.trim() || sending || generatingPlan} style={{ flexShrink: 0 }}>
              <Send size={11} />
            </button>
          </div>
        </div>

        <div style={s.divider} />

        {/* File Explorer — 20% */}
        <div style={s.explorer}>
          <div style={s.panelHead}>
            <span style={s.panelLabel}>Files</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={s.planSlug}>{plan.name.toLowerCase().replace(/\s+/g, '-').slice(0, 18)}/</span>
              {filled.length > 0 && (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={downloadAll}
                  title="Download all as markdown"
                  style={{ padding: '2px 4px' }}
                >
                  <Download size={11} />
                </button>
              )}
            </div>
          </div>

          <div style={s.fileList}>
            {SECTIONS.map(sec => {
              const Icon      = sec.icon
              const isDone    = plan.sections?.[sec.id]?.trim().length > 0
              const isActive  = activeFile === sec.id
              const wc        = plan.sections?.[sec.id]?.trim().split(/\s+/).filter(Boolean).length || 0
              const genStatus = sectionStatus[sec.id]
              const isHovered = hoveredFile === sec.id

              return (
                <motion.button
                  key={sec.id}
                  style={{
                    ...s.fileRow,
                    ...(isActive ? s.fileRowActive : {}),
                    ...(genStatus === 'writing' ? s.fileRowWriting : {}),
                  }}
                  onClick={() => openFile(sec.id)}
                  onMouseEnter={() => setHoveredFile(sec.id)}
                  onMouseLeave={() => setHoveredFile(null)}
                  whileHover={{ x: 2 }}
                  transition={{ duration: 0.12 }}
                >
                  <Icon
                    size={12}
                    color={genStatus === 'writing' ? 'var(--amber)' : isActive ? 'var(--amber)' : isDone ? 'var(--text-2)' : 'var(--text-3)'}
                    strokeWidth={1.7}
                  />
                  <span style={{ ...s.fileName, color: genStatus === 'writing' ? 'var(--amber)' : isActive ? 'var(--text)' : isDone ? 'var(--text-2)' : 'var(--text-3)' }}>
                    {sec.label}
                  </span>
                  <span style={s.fileWc}>{isDone && !isHovered ? `${wc}w` : ''}</span>
                  {isHovered && isDone && !genStatus ? (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={e => { e.stopPropagation(); downloadFile(sec.label, plan.sections[sec.id]) }}
                      title="Download"
                      style={{ padding: '1px 3px', flexShrink: 0 }}
                    >
                      <Download size={10} />
                    </button>
                  ) : genStatus === 'writing' ? (
                    <motion.div
                      style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--amber-border)', borderTopColor: 'var(--amber)' }}
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                  ) : genStatus === 'done' ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                      <CheckCircle2 size={10} color="var(--green)" />
                    </motion.div>
                  ) : isDone ? (
                    <CheckCircle2 size={10} color="var(--green)" />
                  ) : (
                    <Circle size={10} color="var(--text-3)" />
                  )}
                </motion.button>
              )
            })}
          </div>

          {uploads.length > 0 && (
            <div style={s.uploadList}>
              <p style={s.uploadLabel}>Uploads</p>
              {uploads.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <FileText size={10} color="var(--text-3)" />
                  <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={s.divider} />

        {/* Editor panel — remaining */}
        <div style={s.editor}>
          <div style={s.panelHead}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {activeSection && <activeSection.icon size={12} color="var(--amber)" strokeWidth={1.7} />}
              <span style={s.editorFileName}>{activeSection?.label}</span>
              {sectionStatus[activeFile] === 'writing' && (
                <motion.span
                  style={{ fontSize: 10.5, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1, repeat: Infinity }}
                >
                  writing…
                </motion.span>
              )}
            </div>
            <SaveIndicator status={saveStatus} />
          </div>

          <WysiwygEditor
            value={editContent}
            onChange={handleEdit}
            placeholder={generatingPlan ? 'AI is filling this section…' : 'Start writing or ask AI to fill this section…'}
            readOnly={generatingPlan}
          />
        </div>

      </div>
    </div>
  )
}

/* ── WysiwygEditor ─────────────────────────────────────── */
function WysiwygEditor({ value, onChange, placeholder, readOnly }) {
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
    `
    document.head.appendChild(style)
  }, [])

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function inlineToHtml(text) {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
    return parts.map(p => {
      if (p.startsWith('`') && p.endsWith('`')) return `<code>${esc(p.slice(1,-1))}</code>`
      if (p.startsWith('**') && p.endsWith('**')) return `<strong>${esc(p.slice(2,-2))}</strong>`
      if (p.startsWith('*') && p.endsWith('*')) return `<em>${esc(p.slice(1,-1))}</em>`
      return esc(p)
    }).join('')
  }

  function mdToHtml(md) {
    if (!md) return ''
    const out = []; let inList = false
    for (const line of md.split('\n')) {
      if (line.startsWith('### ')) { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h3>${inlineToHtml(line.slice(4))}</h3>`) }
      else if (line.startsWith('## ')) { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h2>${inlineToHtml(line.slice(3))}</h2>`) }
      else if (line.startsWith('# '))  { if (inList) { out.push('</ul>'); inList = false }; out.push(`<h1>${inlineToHtml(line.slice(2))}</h1>`) }
      else if (line.startsWith('- ') || line.startsWith('* ')) { if (!inList) { out.push('<ul>'); inList = true }; out.push(`<li>${inlineToHtml(line.slice(2))}</li>`) }
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
    ref.current.innerHTML = mdToHtml(value)
    lastMd.current = value
    setIsEmpty(!value?.trim())
  }, [value])

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
    <div style={{ position: 'relative', flex: 1, overflow: 'auto' }}>
      {isEmpty && (
        <div style={s.wysiwygPlaceholder} onClick={() => ref.current?.focus()}>
          {placeholder}
        </div>
      )}
      <div
        ref={ref}
        className="wysiwyg-md"
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
    flexShrink: 0, gap: 12,
  },
  topLeft:   { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
  topDivider: { width: 1, height: 16, background: 'var(--border)', flexShrink: 0 },
  projName:  { fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 },
  progWrap:  { display: 'flex', alignItems: 'center', gap: 7 },
  progTrack: { width: 80, height: 3, background: 'var(--bg-raised)', borderRadius: 2, overflow: 'hidden' },
  progBar:   { height: '100%', background: 'var(--amber)', borderRadius: 2 },
  progPct:   { fontSize: 11, color: 'var(--amber)', fontWeight: 500, flexShrink: 0 },
  genBadge:  { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
  topRight:  { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  errBadge:  { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red)', background: 'rgba(200,90,90,0.1)', padding: '3px 10px', borderRadius: 100, border: '1px solid rgba(200,90,90,0.2)' },

  panels:  { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
  divider: { width: 1, background: 'var(--border)', flexShrink: 0 },

  panelHead:  { height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 },
  panelLabel: { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)' },

  /* Chat — 20% */
  chatPanel: { width: '20%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)' },
  chatEmpty: { padding: '16px 14px' },
  msgs:      { flex: 1, overflow: 'auto', padding: '12px 12px 6px', display: 'flex', flexDirection: 'column', gap: 10 },
  msgRow:    { display: 'flex' },
  bubble:    { maxWidth: '88%', padding: '9px 12px', borderRadius: 12, fontSize: 13 },
  bubbleAI:  { background: 'var(--bg-raised)', border: '1px solid var(--border)', borderTopLeftRadius: 3, color: 'var(--text)' },
  bubbleUser: { background: 'var(--amber)', color: '#EEF3F8', borderBottomRightRadius: 3 },
  chatInput: { display: 'flex', gap: 6, alignItems: 'flex-end', padding: '10px 12px 12px', borderTop: '1px solid var(--border)', transition: 'opacity 0.2s' },
  chatTA:    { flex: 1, fontSize: 13, lineHeight: 1.5, minHeight: 20, maxHeight: 120, overflow: 'auto', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'var(--font-ui)', color: 'var(--text)' },

  /* GenSummaryWidget */
  genSummaryCard:   { background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  genSummaryHeader: { display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' },

  /* Generation log */
  genLog:  { flex: 1, overflow: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  genLine: { display: 'flex', alignItems: 'flex-start', gap: 8 },

  /* Explorer — 20% */
  explorer:   { width: '20%', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-panel)' },
  planSlug:   { fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileList:   { flex: 1, overflow: 'auto', padding: '6px 8px' },
  fileRow:    { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', border: 'none', background: 'transparent', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-ui)', transition: 'background 0.12s ease' },
  fileRowActive:  { background: 'var(--bg-active)' },
  fileRowWriting: { background: 'rgba(90,132,166,0.06)' },
  fileName:   { flex: 1, fontSize: 11.5, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileWc:     { fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
  uploadList: { padding: '10px 12px', borderTop: '1px solid var(--border)' },
  uploadLabel: { fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 },

  /* Editor — remaining */
  editor:         { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  editorFileName: { fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', letterSpacing: '-0.01em' },
  wysiwygEditor:  { padding: '22px 28px', minHeight: '100%', cursor: 'text' },
  wysiwygPlaceholder: { position: 'absolute', top: 22, left: 28, right: 28, fontSize: 13, lineHeight: 1.75, color: 'var(--text-3)', pointerEvents: 'none', fontFamily: 'var(--font-ui)' },

  /* Markdown preview */
  mdH1:  { fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 10, marginTop: 4, lineHeight: 1.3 },
  mdH2:  { fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)', marginBottom: 7, marginTop: 18, lineHeight: 1.4 },
  mdH3:  { fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 5, marginTop: 14, lineHeight: 1.4 },
  mdPre: { background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', margin: '8px 0', overflow: 'auto' },
}
