import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, RefreshCw, Expand, Code2, Download, X, Zap, ArrowRight } from 'lucide-react'
import { generateDrafts } from '../lib/api.js'
import ThemeToggle from '../components/ThemeToggle.jsx'

const ease = [0.22, 1, 0.36, 1]

export default function QuickDraft({ theme, onToggleTheme }) {
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const [drafts,   setDrafts]   = useState(state?.drafts || [])
  const [prompt,   setPrompt]   = useState(state?.prompt || '')
  const [loading,  setLoading]  = useState(!state?.drafts?.length && !!state?.prompt)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState(null)
  const [showCode, setShowCode] = useState(null)

  useEffect(() => {
    if (!state?.drafts?.length && state?.prompt) generate(state.prompt)
  }, [])

  async function generate(p) {
    setLoading(true); setError('')
    try {
      const { drafts: d } = await generateDrafts(p)
      if (!Array.isArray(d) || d.length === 0) throw new Error('No drafts returned')
      setDrafts(d)
      setExpanded(null); setShowCode(null)
      try {
        const prev = JSON.parse(localStorage.getItem('draft-history') || '[]')
        prev.unshift({ id: Date.now().toString(), prompt: p, generatedAt: new Date().toISOString(), drafts: d })
        localStorage.setItem('draft-history', JSON.stringify(prev.slice(0, 20)))
      } catch (_) {}
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  async function regenerate() { await generate(prompt) }

  function download(draft) {
    const blob = new Blob([draft.html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${draft.style.toLowerCase().replace(/\s+/g, '-')}.html` })
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={s.root}>
      {/* Top bar */}
      <div style={s.topBar}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
          <ArrowLeft size={13} /> Home
        </button>
        <div style={s.promptChip}>
          <span style={s.chipText}>{prompt}</span>
          <button className="btn btn-ghost btn-sm" onClick={regenerate} disabled={loading} style={{ flexShrink: 0 }}>
            <motion.span animate={loading ? { rotate: 360 } : {}} transition={{ duration: 0.7, repeat: loading ? Infinity : 0, ease: 'linear' }}>
              <RefreshCw size={12} />
            </motion.span>
            {loading ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      {error && (
        <div style={s.errorBar}>{error} <button onClick={() => setError('')}><X size={13} /></button></div>
      )}

      {/* Grid */}
      <div style={s.body}>
        {!loading && drafts.length > 0 && (
          <div style={s.gridTitle}>Homepage Drafts</div>
        )}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="sk" style={s.grid} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {[0,1,2].map(i => <DraftSkeleton key={i} index={i} />)}
            </motion.div>
          ) : (
            <motion.div
              key="gr"
              style={s.grid}
              initial="h" animate="s"
              variants={{ s: { transition: { staggerChildren: 0.13 } } }}
            >
              {drafts.map((d, i) => (
                <motion.div key={d.style + i}
                  variants={{
                    h: { opacity: 0, y: 40, scale: 0.95 },
                    s: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.6, ease } }
                  }}
                >
                  <DraftCard
                    draft={d} index={i}
                    onExpand={() => setExpanded(i)}
                    onDownload={() => download(d)}
                    onGenerateSite={() => download(d)}
                    onGoToEditor={() => setShowCode(i)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Expand modal */}
      <AnimatePresence>
        {expanded !== null && (
          <Overlay onClose={() => setExpanded(null)}>
            <ModalShell maxWidth={1140}>
              <div style={s.modalBar}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={s.modalNum}>#{expanded + 1}</span>
                  <strong style={s.modalTitle}>{drafts[expanded]?.style}</strong>
                  <span style={s.modalSub}>{drafts[expanded]?.palette}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCode(expanded)}>
                    <ArrowRight size={13} /> Go to Editor
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
  const accent = SKEL_ACCENTS[index]
  const steps = STEPS[index]
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
          <span style={{ ...s.cardNum, color: accent }}>0{index + 1}</span>
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

function DraftCard({ draft, index, onExpand, onGenerateSite, onGoToEditor }) {
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
      <div style={s.cardHead}>
        <div style={s.cardMeta}>
          <span style={{ ...s.cardNum, color: ac.color }}>0{index + 1}</span>
          <div style={s.cardStyle}>{draft.style}</div>
        </div>
        <div style={s.cardActions}>
          <button className="btn btn-ghost" onClick={onGoToEditor} style={s.cardBtn}>
            <ArrowRight size={10} /> Go to Editor
          </button>
          <button className="btn btn-primary" onClick={onGenerateSite} style={s.cardBtn}>
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

function ModalShell({ children, maxWidth }) {
  return (
    <motion.div
      style={{ ...s.modal, maxWidth }}
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
    background: 'var(--bg-panel)',
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 },
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
  cardNum: { fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', paddingTop: 2, flexShrink: 0 },
  cardStyle: { fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' },
  cardActions: { display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' },
  cardBtn: { fontSize: 10, padding: '6px 8px', gap: 4, lineHeight: 1 },

  preview: { position: 'relative', cursor: 'pointer', borderTop: '1px solid var(--border)', height: '65vh', overflow: 'hidden' },
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

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 },
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
  modalNum: { fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-display)', fontWeight: 700 },
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
