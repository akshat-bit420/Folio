import { useRef } from 'react'
import { useFolio } from '../app/FolioContext'
import { EmptyState } from '../components/EmptyState'
import { ProgressBar } from '../components/ProgressBar'
import { BookCard } from '../library/BookCard'
import { formatRelativeOpened } from '../utils/time'
import styles from './LibraryPage.module.css'

export function LibraryPage() {
  const { books, progressById, coverUrlById, searchQuery, openBook, importPdf, importing } =
    useFolio()
  const fileRef = useRef<HTMLInputElement>(null)

  const query = searchQuery.trim().toLowerCase()
  const visible = query
    ? books.filter((book) => book.title.toLowerCase().includes(query))
    : books

  const continueBook = [...books]
    .filter((book) => book.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))[0]

  const pickFile = () => fileRef.current?.click()

  if (books.length === 0) {
    return (
      <section>
        <input
          ref={fileRef}
          className={styles.file}
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void importPdf(file)
          }}
        />
        <EmptyState
          title="Your library is empty."
          action={{
            label: importing ? 'Importing…' : 'Import PDF',
            onClick: pickFile,
          }}
        />
      </section>
    )
  }

  return (
    <section>
      {continueBook && !query ? (
        <div className={styles.continue}>
          <p className={styles.kicker}>Continue reading</p>
          <button type="button" className={styles.continueBtn} onClick={() => void openBook(continueBook.id)}>
            <span className={styles.continueTitle}>{continueBook.title}</span>
            <ProgressBar value={progressById[continueBook.id]?.percent ?? 0} />
            <span className={styles.continueMeta}>
              {progressById[continueBook.id]?.percent ?? 0}% read ·{' '}
              {formatRelativeOpened(continueBook.lastOpenedAt)}
            </span>
          </button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className={styles.emptySearch}>No books match that title.</p>
      ) : (
        <div className={styles.grid}>
          {visible.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              progress={progressById[book.id]}
              coverUrl={coverUrlById[book.id]}
              onOpen={() => void openBook(book.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
