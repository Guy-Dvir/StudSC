import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Sparkles, Expand, ChevronLeft, X, Zap, ArrowRight } from 'lucide-react'
import { streamDrafts, getDraftSession } from '../lib/api.js'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { useIsMobile } from '../lib/useIsMobile.js'

const ease = [0.22, 1, 0.36, 1]

const QUICK_DRAFT_SESSION_STORAGE = 'website-planner.quickDraftSessionV1'

function promptStorageKey(p) {
  if (!p || typeof p !== 'string') return ''
  return `${p.length}:${p.slice(0, 200)}`
}

function readStoredQuickDraftSessionId(apiPrompt) {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(QUICK_DRAFT_SESSION_STORAGE)
    if (!raw) return null
    const { id, key } = JSON.parse(raw)
    if (!id || key !== promptStorageKey(apiPrompt)) return null
    return id
  } catch {
    return null
  }
}

function writeStoredQuickDraftSessionId(id, apiPrompt) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(QUICK_DRAFT_SESSION_STORAGE, JSON.stringify({ id, key: promptStorageKey(apiPrompt) }))
  } catch (_) {}
}

function clearStoredQuickDraftSession() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(QUICK_DRAFT_SESSION_STORAGE)
  } catch (_) {}
}

export default function QuickDraft({ theme, onToggleTheme }) {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const mobile     = useIsMobile()
  const [drafts,   setDrafts]   = useState(state?.drafts || [])
  const seedLabel = ((state?.displayName ?? state?.prompt) || '').trim()
  const [prompt,   setPrompt]   = useState(seedLabel)
  const [genPrompt, setGenPrompt] = useState(state?.generatePrompt || state?.prompt || '')
  const [loading,  setLoading]  = useState(false)
  const [loadingSet, setLoadingSet] = useState(new Set())
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState(null)
  const [showCode, setShowCode] = useState(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [swipeHintDismissed, setSwipeHintDismissed] = useState(false)
  const [slideWidth, setSlideWidth] = useState(0)
  const cleanupRef = useRef(null)
  const carouselRef = useRef(null)
  const initializedRef = useRef(false)
  const sessionIdRef = useRef(
    state?.draftSessionId ??
      state?.resumeSessionId ??
      readStoredQuickDraftSessionId(state?.generatePrompt || state?.prompt || '')
  )
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const [slotTarget, setSlotTarget] = useState(null)
  const maxLoadingIdx = loadingSet.size > 0 ? Math.max(...loadingSet) + 1 : 0
  const totalSlots = Math.max(drafts.length, maxLoadingIdx, slotTarget || 0)

  const measureCarousel = useCallback((el) => {
    carouselRef.current = el
    if (el && mobile) {
      const w = el.offsetWidth
      if (w > 0) setSlideWidth(w)
    }
  }, [mobile])

  useEffect(() => {
    if (!mobile) return
    const updateWidth = () => {
      if (carouselRef.current) {
        const w = carouselRef.current.offsetWidth
        if (w > 0) setSlideWidth(w)
      }
    }
    const t = setTimeout(updateWidth, 100)
    let ro = null
    if (carouselRef.current) {
      ro = new ResizeObserver(updateWidth)
      ro.observe(carouselRef.current)
    }
    return () => { clearTimeout(t); ro?.disconnect() }
  }, [mobile, drafts.length, loading, slideWidth])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    if (state?.resumeSessionId) {
      resumeSession(state.resumeSessionId)
    } else if (!state?.drafts?.length && genPrompt) {
      generate(genPrompt)
    }
    return () => cleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (!mobile || swipeHintDismissed) return
    const t = setTimeout(() => setSwipeHintDismissed(true), 2000)
    return () => clearTimeout(t)
  }, [mobile, swipeHintDismissed])

  function pendingIndicesForSession(session) {
    if (session.status !== 'generating') return new Set()
    const target = session.generatingTarget
    const arr = session.drafts || []
    if (target == null) {
      const pending = new Set()
      if (arr.length === 0) pending.add(0)
      else {
        for (let i = 0; i < arr.length; i++) {
          if (!arr[i]) pending.add(i)
        }
      }
      return pending
    }
    const pending = new Set()
    for (let i = 0; i < target; i++) {
      if (!arr[i]) pending.add(i)
    }
    return pending
  }

  function resumeSession(sessionId) {
    sessionIdRef.current = sessionId
    setLoading(true)

    ;(async () => {
      try {
        const session = await getDraftSession(sessionId)
        setDrafts(session.drafts || [])
        setPrompt(session.displayName || session.prompt)
        setGenPrompt(session.prompt)
        writeStoredQuickDraftSessionId(session.id, session.prompt)
        if (session.generatingTarget != null) setSlotTarget(session.generatingTarget)
        else setSlotTarget(null)
        if (session.status === 'generating') {
          setLoadingSet(pendingIndicesForSession(session))
        } else {
          setLoading(false)
          setLoadingSet(new Set())
          setSlotTarget(null)
        }
      } catch (_) {
        setLoading(false)
        setLoadingSet(new Set())
        setSlotTarget(null)
      }
    })()

    const poll = setInterval(async () => {
      try {
        const session = await getDraftSession(sessionId)
        setDrafts(session.drafts || [])
        setPrompt(session.displayName || session.prompt)
        setGenPrompt(session.prompt)
        writeStoredQuickDraftSessionId(session.id, session.prompt)
        if (session.generatingTarget != null) setSlotTarget(session.generatingTarget)
        if (session.status !== 'generating') {
          clearInterval(poll)
          setLoading(false)
          setLoadingSet(new Set())
          setSlotTarget(null)
        } else {
          setLoadingSet(pendingIndicesForSession(session))
        }
      } catch (_) {
        clearInterval(poll)
        setLoading(false)
        setLoadingSet(new Set())
        setSlotTarget(null)
      }
    }, 2000)
    cleanupRef.current = () => clearInterval(poll)
  }

  function generate(p, count = 3) {
    cleanupRef.current?.()
    const startIndex = draftsRef.current.length
    let sid = sessionIdRef.current
    if (!sid && startIndex > 0) {
      sid = readStoredQuickDraftSessionId(p)
      if (sid) sessionIdRef.current = sid
    }
    if (startIndex === 0 && !sid) {
      clearStoredQuickDraftSession()
    }

    const existingStyles = draftsRef.current.map(d => d.style).filter(Boolean)
    const pendingIndices = new Set(Array.from({ length: count }, (_, i) => startIndex + i))

    setLoading(true); setError('')
    setExpanded(null); setShowCode(null)
    setLoadingSet(pendingIndices)

    cleanupRef.current = streamDrafts(p, prompt, {
      sessionId: sid || undefined,
      count,
      startIndex,
      existingStyles,
      onSessionCreated({ sessionId, generatingTarget }) {
        sessionIdRef.current = sessionId
        writeStoredQuickDraftSessionId(sessionId, p)
        if (generatingTarget != null) setSlotTarget(generatingTarget)
      },
      onDraftReady({ index, draft }) {
        setDrafts(prev => {
          const next = [...prev]
          next[index] = draft
          return next
        })
        setLoadingSet(prev => {
          const next = new Set(prev)
          next.delete(index)
          return next
        })
      },
      onDone() {
        setLoading(false)
        setLoadingSet(new Set())
        setSlotTarget(null)
      },
      onError({ message }) {
        setError(message || 'Generation failed')
        setLoading(false)
        setLoadingSet(new Set())
        setSlotTarget(null)
      },
    })
  }

  function generateMore() { generate(genPrompt, 3) }

  function download(draft) {
    const blob = new Blob([draft.html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${draft.style.toLowerCase().replace(/\s+/g, '-')}.html` })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={s.root}>
      {/* Top bar */}
      <div style={{ ...s.topBar, ...(mobile ? { flexWrap: 'wrap', padding: '10px 12px', gap: 8 } : {}) }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          <ArrowLeft size={13} /> Home
        </button>
        {!mobile && (
          <div style={s.promptChip}>
            <span style={s.chipText}>{prompt}</span>
            <button className="btn btn-ghost btn-sm" onClick={generateMore} disabled={loading} style={{ flexShrink: 0 }}>
              <Sparkles size={12} />
              {loading ? 'Generating…' : 'More Options'}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: mobile ? 'auto' : 0 }}>
          {mobile && (
            <button className="btn btn-ghost btn-sm" onClick={generateMore} disabled={loading}>
              <Sparkles size={12} />
            </button>
          )}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        {mobile && (
          <div style={{ width: '100%', fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {prompt}
          </div>
        )}
      </div>

      {error && (
        <div style={s.errorBar}>{error} <button onClick={() => setError('')}><X size={13} /></button></div>
      )}

      {/* Grid (desktop) / Carousel (mobile) */}
      <div style={{ ...s.body, ...(mobile ? { padding: '16px 12px', position: 'relative' } : {}) }}>
        {(drafts.length > 0 || loading || (slotTarget != null && slotTarget > 0)) && (
          <div style={{ ...s.gridTitle, ...(mobile ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } : {}) }}>
            <span>Homepage Drafts</span>
            {mobile && totalSlots > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-ui)' }}>
                {currentSlide + 1} / {totalSlots}
              </span>
            )}
          </div>
        )}
        {mobile ? (
          <>
            <AnimatePresence>
              {!swipeHintDismissed && (drafts.length > 0 || loading || (slotTarget != null && slotTarget > 0)) && (
                <motion.div
                  key="swipe-hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={s.swipeHint}
                >
                  <ChevronLeft size={14} style={{ transform: 'translateX(2px)' }} />
                  <span>Swipe to see more</span>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={measureCarousel} style={s.carouselTrackWrap}>
              <motion.div
                style={{
                  ...s.carouselTrack,
                  width: slideWidth > 0 ? slideWidth * totalSlots : `${totalSlots * 100}%`,
                }}
                drag={mobile ? 'x' : false}
                dragConstraints={slideWidth > 0 ? { left: -(totalSlots - 1) * slideWidth, right: 0 } : false}
                dragElastic={0.1}
                dragMomentum={false}
                onDragEnd={(_, info) => {
                  setSwipeHintDismissed(true)
                  if (slideWidth <= 0) return
                  const offset = -info.offset.x
                  const raw = offset / slideWidth
                  const velocity = info.velocity.x
                  let next
                  if (Math.abs(velocity) > 300) {
                    next = velocity > 0 ? Math.max(0, Math.floor(raw) - 1) : Math.min(totalSlots - 1, Math.ceil(raw) + 1)
                  } else {
                    next = Math.round(raw)
                  }
                  setCurrentSlide(Math.max(0, Math.min(totalSlots - 1, next)))
                }}
                animate={{ x: slideWidth > 0 ? -currentSlide * slideWidth : `-${currentSlide * (100 / totalSlots)}%` }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              >
                {Array.from({ length: totalSlots }, (_, i) => (
                  <div key={i} style={{ ...s.carouselSlide, width: slideWidth > 0 ? slideWidth : undefined, flex: slideWidth > 0 ? 'none' : `0 0 ${100 / totalSlots}%` }}>
                    {loadingSet.has(i) ? (
                      <DraftSkeleton index={i} />
                    ) : drafts[i] ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease }}
                      >
                        <DraftCard
                          draft={drafts[i]}
                          index={i}
                          onExpand={() => setExpanded(i)}
                          onDownload={() => download(drafts[i])}
                          onGenerateSite={() => download(drafts[i])}
                          onGoToEditor={() => setShowCode(i)}
                          mobile={mobile}
                        />
                      </motion.div>
                    ) : (
                      <div style={{ minHeight: 320, background: 'var(--bg-raised)', borderRadius: 'var(--r-xl)' }} />
                    )}
                  </div>
                ))}
              </motion.div>
            </div>
            {totalSlots > 0 && (
              <div style={s.carouselDots}>
                {Array.from({ length: totalSlots }, (_, i) => {
                  const accent = SKEL_ACCENTS[i % SKEL_ACCENTS.length]
                  return (
                    <button
                      key={i}
                      onClick={() => { setCurrentSlide(i); setSwipeHintDismissed(true) }}
                      style={{
                        ...s.carouselDot,
                        background: currentSlide === i ? accent : 'var(--border-mid)',
                        width: currentSlide === i ? 20 : 8,
                      }}
                      aria-label={`Draft ${i + 1} of ${totalSlots}`}
                    />
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div style={{ ...s.grid, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {Array.from({ length: totalSlots }, (_, i) => (
              <AnimatePresence key={i} mode="wait">
                {loadingSet.has(i) ? (
                  <motion.div key={`sk-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <DraftSkeleton index={i} />
                  </motion.div>
                ) : drafts[i] ? (
                  <motion.div key={`card-${i}`}
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease } }}
                  >
                    <DraftCard
                      draft={drafts[i]} index={i}
                      onExpand={() => setExpanded(i)}
                      onDownload={() => download(drafts[i])}
                      onGenerateSite={() => download(drafts[i])}
                      onGoToEditor={() => setShowCode(i)}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>
            ))}
          </div>
        )}
      </div>

      {/* Expand modal */}
      <AnimatePresence>
        {expanded !== null && (
          <Overlay onClose={() => setExpanded(null)}>
            <ModalShell maxWidth={1140} mobile={mobile}>
              <div style={{ ...s.modalBar, ...(mobile ? { flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '12px 14px' } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={s.modalTitle}>{drafts[expanded]?.style}</strong>
                  {!mobile && <span style={s.modalSub}>{drafts[expanded]?.palette}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...(mobile ? { width: '100%', justifyContent: 'space-between' } : {}) }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCode(expanded)}>
                    <ArrowRight size={13} /> Editor
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => download(drafts[expanded])}>
                    <Zap size={13} /> Generate Full Site
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(null)}><X size={14} /></button>
                </div>
              </div>
              <iframe srcDoc={drafts[expanded]?.html} style={s.bigIframe} sandbox="allow-scripts allow-same-origin" title={drafts[expanded]?.style} />
            </ModalShell>
          </Overlay>
        )}
      </AnimatePresence>

      {/* Code modal */}
      <AnimatePresence>
        {showCode !== null && (
          <Overlay onClose={() => setShowCode(null)}>
            <ModalShell maxWidth={860}>
              <div style={s.modalBar}>
                <strong style={s.modalTitle}>{drafts[showCode]?.style} — HTML</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(drafts[showCode]?.html)}>Copy</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCode(null)}><X size={14} /></button>
                </div>
              </div>
              <pre style={s.code}><code>{drafts[showCode]?.html}</code></pre>
            </ModalShell>
          </Overlay>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── DraftSkeleton ────────────────────────────────────────────── */
