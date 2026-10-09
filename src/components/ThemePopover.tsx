import { useEffect, useRef, useState } from 'react'
import styles from './ThemePopover.module.css'

export function ThemePopover() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((value) => !value)}>
        Theme
      </button>
      {open ? (
        <div className={styles.panel}>
          <p className={styles.label}>Reading theme</p>
          <p className={styles.value}>Kindle</p>
          <p className={styles.hint}>More themes later.</p>
        </div>
      ) : null}
    </div>
  )
}
