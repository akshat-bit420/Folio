import { useFolio } from '../app/FolioContext'
import { EmptyState } from '../components/EmptyState'
import { formatShortDate } from '../utils/time'
import styles from './ActivityPage.module.css'

export function ActivityPage() {
  const { books, progressById, openBook } = useFolio()

  const entries = [...books]
    .filter((book) => book.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))
    .map((book) => ({
      bookId: book.id,
      title: book.title,
      lastOpenedAt: book.lastOpenedAt as string,
      percent: progressById[book.id]?.percent ?? 0,
    }))

  if (entries.length === 0) {
    return <EmptyState title="Nothing here yet. Open a book to see it here." />
  }

  return (
    <section className={styles.list}>
      {entries.map((entry) => (
        <button
          key={entry.bookId}
          type="button"
          className={styles.row}
          onClick={() => void openBook(entry.bookId)}
        >
          <span className={styles.title}>{entry.title}</span>
          <span className={styles.meta}>Last opened: {formatShortDate(entry.lastOpenedAt)}</span>
          <span className={styles.meta}>Current progress: {entry.percent}%</span>
        </button>
      ))}
    </section>
  )
}
