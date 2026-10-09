import type { MarkupTool } from '../types/models'
import styles from './ReaderToolbar.module.css'

type ReaderToolbarProps = {
  visible: boolean
  pageLabel: string
  pageInput: string
  onPageInputChange: (value: string) => void
  onPageCommit: () => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onBack: () => void
  bookmarked: boolean
  onToggleBookmark: () => void
  tool: MarkupTool
  onTool: (tool: MarkupTool) => void
  onNotes: () => void
  onSettings: () => void
  onZoomOut: () => void
  onZoomIn: () => void
  zoomLabel: string
  onFullscreen: () => void
}

export function ReaderToolbar({
  visible,
  pageLabel,
  pageInput,
  onPageInputChange,
  onPageCommit,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onBack,
  bookmarked,
  onToggleBookmark,
  tool,
  onTool,
  onNotes,
  onSettings,
  onZoomOut,
  onZoomIn,
  zoomLabel,
  onFullscreen,
}: ReaderToolbarProps) {
  return (
    <div className={`${styles.bar} ${visible ? styles.visible : ''}`}>
      <button type="button" className={styles.btn} onClick={onBack}>
        Library
      </button>
      <span className={styles.rule} />
      <button type="button" className={styles.btn} onClick={onPrev} disabled={!canPrev}>
        Prev
      </button>
      <form
        className={styles.pageForm}
        onSubmit={(event) => {
          event.preventDefault()
          onPageCommit()
        }}
      >
        <input
          className={styles.pageInput}
          value={pageInput}
          onChange={(event) => onPageInputChange(event.target.value)}
          onBlur={onPageCommit}
          aria-label="Page number"
        />
        <span className={styles.pageTotal}>{pageLabel}</span>
      </form>
      <button type="button" className={styles.btn} onClick={onNext} disabled={!canNext}>
        Next
      </button>
      <span className={styles.rule} />
      <button
        type="button"
        className={`${styles.btn} ${bookmarked ? styles.active : ''}`}
        onClick={onToggleBookmark}
      >
        {bookmarked ? 'Bookmarked' : 'Bookmark'}
      </button>
      <button
        type="button"
        className={`${styles.btn} ${tool === 'highlight' ? styles.active : ''}`}
        onClick={() => onTool(tool === 'highlight' ? 'none' : 'highlight')}
      >
        Highlight
      </button>
      <button
        type="button"
        className={`${styles.btn} ${tool === 'annotate' ? styles.active : ''}`}
        onClick={() => onTool(tool === 'annotate' ? 'none' : 'annotate')}
      >
        Annotate
      </button>
      <button type="button" className={styles.btn} onClick={onNotes}>
        Notes
      </button>
      <button type="button" className={styles.btn} onClick={onSettings}>
        Theme
      </button>
      <span className={styles.rule} />
      <button type="button" className={styles.btn} onClick={onZoomOut}>
        −
      </button>
      <span className={styles.zoom}>{zoomLabel}</span>
      <button type="button" className={styles.btn} onClick={onZoomIn}>
        +
      </button>
      <button type="button" className={styles.btn} onClick={onFullscreen}>
        Fullscreen
      </button>
    </div>
  )
}
