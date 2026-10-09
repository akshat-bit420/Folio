import { FolioProvider, useFolio } from './app/FolioContext'
import { AppHeader } from './components/AppHeader'
import { ActivityPage } from './pages/ActivityPage'
import { LibraryPage } from './pages/LibraryPage'
import { NotesPage } from './pages/NotesPage'
import { ReaderScreen } from './reader/ReaderScreen'
import styles from './App.module.css'

function Shell() {
  const { view, ready, hint } = useFolio()

  if (!ready) {
    return (
      <div className={styles.boot}>
        <p>Folio</p>
      </div>
    )
  }

  if (view === 'reader') {
    return (
      <>
        <ReaderScreen />
        {hint ? <p className={styles.hint}>{hint}</p> : null}
      </>
    )
  }

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={styles.main}>
        {view === 'notes' ? <NotesPage /> : null}
        {view === 'activity' ? <ActivityPage /> : null}
        {view === 'library' ? <LibraryPage /> : null}
      </main>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

export default function App() {
  return (
    <FolioProvider>
      <Shell />
    </FolioProvider>
  )
}
