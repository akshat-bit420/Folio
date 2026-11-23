import { useEffect, useMemo, useRef, useState } from 'react'
import type { OutlineEntry } from './pdf/PdfEngine'
import styles from './OutlinePanel.module.css'

type Props = {
    outline: OutlineEntry[]
    pageNumber: number
    onJump: (page: number) => void
    onClose: () => void
}

/**
 * The document outline panel that opens beside the reader rail. Renders the
 * PDF's embedded table of contents as a collapsible tree, highlights the
 * section containing the current page, and jumps on click.
 */
export function OutlinePanel({ outline, pageNumber, onJump, onClose }: Props) {
    const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

    // The section containing the current page: the LAST outline entry (in
    // document order) whose start page is at or before it. Children follow
    // their parents in document order and pages rise as you read deeper, so
    // the last such entry is the most specific section covering this page.
    const currentIndex = useMemo(() => {
        let found = -1
        for (let index = 0; index < outline.length; index += 1) {
            if (outline[index].pageNumber <= pageNumber) found = index
            else break
        }
        return found
    }, [outline, pageNumber])

    // Visible rows honor collapsed sections: once a row's section is
    // collapsed, every deeper row is skipped until one at the same or
    // shallower depth appears.
    const visible = useMemo(() => {
        const rows: { entry: OutlineEntry; index: number }[] = []
        let hideBelowDepth = Number.POSITIVE_INFINITY
        outline.forEach((entry, index) => {
            if (entry.depth <= hideBelowDepth) hideBelowDepth = Number.POSITIVE_INFINITY
            if (entry.depth > hideBelowDepth) return
            rows.push({ entry, index })
            if (collapsed.has(index)) hideBelowDepth = entry.depth
        })
        return rows
    }, [outline, collapsed])

    // Keep the highlighted section in view as the reader turns pages.
    const currentRef = useRef<HTMLButtonElement | null>(null)
    useEffect(() => {
        currentRef.current?.scrollIntoView({ block: 'nearest' })
    }, [currentIndex])

    const toggleCollapsed = (index: number) => {
        setCollapsed((previous) => {
            const next = new Set(previous)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }

    return (
        <aside className={styles.panel} aria-label="Document outline">
            <div className={styles.head}>
                <h2>Document outline</h2>
                <button
                    type="button"
                    className={styles.close}
                    onClick={onClose}
                    aria-label="Close outline"
                >
                    ✕
                </button>
            </div>

            {outline.length === 0 ? (
                <p className={styles.empty}>
                    This document has no outline. The table of contents is embedded by
                    the book's publisher — scanned or hand-made PDFs usually lack one.
                </p>
            ) : (
                <nav className={styles.tree}>
                    {visible.map(({ entry, index }) => {
                        const hasChildren = (outline[index + 1]?.depth ?? -1) > entry.depth
                        const isCurrent = index === currentIndex
                        const rowClass = isCurrent ? `${styles.row} ${styles.rowCurrent}` : styles.row
                        return (
                            <div
                                key={index}
                                className={rowClass}
                                style={{ paddingLeft: 6 + entry.depth * 18 }}
                            >
                                {hasChildren ? (
                                    <button
                                        type="button"
                                        className={styles.tw}
                                        onClick={() => toggleCollapsed(index)}
                                        aria-label={collapsed.has(index) ? 'Expand section' : 'Collapse section'}
                                    >
                                        {collapsed.has(index) ? '▸' : '▾'}
                                    </button>
                                ) : (
                                    <span className={`${styles.tw} ${styles.twLeaf}`} aria-hidden="true">
                                        ▸
                                    </span>
                                )}
                                <button
                                    type="button"
                                    ref={isCurrent ? currentRef : undefined}
                                    className={styles.title}
                                    onClick={() => onJump(entry.pageNumber)}
                                    title={entry.title}
                                >
                                    {entry.title}
                                </button>
                                <span className={styles.pg}>{entry.pageNumber}</span>
                            </div>
                        )
                    })}
                </nav>
            )}
        </aside>
    )
} 