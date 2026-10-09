import { useCallback, useEffect, useRef, useState } from 'react'

export function useIdleChrome(idleMs = 2500, held = false) {
  const [visible, setVisible] = useState(true)
  const timer = useRef(0)

  const bump = useCallback(() => {
    setVisible(true)
    window.clearTimeout(timer.current)
    if (held) return
    timer.current = window.setTimeout(() => setVisible(false), idleMs)
  }, [held, idleMs])

  useEffect(() => {
    bump()
    return () => window.clearTimeout(timer.current)
  }, [bump])

  return { visible, bump }
}
