import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, Map, ArrowRight } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle.jsx'
import { listPlans } from '../lib/api.js'

const ease = [0.22, 1, 0.36, 1]
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const up = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }

export default function Home({ theme, onToggleTheme }) {
  const navigate  = useNavigate()
  const [prompt,  setPrompt]  = useState('')
  const [recentPlans, setRecentPlans] = useState([])

  useEffect(() => {
    listPlans().then(setRecentPlans).catch(() => {})
  }, [])

  function deriveName(p) {
    const words = p.trim().split(/\s+/).slice(0, 6).join(' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  function handleDraft() {
    if (!prompt.trim()) return
    navigate('/quick-draft', { state: { prompt: prompt.trim() } })
  }

  function handlePlan() {
    if (!prompt.trim()) return
    const name = deriveName(prompt)
    navigate('/plan/new', { state: { prompt: prompt.trim(), name } })
  }

  const hasPrompt = prompt.trim().length > 0

  return (
    <div style={s.root}>
      <Orbs />

      {/* Nav */}
      <motion.nav style={s.nav} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
        <div style={s.logo}>
          <span style={s.logoText}>Site Creation</span>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </motion.nav>

      {/* Center */}
      <motion.section style={s.center} variants={stagger} initial="hidden" animate="show">

        <motion.h1 variants={up} style={s.headline}>
          What are we<br />
          <span style={s.accent}>building today?</span>
        </motion.h1>

        {/* Prompt card with inline CTAs */}
        <motion.div variants={up} style={s.promptWrap}>
          <textarea
            value={prompt}
            placeholder="Describe the business, project or idea — e.g. A luxury spa in Miami targeting busy professionals who crave weekend escapes…"
            rows={4}
            style={s.promptTA}
            onChange={e => {
              setPrompt(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 220) + 'px'
            }}
          />
          <div style={s.promptFooter}>
            {prompt.length > 0
              ? <span style={s.charCount}>{prompt.length} chars</span>
              : <span style={s.promptHint}>Describe your project, then choose a flow</span>
            }
            <div style={s.ctaRow}>
              <ActionBtn
                icon={Zap}
                label="Quick Draft"
                active={hasPrompt}
                accent="var(--amber)"
                accentDim="var(--amber-dim)"
                accentBorder="var(--amber-border)"
                onClick={handleDraft}
              />
              <ActionBtn
                icon={Map}
                label="Plan Mode"
                active={hasPrompt}
                accent="rgba(140,135,190,1)"
                accentDim="rgba(140,135,190,0.10)"
                accentBorder="rgba(140,135,190,0.30)"
                onClick={handlePlan}
              />
            </div>
          </div>
        </motion.div>

        {/* Recent plans */}
        {recentPlans.length > 0 && (
          <motion.div variants={up} style={s.recentWrap}>
            <div style={s.recentList}>
              {recentPlans.map(plan => (
                <RecentPlanRow key={plan.id} plan={plan} onClick={() => navigate(`/plan/${plan.id}`)} />
              ))}
            </div>
          </motion.div>
        )}

      </motion.section>
    </div>
  )
}

/* ── ActionBtn ────────────────────────────────────────────────── */
function ActionBtn({ icon: Icon, label, active, accent, accentDim, accentBorder, onClick }) {
  const [hov, setHov] = useState(false)
  const lit = hov && active

  return (
    <motion.button
      style={{
        ...s.actionBtn,
        background: lit ? accentDim : 'var(--bg-raised)',
        borderColor: lit ? accentBorder : 'var(--border)',
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
      <span style={s.recentDot} />
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
      <motion.div style={{ ...s.orb, width: 560, height: 560, background: 'var(--orb-1)', top: '-160px', right: '-80px' }}
        animate={{ x: [0,24,-14,0], y: [0,-18,12,0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div style={{ ...s.orb, width: 400, height: 400, background: 'var(--orb-2)', bottom: '-80px', left: '-60px' }}
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
    padding: '0 32px 64px',
    position: 'relative', overflow: 'hidden',
  },
  orbRoot: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: '50%', filter: 'blur(90px)' },

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
    paddingTop: 72,
    display: 'flex', flexDirection: 'column', gap: 32,
    position: 'relative', zIndex: 1, flex: 1,
  },
  headline: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(32px, 4.2vw, 52px)',
    letterSpacing: '-0.04em',
    lineHeight: 1.15, paddingBottom: 4,
    textAlign: 'left',
    color: 'var(--text)',
  },
  accent: { color: 'var(--amber)' },

  /* Prompt card */
  promptWrap: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-mid)',
    borderRadius: 'var(--r-xl)',
    overflow: 'hidden',
    boxShadow: 'var(--shadow-lg)',
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
  promptHint: { fontSize: 11.5, color: 'var(--text-3)', flex: 1 },
  charCount: { fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flex: 1 },

  /* Action buttons */
  ctaRow: { display: 'flex', gap: 8, flexShrink: 0 },
  actionBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    padding: '9px 16px',
    border: '1px solid',
    borderRadius: 'var(--r-lg)',
    fontFamily: 'var(--font-ui)',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  actionLabel: { fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1, transition: 'color 0.15s', fontFamily: 'var(--font-display)' },

  footer: { fontSize: 11.5, color: 'var(--text-3)', marginTop: 'auto', paddingTop: 40, position: 'relative', zIndex: 1 },

  /* Recent plans */
  recentWrap: { display: 'flex', flexDirection: 'column', marginTop: 4 },
  recentList: { display: 'flex', flexDirection: 'column', gap: 1 },
  recentRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 10px',
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
