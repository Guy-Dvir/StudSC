import { useState, useEffect } from 'react'

export function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    setMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return mobile
}
