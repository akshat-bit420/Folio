import { useEffect } from 'react'
import { isTypingTarget } from '../utils/selection'

type ShortcutHandlers = {
  onPrev?: () => void
  onNext?: () => void
  onEscape?: () => void
}

export function useShortcuts(enabled: boolean, handlers: ShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlers.onPrev?.()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        handlers.onNext?.()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        handlers.onEscape?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, handlers])
}
