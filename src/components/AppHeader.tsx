import { useRef } from 'react'
import { useFolio } from '../app/FolioContext'
import type { AppView } from '../types/models'
import { ThemePopover } from './ThemePopover'
import styles from './AppHeader.module.css'

export function AppHeader() {
  const { view, setView, searchQuery, setSearchQuery, importPdf, importing } = useFolio()
  const inputRef = useRef<HTMLInputElement>(null)

  const nav = (next: AppView) => {
    if (next !== 'library') setSearchQuery('')
    setView(next)
  }

  return (
    <header className={styles.header}>
      <button type="button" className={styles.wordmark} onClick={() => nav('library')}>
        Folio
      </button>

      <nav className={styles.nav} aria-label="Main">
        <NavLink label="Library" active={view === 'library'} onClick={() => nav('library')} />
        <NavLink label="Notes" active={view === 'notes'} onClick={() => nav('notes')} />
        <NavLink label="Activity" active={view === 'activity'} onClick={() => nav('activity')} />
      </nav>

      <div className={styles.tools}>
        {view === 'library' ? (
          <input
            className={styles.search}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search library"
          />
        ) : null}
        <ThemePopover />
        <input
          ref={inputRef}
          className={styles.file}
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void importPdf(file)
          }}
        />
        <button
          type="button"
          className={styles.importBtn}
          disabled={importing}
          onClick={() => inputRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Import PDF'}
        </button>
      </div>
    </header>
  )
}

function NavLink({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`${styles.link} ${active ? styles.active : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}
