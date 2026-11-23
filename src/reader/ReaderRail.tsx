import styles from './ReaderRail.module.css'

type Props = {
    outlineAvailable: boolean
    outlineOpen: boolean
    onToggleOutline: () => void
}

/**
 * The reader's left icon rail — a permanent sliver of chrome with its own
 * space, separate from the Island. The top button toggles the document
 * outline panel; the faded buttons below are slots for future panels
 * (page thumbnails, notes) and do nothing yet.
 */
export function ReaderRail({ outlineAvailable, outlineOpen, onToggleOutline }: Props) {
    return (
        <nav className={styles.rail} aria-label="Reader sidebar">
            <button
                type="button"
                className={outlineOpen ? `${styles.railBtn} ${styles.railBtnOn}` : styles.railBtn}
                onClick={onToggleOutline}
                disabled={!outlineAvailable}
                title={outlineAvailable ? 'Document outline' : 'This document has no outline'}
                aria-label="Toggle document outline"
                aria-pressed={outlineOpen}
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
            </button>

            <div className={styles.railGap} />

            <button
                type="button"
                className={`${styles.railBtn} ${styles.railLater}`}
                disabled
                title="Page thumbnails — coming later"
                aria-label="Page thumbnails (coming later)"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
            </button>

            <button
                type="button"
                className={`${styles.railBtn} ${styles.railLater}`}
                disabled
                title="Notes & bookmarks — coming later"
                aria-label="Notes and bookmarks (coming later)"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
            </button>
        </nav>
    )
} 