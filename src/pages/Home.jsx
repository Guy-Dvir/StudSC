import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, Map, ArrowRight, Paperclip, X } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { listPlans, listDraftSessions, getDraftSession, createPlan } from '../lib/api.js'
import { useIsMobile } from '../lib/useIsMobile.js'

const ease = [0.22, 1, 0.36, 1]
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const up = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }

export default function Home({ theme, onToggleTheme }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const mobile    = useIsMobile()
  const [prompt,  setPrompt]  = useState('')
  const [recentPlans,  setRecentPlans]  = useState([])
  const [draftHistory, setDraftHistory] = useState([])
  const [taFocused,    setTaFocused]   = useState(false)
  const [showAllDrafts, setShowAllDrafts] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState(false)
  const [attachments, setAttachments] = useState([])
  const fileInputRef = useRef(null)
  const [glowPos,      setGlowPos]     = useState(null)
  const [caretVisible, setCaretVisible] = useState(true)
  const taRef         = useRef(null)
  const promptWrapRef = useRef(null)
  const blinkRef      = useRef(null)
  const blinkTimeout  = useRef(null)
  const isDark = theme === 'dark'

  const pollRef = useRef(null)

  const refreshDrafts = useCallback(() => {
    listDraftSessions().then(data => {
      setDraftHistory(data)
      const hasGenerating = data.some(d => d.status === 'generating')
      if (hasGenerating && !pollRef.current) {
        pollRef.current = setInterval(() => {
          listDraftSessions().then(fresh => {
            setDraftHistory(fresh)
            if (!fresh.some(d => d.status === 'generating')) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
          }).catch(() => {})
        }, 3000)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    listPlans().then(setRecentPlans).catch(() => {})
    refreshDrafts()
    return () => { clearInterval(pollRef.current); pollRef.current = null }
  }, [location.key])

  useEffect(() => () => { clearInterval(blinkRef.current); clearTimeout(blinkTimeout.current) }, [])

  const updateGlow = useCallback(() => {
    const ta   = taRef.current
    const wrap = promptWrapRef.current
    if (!ta || !wrap) return
    const cs     = window.getComputedStyle(ta)
    const taRect = ta.getBoundingClientRect()
    const m = document.createElement('div')
    m.style.cssText = [
      'position:fixed', `top:${taRect.top}px`, `left:${taRect.left}px`,
      `width:${taRect.width}px`, `padding:${cs.padding}`,
      `font-family:${cs.fontFamily}`, `font-size:${cs.fontSize}`,
      `line-height:${cs.lineHeight}`, `letter-spacing:${cs.letterSpacing}`,
      'white-space:pre-wrap', 'word-wrap:break-word',
      'box-sizing:border-box', 'overflow:hidden',
      'visibility:hidden', 'pointer-events:none',
    ].join(';')
    m.appendChild(document.createTextNode(ta.value.substring(0, ta.selectionStart)))
    const mark = document.createElement('span')
    mark.textContent = '\u200b'
    m.appendChild(mark)
    document.body.appendChild(m)
    const mr   = mark.getBoundingClientRect()
    const wr   = wrap.getBoundingClientRect()
    const lh   = parseFloat(cs.lineHeight) || 24
    document.body.removeChild(m)
    setGlowPos({ x: mr.left - wr.left, y: mr.top - wr.top + lh * 0.35 })
  }, [])

  const stopBlink = useCallback(() => {
    clearInterval(blinkRef.current)
    clearTimeout(blinkTimeout.current)
    blinkRef.current = null
    blinkTimeout.current = null
  }, [])

  const startBlink = useCallback(() => {
    stopBlink()
    setCaretVisible(true)
    blinkTimeout.current = setTimeout(() => {
      blinkRef.current = setInterval(() => {
        setCaretVisible(v => !v)
      }, 530)
    }, 530)
  }, [stopBlink])

  function deriveName(p) {
    const words = p.trim().split(/\s+/).slice(0, 6).join(' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  function handleDraft() {
    if (!prompt.trim()) return
    navigate('/quick-draft', { state: { prompt: prompt.trim() } })
  }

  async function handlePlan() {
    if (!prompt.trim() || creatingPlan) return
    setCreatingPlan(true)
    try {
      const name = deriveName(prompt)
      const data = await createPlan(name, prompt.trim())
      navigate(`/plan/${data.id}`, { state: { autoGenerate: true } })
    } catch (err) {
      setCreatingPlan(false)
    }
  }

  const hasPrompt = prompt.trim().length > 0

  return (
    <div style={s.root}>
      <Orbs />

      {/* Nav */}
      <motion.nav style={s.nav} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
        <div style={s.logo}>
          <span style={s.logoText}>Wix Studio | Site Creation</span>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </motion.nav>

      {/* Center */}
      <motion.section style={s.center} variants={stagger} initial="hidden" animate="show">

        <motion.h1 variants={up} style={s.headline}>
          What are we&nbsp;<span style={s.accent}>building today?</span>
        </motion.h1>

        {/* Prompt card with inline CTAs */}
        <motion.div
          ref={promptWrapRef}
          variants={up}
          style={{
            ...s.promptWrap,
            boxShadow: taFocused
              ? `var(--shadow-lg), 0 0 0 1px rgba(90,132,166,0.30), 0 0 52px rgba(90,132,166,0.10)`
              : 'var(--shadow-lg)',
            transition: 'box-shadow 0.4s var(--ease-out)',
          }}
        >
          {/* Cursor glow + fake caret */}
          {taFocused && glowPos && (
            <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 0, opacity: caretVisible ? 1 : 0 }}>
              {/* Directional cone — dark only */}
              {isDark && (
                <div style={{
                  position: 'absolute',
                  left: glowPos.x - 5, top: glowPos.y - 22,
                  width: 160, height: 40,
                  background: 'radial-gradient(ellipse 10% 80% at 3% 50%, rgba(210,215,255,0.95) 0%, rgba(170,180,255,0.65) 12%, rgba(130,148,255,0.28) 38%, transparent 62%)',
                  filter: 'blur(4px)',
                }} />
              )}
              {/* Fake caret — raised neumorphic in light, glow in dark */}
              <div style={{
                position: 'absolute',
                left: glowPos.x - 0.5, top: glowPos.y - 10,
                width: 2, height: 17,
                background: isDark ? 'rgba(220,225,255,0.95)' : '#4A7BD4',
                borderRadius: 1,
                boxShadow: isDark
                  ? 'none'
                  : '-1px -1px 3px rgba(255,255,255,0.92), 1px 1px 4px rgba(0,0,0,0.18)',
              }} />
            </div>
          )}

          <textarea
            ref={taRef}
            value={prompt}
            placeholder="Describe the business, project or idea — e.g. A luxury spa in Miami targeting busy professionals who crave weekend escapes…"
            rows={mobile ? 3 : 4}
            style={{
              ...s.promptTA,
              ...(mobile ? { minHeight: 80 } : {}),
              position: 'relative', zIndex: 1, caretColor: taFocused ? 'transparent' : undefined,
            }}
            onFocus={() => { setTaFocused(true); updateGlow(); startBlink() }}
            onBlur={() => { setTaFocused(false); stopBlink(); setCaretVisible(true) }}
            onKeyUp={updateGlow}
            onClick={updateGlow}
            onChange={e => {
              setPrompt(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 220) + 'px'
              updateGlow()
              startBlink()
            }}
          />
          <div style={{
            ...s.promptFooter,
            ...(mobile ? { flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '12px 14px 14px' } : {}),
          }}>
            <div style={{ ...s.attachArea, ...(mobile ? s.attachAreaMobile : {}) }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.doc,.docx"
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files)
                  setAttachments(prev => {
                    const existing = new Set(prev.map(f => f.name))
                    return [...prev, ...files.filter(f => !existing.has(f.name))]
                  })
                  e.target.value = ''
                }}
              />
              <button
                style={mobile ? s.attachAddFilesMobile : s.attachBtn}
                onClick={() => fileInputRef.current?.click()}
                title="Attach files"
              >
                <Paperclip size={mobile ? 12 : 14} strokeWidth={2} />
                {mobile && <span>Add files</span>}
              </button>
              {attachments.map(f => (
                <span key={f.name} style={s.attachChip}>
                  <span style={s.attachChipName}>{f.name}</span>
                  <button style={s.attachChipRemove} onClick={() => setAttachments(prev => prev.filter(a => a.name !== f.name))}>
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
            <div style={{
              ...s.ctaRow,
              ...(mobile ? { flexDirection: 'column', width: '100%', gap: 10 } : {}),
            }}>
              <ActionBtn
                icon={Zap}
                label="Quick Draft"
                active={hasPrompt}
                accent="var(--amber)"
                accentDim="var(--amber-dim)"
                accentBorder="var(--amber-border)"
                onClick={handleDraft}
                fullWidth={mobile}
              />
              <ActionBtn
                icon={Map}
                label="Deep Planning"
                active={hasPrompt}
                accent="rgba(140,135,190,1)"
                accentDim="rgba(140,135,190,0.10)"
                accentBorder="rgba(140,135,190,0.30)"
                onClick={handlePlan}
                fullWidth={mobile}
              />
            </div>
          </div>
        </motion.div>

        {/* Recent activity */}
        {(recentPlans.length > 0 || draftHistory.length > 0) && (() => {
          const activityTime = item => {
            const raw = item.type === 'draft' ? item.data.generatedAt : item.data.createdAt
            const t = raw ? new Date(raw).getTime() : 0
            return Number.isNaN(t) ? 0 : t
          }
          const allItems = [
            ...draftHistory.map(d => ({ type: 'draft', data: d, key: d.id })),
            ...recentPlans.map(p => ({ type: 'plan', data: p, key: p.id })),
          ].sort((a, b) => activityTime(b) - activityTime(a))
          const LIMIT = 5
          const visible = showAllDrafts ? allItems : allItems.slice(0, LIMIT)
          const hasMore = allItems.length > LIMIT
          return (
            <motion.div variants={up} style={s.recentWrap}>
              <div style={s.recentHeader}>
                <span style={s.recentTitle}>Previous Drafts</span>
              </div>
              <div style={s.recentList}>
                {visible.map(item =>
                  item.type === 'draft'
                    ? <RecentDraftRow key={item.key} draft={item.data} onClick={async () => {
                        try {
                          const session = await getDraftSession(item.data.id)
                          if (item.data.status === 'generating') {
                            navigate('/quick-draft', { state: { prompt: session.displayName || session.prompt, generatePrompt: session.prompt, drafts: session.drafts, draftSessionId: session.id, resumeSessionId: session.id } })
                          } else {
                            navigate('/quick-draft', { state: { prompt: session.displayName || session.prompt, generatePrompt: session.prompt, drafts: session.drafts, draftSessionId: session.id } })
                          }
                        } catch (_) {
                          navigate('/quick-draft', { state: { prompt: item.data.displayName || item.data.prompt, generatePrompt: item.data.prompt } })
                        }
                      }} />
                    : <RecentPlanRow  key={item.key} plan={item.data}  onClick={() => navigate(`/plan/${item.data.id}`)} />
                )}
              </div>
              {hasMore && (
                <button
                  onClick={() => setShowAllDrafts(v => !v)}
                  style={s.showMoreBtn}
                >
                  {showAllDrafts ? '↑ Show less' : `↓ Show ${allItems.length - LIMIT} more`}
                </button>
              )}
            </motion.div>
          )
        })()}

      </motion.section>
    </div>
  )
}

/* ── ActionBtn ────────────────────────────────────────────────── */
function ActionBtn({ icon: Icon, label, active, accent, accentDim, accentBorder, onClick, fullWidth }) {
  const [hov, setHov] = useState(false)
  const lit = hov && active

  return (
    <motion.button
      style={{
        ...s.actionBtn,
        ...(fullWidth ? { width: '100%', justifyContent: 'center', padding: '12px 20px' } : {}),
        background: lit ? accentDim : 'var(--bg-raised)',
        borderColor: lit ? accentBorder : 'var(--border)',
        boxShadow: lit ? `0 0 18px ${accentDim}, 0 0 6px ${accentDim}` : 'none',
        opacity: active ? 1 : 0.45,
        cursor: active ? 'pointer' : 'default',
      }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      onClick={active ? onClick : undefined}
      whileHover={active ? { y: -1 } : {}}
      whileTap={active ? { scale: 0.975 } : {}}
      transition={{ duration: 0.15 }}
    >
      <Icon size={14} color={lit ? accent : 'var(--text-3)'} strokeWidth={2} />
      <span style={{ ...s.actionLabel, color: lit ? accent : 'var(--text)' }}>{label}</span>
      <motion.div animate={{ x: lit ? 2 : 0 }} transition={{ duration: 0.15 }}>
        <ArrowRight size={13} color={lit ? accent : 'var(--text-3)'} strokeWidth={1.8} />
      </motion.div>
    </motion.button>
  )
}

/* ── RecentDraftRow ───────────────────────────────────────────── */
function RecentDraftRow({ draft, onClick }) {
  const [hov, setHov] = useState(false)
  const isGenerating = draft.status === 'generating'
  return (
    <motion.button
      style={{ ...s.recentRow, background: hov ? 'var(--bg-hover)' : 'transparent' }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      onClick={onClick}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.12 }}
    >
      {isGenerating
        ? <motion.div
            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }}
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        : <Zap size={10} color="var(--amber)" strokeWidth={2} style={{ flexShrink: 0, opacity: 0.7 }} />
      }
      <span style={s.recentName}>{draft.displayName || draft.prompt || 'Untitled draft'}</span>
      {isGenerating
        ? (() => {
            const done = (draft.drafts || []).filter(Boolean).length
            const total = draft.generatingTarget
            const multiQueue = total != null && total > 1
            let label
            if (multiQueue) {
              label = `${done}/${total} generating…`
            } else if (done === 0) {
              label = 'Generating…'
            } else if (total != null) {
              label = `${done}/${total} generating…`
            } else {
              label = `${done} generating…`
            }
            return (
              <span style={{ ...s.recentTime, color: 'var(--amber)' }}>{label}</span>
            )
          })()
        : <span style={s.recentTime}>{relativeTime(draft.generatedAt)}</span>
      }
      <ArrowRight size={12} color="var(--text-3)" strokeWidth={1.8}
        style={{ opacity: hov ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }} />
    </motion.button>
  )
}

/* ── RecentPlanRow ────────────────────────────────────────────── */
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  <  7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function RecentPlanRow({ plan, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <motion.button
      style={{ ...s.recentRow, background: hov ? 'var(--bg-hover)' : 'transparent' }}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      onClick={onClick}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.12 }}
    >
      <Map size={10} color="var(--text-3)" strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={s.recentName}>{plan.name || 'Untitled plan'}</span>
      <span style={s.recentTime}>{relativeTime(plan.createdAt)}</span>
      <ArrowRight size={12} color="var(--text-3)" strokeWidth={1.8}
        style={{ opacity: hov ? 1 : 0, transition: 'opacity 0.15s', flexShrink: 0 }} />
    </motion.button>
  )
}