const SKEL_ACCENTS = ['#5A84A6', '#7EB8A4', '#A09BCC']
const STEPS = [
  ['Analyzing brief…', 'Crafting direction…', 'Writing HTML…'],
  ['Exploring palette…', 'Defining layout…', 'Styling components…'],
  ['Building concept…', 'Setting typography…', 'Polishing details…'],
]

function DraftSkeleton({ index }) {
  const accent = SKEL_ACCENTS[index % SKEL_ACCENTS.length]
  const steps = STEPS[index % STEPS.length]
  const [step, setStep] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setInterval(() => setStep(s => (s + 1) % steps.length), 2000 + index * 400)
    return () => clearInterval(timerRef.current)
  }, [])

  return (
    <div style={{ ...s.card, position: 'relative', overflow: 'hidden', borderTopColor: accent, borderTopWidth: 2 }}>
      <motion.div
        style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: `linear-gradient(105deg, transparent 30%, ${accent}12 50%, transparent 70%)`,
        }}
        animate={{ x: ['-120%', '120%'] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.55 }}
      />

      <div style={s.cardLine} />

      <div style={s.cardHead}>
        <div style={s.cardMeta}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <Shimmer width={90} height={11} accent={accent} />
            <Shimmer width={60} height={9} accent={accent} delay={0.1} />
          </div>
        </div>
        <div style={s.cardActions}>
          <Shimmer width={110} height={28} accent={accent} delay={0.05} />
          <Shimmer width={130} height={28} accent={accent} delay={0.1} />
        </div>
      </div>

      <Shimmer width="85%" height={10} accent={accent} delay={0.05} style={{ margin: '0 16px 14px' }} />

      <div style={{ ...s.preview, display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
        <Shimmer width="100%" height={72} accent={accent} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Shimmer width="60%" height={44} accent={accent} delay={0.1} />
          <Shimmer width="40%" height={44} accent={accent} delay={0.2} />
        </div>
        <Shimmer width="100%" height={56} accent={accent} delay={0.15} />
        <div style={{ display: 'flex', gap: 8 }}>
          {[0,1,2].map(i => <Shimmer key={i} width="33%" height={36} accent={accent} delay={i * 0.1 + 0.2} />)}
        </div>
        <Shimmer width="75%" height={32} accent={accent} delay={0.3} />
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <motion.div
          style={{ width: 5, height: 5, borderRadius: '50%', background: accent, flexShrink: 0 }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.3, 0.8] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        />
        <AnimatePresence mode="wait">
          <motion.span
            key={step}
            style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-ui)' }}
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
          >
            {steps[step]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Shimmer({ width, height, accent, delay = 0, style: extraStyle }) {
  return (
    <motion.div
      style={{ width, height, borderRadius: 5, background: 'var(--bg-raised)', flexShrink: 0, ...extraStyle }}
      animate={{ opacity: [0.35, 0.7, 0.35] }}
      transition={{ duration: 1.7, repeat: Infinity, delay, ease: 'easeInOut' }}
    />
  )
}

/* ── DraftCard ─────────────────────────────────────────────────── */
const ACCENTS = [
  { color: '#5A84A6', glow: 'rgba(90,132,166,0.25)' },
  { color: '#7EB8A4', glow: 'rgba(126,184,164,0.25)' },
  { color: '#A09BCC', glow: 'rgba(160,155,204,0.25)' },
]

function DraftCard({ draft, index, onExpand, onGenerateSite, onGoToEditor, mobile }) {
  const [hov, setHov] = useState(false)
  const ac = ACCENTS[index % 3]

  return (
    <div
      style={{
        ...s.card,
        boxShadow: hov ? `var(--shadow-lg), 0 0 40px ${ac.glow}` : 'var(--shadow)',
        borderColor: hov ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.075)',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ ...s.cardHead, ...(mobile ? { flexDirection: 'column', alignItems: 'stretch', gap: 10 } : {}) }}>
        <div style={s.cardMeta}>
          <div style={s.cardStyle}>{draft.style}</div>
        </div>
        {mobile && draft.mood && (
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-ui)', lineHeight: 1.4 }}>{draft.mood}</div>
        )}
        <div style={{ ...s.cardActions, ...(mobile ? { width: '100%', justifyContent: 'stretch' } : {}) }}>
          <button className="btn btn-ghost" onClick={onGoToEditor} style={{ ...s.cardBtn, ...(mobile ? { flex: 1 } : {}) }}>
            <ArrowRight size={10} /> Go to Editor
          </button>
          <button className="btn btn-primary" onClick={onGenerateSite} style={{ ...s.cardBtn, ...(mobile ? { flex: 1 } : {}) }}>
            <Zap size={10} /> Generate Full Site
          </button>
        </div>
      </div>

      <div style={s.preview} onClick={onExpand}>
        <iframe
          srcDoc={draft.html}
          style={s.iframe}
          sandbox="allow-scripts allow-same-origin"
          scrolling="no"
          title={draft.style}
        />
        <motion.div
          style={s.previewOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: hov ? 1 : 0 }}
          transition={{ duration: 0.22 }}
        >
          <span style={s.expandBadge}><Expand size={13} /> View Expanded</span>
        </motion.div>
      </div>
    </div>
  )
}

/* ── Overlay + ModalShell ─────────────────────────────────────── */
function Overlay({ children, onClose }) {
  return (
    <motion.div style={s.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      {children}
    </motion.div>
  )
}

function ModalShell({ children, maxWidth, mobile }) {
  return (
    <motion.div
      style={{ ...s.modal, maxWidth, ...(mobile ? { maxWidth: '100%', height: '100%', borderRadius: 0 } : {}) }}
      initial={{ scale: 0.95, y: 28 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0.95, y: 28 }}
      transition={{ duration: 0.35, ease }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </motion.div>
  )
}

const s = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' },

  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 22px',
    background: 'var(--bg-topbar)',
    borderBottom: '1px solid var(--border)',
    gap: 16, position: 'sticky', top: 0, zIndex: 10,
  },
  promptChip: {
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 100, padding: '5px 8px 5px 16px',
    flex: 1, maxWidth: 560, minWidth: 0,
  },
  chipText: { fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },

  errorBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 24px', background: 'rgba(239,68,68,0.12)', color: '#F87171',
    fontSize: 13, borderBottom: '1px solid rgba(239,68,68,0.2)',
  },

  body: { flex: 1, padding: '32px 28px' },
  gridTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-3)', fontFamily: 'var(--font-ui)', marginBottom: 16 },
  grid: { display: 'grid', gap: 22 },

  carouselTrackWrap: { overflow: 'hidden', width: '100%', touchAction: 'pan-y pinch-zoom' },
  carouselTrack: { display: 'flex', cursor: 'grab', width: '300%' },
  carouselSlide: { flex: '0 0 33.333%', minWidth: 0, padding: '12px 10px', boxSizing: 'border-box' },
  carouselDots: { display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 },
  carouselDot: { height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0, transition: 'width 0.25s ease, background 0.2s' },
  swipeHint: {
    position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 100, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-ui)',
    zIndex: 5, pointerEvents: 'none', whiteSpace: 'nowrap',
  },
  card: {
    background: 'var(--bg-card)',
    border: '1px solid',
    borderRadius: 'var(--r-xl)',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    backdropFilter: 'blur(12px)',
    transition: 'box-shadow 0.3s ease',
    position: 'relative',
  },
  cardLine: { height: 2, flexShrink: 0 },
  cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px 10px', gap: 12 },
  cardMeta: { display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 },

  cardStyle: { fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' },
  cardActions: { display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' },
  cardBtn: { fontSize: 10, padding: '6px 8px', gap: 4, lineHeight: 1 },

  preview: { position: 'relative', cursor: 'pointer', borderTop: '1px solid var(--border)', height: 'clamp(250px, 60vh, 75vh)', overflow: 'hidden' },
  iframe: { width: '200%', height: '200%', border: 'none', transform: 'scale(0.5)', transformOrigin: 'top left', pointerEvents: 'none', background: '#fff' },
  previewOverlay: {
    position: 'absolute', inset: 0,
    background: 'rgba(7,7,10,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  expandBadge: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'var(--bg-elevated)', backdropFilter: 'blur(12px)',
    border: '1px solid var(--border-mid)',
    color: 'var(--text)', padding: '9px 18px', borderRadius: 100, fontSize: 13, fontWeight: 500,
  },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'min(24px, 2vw)', zIndex: 100 },
  modal: {
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--border-mid)',
    borderRadius: 'var(--r-2xl)',
    boxShadow: 'var(--shadow-lg)',
    width: '100%', height: '90vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid var(--border)',
    gap: 16, flexShrink: 0,
  },

  modalTitle: { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.02em' },
  modalSub: { fontSize: 12, color: 'var(--text-3)' },
  bigIframe: { width: '100%', flex: 1, border: 'none', background: '#fff' },
  code: {
    flex: 1, overflow: 'auto', padding: 20,
    fontSize: 12, lineHeight: 1.65,
    fontFamily: "'SF Mono','Fira Code',monospace",
    color: 'var(--text-2)',
    background: 'var(--bg)',
    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  },
}
