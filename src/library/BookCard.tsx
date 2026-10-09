import { ProgressBar } from '../components/ProgressBar'
import type { Book, ReadingProgress } from '../types/models'
import { formatRelativeOpened } from '../utils/time'
import styles from './BookCard.module.css'

type BookCardProps = {
  book: Book
  progress?: ReadingProgress
  coverUrl?: string
  onOpen: () => void
}

export function BookCard({ book, progress, coverUrl, onOpen }: BookCardProps) {
  const percent = progress?.percent ?? 0
  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div className={styles.cover}>
        {coverUrl ? (
          <img src={coverUrl} alt="" />
        ) : (
          <span className={styles.fallback}>{book.title}</span>
        )}
      </div>
      <h2 className={styles.title}>{book.title}</h2>
      <ProgressBar value={percent} />
      <p className={styles.meta}>{percent}% read</p>
      <p className={styles.meta}>{formatRelativeOpened(book.lastOpenedAt)}</p>
    </button>
  )
}