/* ── Orbs / Spinner ───────────────────────────────────────────── */
function Orbs() {
  return (
    <div style={s.orbRoot} aria-hidden>
      <motion.div style={{ ...s.orb, width: 720, height: 720, background: 'var(--orb-1)', top: '-240px', right: '-120px' }}
        animate={{ x: [0,24,-14,0], y: [0,-18,12,0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div style={{ ...s.orb, width: 560, height: 560, background: 'var(--orb-2)', bottom: '-120px', left: '-80px' }}
        animate={{ x: [0,-18,12,0], y: [0,16,-10,0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
      />
    </div>
  )
}

/* ── Styles ───────────────────────────────────────────────────── */
const s = {
  root: {
    minHeight: '100vh',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '0 max(16px, env(safe-area-inset-left)) 64px',
    position: 'relative', overflow: 'hidden',
  },
  orbRoot: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: '50%', filter: 'blur(120px)' },

  nav: {
    width: '100%', maxWidth: 760,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '26px 0 0', position: 'relative', zIndex: 2,
  },
  logo: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: { width: 20, height: 20, borderRadius: 5, background: 'var(--amber)' },
  logoText: { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' },

  center: {
    width: '100%', maxWidth: 760,
    paddingTop: 'clamp(32px, 8vw, 72px)',
    display: 'flex', flexDirection: 'column', gap: 24,
    position: 'relative', zIndex: 1, flex: 1,
  },
  headline: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(22px, 3.2vw, 42px)',
    letterSpacing: '-0.04em',
    lineHeight: 1.15, paddingBottom: 4,
    textAlign: 'left',
    color: 'var(--text)',
    fontWeight: 500,
  },
  accent: { color: 'var(--amber)' },

  /* Prompt card */
  promptWrap: {
    position: 'relative',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-mid)',
    borderRadius: 'var(--r-xl)',
    overflow: 'hidden',
    backdropFilter: 'var(--glass)',
    WebkitBackdropFilter: 'var(--glass)',
    display: 'flex', flexDirection: 'column',
  },
  promptTA: {
    padding: '24px 24px 14px',
    fontSize: 15, lineHeight: 1.65,
    color: 'var(--text)', background: 'transparent',
    border: 'none', outline: 'none', resize: 'none',
    minHeight: 120,
    fontFamily: 'var(--font-ui)',
  },
  promptFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px 14px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-raised)',
    gap: 12,
  },
  attachArea: { display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap' },
  attachAreaMobile: { fontSize: 12, color: 'var(--text-3)', marginBottom: 4 },
  attachBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s' },
  attachAddFilesMobile: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-ui)', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s' },
  attachChip: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 8px', borderRadius: 100, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-2)', maxWidth: 160 },
  attachChipName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)' },
  attachChipRemove: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, flexShrink: 0 },
  charCount: { fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flex: 1 },

  /* Action buttons */
  ctaRow: { display: 'flex', gap: 8, flexShrink: 0 },
  actionBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '9px 16px',
    border: '1px solid',
    borderRadius: 'var(--r-sm)',
    fontFamily: 'var(--font-ui)',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  actionLabel: { fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1, transition: 'color 0.15s', fontFamily: 'var(--font-display)' },

  footer: { fontSize: 11.5, color: 'var(--text-3)', marginTop: 'auto', paddingTop: 40, position: 'relative', zIndex: 1 },

  /* Recent plans */
  recentWrap: {
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-xl)',
    overflow: 'hidden',
  },
  recentHeader: {
    padding: '10px 16px 6px',
    borderBottom: '1px solid var(--border)',
  },
  recentTitle: {
    fontSize: 10.5, fontWeight: 600, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: 'var(--text-3)',
    fontFamily: 'var(--font-ui)',
  },
  recentList: { display: 'flex', flexDirection: 'column', padding: '6px 8px 8px' },
  showMoreBtn: { display: 'block', width: '100%', padding: '7px 0', fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-ui)', letterSpacing: '0.03em' },
  recentRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px',
    borderRadius: 'var(--r)',
    cursor: 'pointer',
    fontFamily: 'var(--font-ui)',
    width: '100%', textAlign: 'left',
    border: 'none',
    transition: 'background 0.12s',
  },
  recentDot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--border-mid)', flexShrink: 0 },
  recentName: { fontSize: 13, color: 'var(--text-2)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  recentTime: { fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 },
}
