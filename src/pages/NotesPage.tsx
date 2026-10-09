import { useEffect, useMemo, useState } from 'react'
import { useFolio } from '../app/FolioContext'
import { EmptyState } from '../components/EmptyState'
import { formatDateTime } from '../utils/time'
import styles from './NotesPage.module.css'

export function NotesPage() {
  const { notes, createNote, saveNote, deleteNote } = useFolio()
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const active = useMemo(
    () => notes.find((note) => note.id === activeId) ?? null,
    [activeId, notes],
  )

  useEffect(() => {
    if (active) {
      setTitle(active.title)
      setContent(active.content)
      return
    }
    setTitle('')
    setContent('')
  }, [active])

  if (notes.length === 0) {
    return (
      <EmptyState
        title="No notes yet."
        action={{
          label: 'New note',
          onClick: () => {
            void createNote().then((note) => setActiveId(note.id))
          },
        }}
      />
    )
  }

  return (
    <section className={styles.layout}>
      <aside className={styles.list}>
        <button
          type="button"
          className={styles.newBtn}
          onClick={() => {
            void createNote().then((note) => setActiveId(note.id))
          }}
        >
          New note
        </button>
        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            className={`${styles.item} ${note.id === activeId ? styles.itemActive : ''}`}
            onClick={() => setActiveId(note.id)}
          >
            <span className={styles.itemTitle}>{note.title || 'Untitled'}</span>
            <span className={styles.itemMeta}>{formatDateTime(note.updatedAt)}</span>
          </button>
        ))}
      </aside>

      {active ? (
        <div className={styles.editor}>
          <input
            className={styles.title}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveNote({ ...active, title: title.trim() || 'Untitled', content })}
            aria-label="Note title"
          />
          <textarea
            className={styles.body}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onBlur={() => void saveNote({ ...active, title: title.trim() || 'Untitled', content })}
            placeholder="Write quietly…"
            aria-label="Note content"
          />
          <div className={styles.footer}>
            <span>
              Created {formatDateTime(active.createdAt)} · Updated {formatDateTime(active.updatedAt)}
            </span>
            <button
              type="button"
              className={styles.delete}
              onClick={() => {
                void deleteNote(active.id)
                setActiveId(notes.find((note) => note.id !== active.id)?.id ?? null)
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
