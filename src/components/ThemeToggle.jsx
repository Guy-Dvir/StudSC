import { motion } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark'

  return (
    <motion.button
      onClick={onToggle}
      style={s.btn}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        key={theme}
        initial={{ opacity: 0, rotate: -20, scale: 0.8 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, rotate: 20, scale: 0.8 }}
        transition={{ duration: 0.22 }}
      >
        {isDark
          ? <Sun size={14} strokeWidth={1.8} />
          : <Moon size={14} strokeWidth={1.8} />
        }
      </motion.div>
    </motion.button>
  )
}

const s = {
  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32,
    borderRadius: 8,
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    cursor: 'pointer',
    transition: 'background 0.18s, border-color 0.18s, color 0.18s',
    flexShrink: 0,
  }
}
