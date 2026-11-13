// import { useEffect, useRef, useState } from 'react'
// import styles from './ThemePopover.module.css'

// export function ThemePopover() {
//   const [open, setOpen] = useState(false)
//   const wrapRef = useRef<HTMLDivElement>(null)

//   useEffect(() => {
//     if (!open) return
//     const onDoc = (event: MouseEvent) => {
//       if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
//     }
//     document.addEventListener('mousedown', onDoc)
//     return () => document.removeEventListener('mousedown', onDoc)
//   }, [open])

//   return (
//     <div className={styles.wrap} ref={wrapRef}>
//       <button type="button" className={styles.trigger} onClick={() => setOpen((value) => !value)}>
//         Theme
//       </button>
//       {open ? (
//         <div className={styles.panel}>
//           <p className={styles.label}>Reading theme</p>
//           <p className={styles.value}>Kindle</p>
//           <p className={styles.hint}>More themes later.</p>
//         </div>
//       ) : null}
//     </div>
//   )
// }

import { useEffect, useRef, useState } from 'react'
import { useFolio } from '../app/FolioContext'
import type { ThemeId } from '../types/models'
import styles from './ThemePopover.module.css'

const THEME_OPTIONS: Array<{ id: ThemeId; label: string; description: string }> = [
  { id: 'kindle', label: 'Kindle', description: 'Warm e-ink monochrome' },
  { id: 'dark', label: 'Dark e-ink', description: 'Floating text, no page edges' },
]

export function ThemePopover() {
  const { theme, setTheme } = useFolio()
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
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                theme === option.id
                  ? `${styles.option} ${styles.optionActive}`
                  : styles.option
              }
              onClick={() => setTheme(option.id)}
            >
              {option.label}
              <span className={styles.optionDescription}>{option.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
} 