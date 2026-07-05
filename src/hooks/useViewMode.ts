import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

export function useViewMode() {
  const { viewMode, setViewMode } = useStore()
  const [screenMobile, setScreenMobile] = useState(() => window.innerWidth < 768)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setScreenMobile(e.matches)
    mq.addEventListener('change', handler)
    setScreenMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isMobile = viewMode === 'mobile' || (viewMode === 'auto' && screenMobile)

  function toggle() {
    setViewMode(isMobile ? 'desktop' : 'mobile')
  }

  return { isMobile, viewMode, toggle, setViewMode }
}
