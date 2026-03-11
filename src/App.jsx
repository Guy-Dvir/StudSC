import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTheme } from './lib/useTheme.js'
import Home from './pages/Home.jsx'
import QuickDraft from './pages/QuickDraft.jsx'
import PlanMode from './pages/PlanMode.jsx'

export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"            element={<Home       theme={theme} onToggleTheme={toggle} />} />
        <Route path="/quick-draft" element={<QuickDraft theme={theme} onToggleTheme={toggle} />} />
        <Route path="/plan/:id"    element={<PlanMode   theme={theme} onToggleTheme={toggle} />} />
      </Routes>
    </BrowserRouter>
  )
}
