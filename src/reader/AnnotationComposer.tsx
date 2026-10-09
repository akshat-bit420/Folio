import { useEffect, useState } from 'react'
import styles from './AnnotationComposer.module.css'

type AnnotationComposerProps = {
  selectedText: string
  onSave: (body: string) => void
  onCancel: () => void
}

export function AnnotationComposer({ selectedText, onSave, onCancel }: AnnotationComposerProps) {
  const [body, setBody] = useState('')

  useEffect(() => {
    setBody('')
  }, [selectedText])

  return (
    <div className={styles.card}>
      <p className={styles.label}>Selected text</p>
      <p className={styles.quote}>“{selectedText}”</p>
      <textarea
        className={styles.editor}
        placeholder="Your note"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        autoFocus
      />
      <div className={styles.row}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            const next = body.trim()
            if (!next) return
            onSave(next)
          }}
        >
          Save
        </button>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
