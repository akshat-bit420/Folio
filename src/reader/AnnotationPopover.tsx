import { useEffect, useState } from 'react'
import type { Annotation } from '../types/models'
import { formatDateTime } from '../utils/time'
import styles from './AnnotationPopover.module.css'

type AnnotationPopoverProps = {
  annotation: Annotation
  onSave: (body: string) => void
  onDelete: () => void
  onClose: () => void
}

export function AnnotationPopover({
  annotation,
  onSave,
  onDelete,
  onClose,
}: AnnotationPopoverProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(annotation.body)

  useEffect(() => {
    setEditing(false)
    setDraft(annotation.body)
  }, [annotation.id, annotation.body])

  const first = annotation.anchor.rects[0]
  const top = first ? `${(first.y + first.h) * 100}%` : '8%'
  const left = first ? `${first.x * 100}%` : '8%'

  return (
    <div
      className={styles.card}
      style={{ top, left }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <p className={styles.label}>Selected text</p>
      <p className={styles.quote}>“{annotation.anchor.selectedText}”</p>
      {editing ? (
        <textarea
          className={styles.editor}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          autoFocus
        />
      ) : (
        <p className={styles.body}>{annotation.body}</p>
      )}
      <p className={styles.meta}>Created {formatDateTime(annotation.createdAt)}</p>
      <div className={styles.row}>
        {editing ? (
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              const body = draft.trim()
              if (!body) return
              onSave(body)
              setEditing(false)
            }}
          >
            Save
          </button>
        ) : (
          <button type="button" className={styles.btn} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button type="button" className={styles.danger} onClick={onDelete}>
          Delete
        </button>
        <button type="button" className={styles.btn} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
