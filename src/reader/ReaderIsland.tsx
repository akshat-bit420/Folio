import { useCallback, useEffect, useRef, useState } from 'react'
import type { MarkupTool } from '../types/models'
import styles from './ReaderIsland.module.css'

// How long the island stays open after the pointer (or the last click inside
// it) leaves. The fold itself is a slow 460ms ease, so closing reads as a
// deliberate settle instead of the old toolbar's instant snap.
const COLLAPSE_GRACE_MS = 1000

type ReaderIslandProps = {
    pageNumber: number
    pageCount: number
    pageInput: string
    onPageInputChange: (value: string) => void
    onPageCommit: () => void
    percent: number
    canPrev: boolean
    canNext: boolean
    onPrev: () => void
    onNext: () => void
    onLibrary: () => void
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
    // Anything that must not fold under the user (armed markup tool, open
    // composer, settings panel) holds the island open.
    held: boolean
    onExpandedChange?: (open: boolean) => void
}

const icons = {
    left: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9.8 3.2 5 8l4.8 4.8" /></svg>
    ),
    right: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6.2 3.2 11 8l-4.8 4.8" /></svg>
    ),
    bookmark: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M4.2 2.6h7.6v11l-3.8-2.9-3.8 2.9z" /></svg>
    ),
    pen: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13.2l.9-3 6.8-6.8a1.3 1.3 0 0 1 1.9 1.9L5.8 12l-2.8 1.2z" /><path d="M10 4.1l1.9 1.9" /></svg>
    ),
    note: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.8 4.4c0-.8.6-1.4 1.4-1.4h7.6c.8 0 1.4.6 1.4 1.4v4.8c0 .8-.6 1.4-1.4 1.4H7.4L4.6 13v-2.4h-.4c-.8 0-1.4-.6-1.4-1.4z" /></svg>
    ),
    list: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2.6" width="8" height="10.8" rx="1.2" /><path d="M6.2 5.6h3.6M6.2 8h3.6M6.2 10.4h2.2" /></svg>
    ),
    theme: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.5" /><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" /></svg>
    ),
    minus: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3.5 8h9" /></svg>
    ),
    plus: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9" /></svg>
    ),
    full: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10" /></svg>
    ),
    home: (
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1" /><rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1" /><rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1" /><rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1" /></svg>
    ),
}

function IslandButton({
    label,
    active = false,
    disabled = false,
    onClick,
    children,
}: {
    label: string
    active?: boolean
    disabled?: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            className={`${styles.cbtn} ${active ? styles.cbtnOn : ''}`}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
        >
            {children}
        </button>
    )
}

export function ReaderIsland({
    pageNumber,
    pageCount,
    pageInput,
    onPageInputChange,
    onPageCommit,
    percent,
    canPrev,
    canNext,
    onPrev,
    onNext,
    onLibrary,
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
    held,
    onExpandedChange,
}: ReaderIslandProps) {
    const [open, setOpen] = useState(false)
    const graceTimer = useRef(0)
    const pointerOver = useRef(false)
    const wasHeld = useRef(false)
    const lastPage = useRef(pageNumber)
    const [tick, setTick] = useState<'fwd' | 'back' | null>(null)

    const cancelCollapse = useCallback(() => {
        window.clearTimeout(graceTimer.current)
    }, [])

    const scheduleCollapse = useCallback(() => {
        window.clearTimeout(graceTimer.current)
        graceTimer.current = window.setTimeout(() => setOpen(false), COLLAPSE_GRACE_MS)
    }, [])

    const expand = useCallback(() => {
        cancelCollapse()
        setOpen(true)
    }, [cancelCollapse])

    // A markup tool, the annotation composer or the settings panel hold the
    // island open. When they clear, fold away unless the pointer is still on it.
    useEffect(() => {
        if (held) {
            wasHeld.current = true
            cancelCollapse()
            setOpen(true)
        } else if (wasHeld.current) {
            wasHeld.current = false
            if (!pointerOver.current) scheduleCollapse()
        }
    }, [held, cancelCollapse, scheduleCollapse])

    useEffect(() => {
        onExpandedChange?.(open)
    }, [open, onExpandedChange])

    // Slide-tick the page number whenever a turn lands, mirroring direction.
    useEffect(() => {
        if (lastPage.current === pageNumber) return
        const dir = pageNumber > lastPage.current ? 'fwd' : 'back'
        lastPage.current = pageNumber
        setTick(null)
        const raf = requestAnimationFrame(() => requestAnimationFrame(() => setTick(dir)))
        return () => cancelAnimationFrame(raf)
    }, [pageNumber])

    useEffect(() => () => window.clearTimeout(graceTimer.current), [])

    return (
        <div
            className={styles.wrap}
            data-island-root="true"
            onMouseEnter={() => {
                pointerOver.current = true
                expand()
            }}
            onMouseLeave={() => {
                pointerOver.current = false
                scheduleCollapse()
            }}
            onFocusCapture={expand}
            onBlurCapture={(event) => {
                const next = event.relatedTarget as Node | null
                if (!event.currentTarget.contains(next)) scheduleCollapse()
            }}
            onPointerDown={() => {
                // A click inside pins the island: restart the grace window so the
                // menu does not fold away mid-interaction.
                cancelCollapse()
                if (!held) scheduleCollapse()
            }}
        >
            <div className={`${styles.island} ${open ? styles.open : ''}`}>
                <input
                    className={`${styles.pg} ${tick === 'fwd' ? styles.tickFwd : ''} ${tick === 'back' ? styles.tickBack : ''}`}
                    value={pageInput}
                    onChange={(event) => onPageInputChange(event.target.value)}
                    onBlur={onPageCommit}
                    // Select the whole label on focus so typing replaces the
                    // range ("34–35") instead of editing inside it.
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault()
                            onPageCommit()
                        }
                    }}
                    aria-label="Page number"
                    style={{
                        width: `${Math.max(2, String(pageCount).length, pageInput.length) + 0.6}ch`,
                    }}
                />
                <span className={styles.idleExpander}>
                    <span className={styles.idleClip}>
                        <span className={styles.tot}>/ {pageCount}</span>
                    </span>
                </span>
                <span className={styles.expandExpander}>
                    <span className={styles.ctrlsClip}>
                        <span className={styles.ctrls}>
                            <IslandButton label="Previous page" disabled={!canPrev} onClick={onPrev}>
                                {icons.left}
                            </IslandButton>
                            <IslandButton label="Next page" disabled={!canNext} onClick={onNext}>
                                {icons.right}
                            </IslandButton>
                            <span className={styles.sep} />
                            <IslandButton
                                label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                                active={bookmarked}
                                onClick={onToggleBookmark}
                            >
                                {icons.bookmark}
                            </IslandButton>
                            <IslandButton
                                label="Highlight"
                                active={tool === 'highlight'}
                                onClick={() => onTool(tool === 'highlight' ? 'none' : 'highlight')}
                            >
                                {icons.pen}
                            </IslandButton>
                            <IslandButton
                                label="Annotate"
                                active={tool === 'annotate'}
                                onClick={() => onTool(tool === 'annotate' ? 'none' : 'annotate')}
                            >
                                {icons.note}
                            </IslandButton>
                            <IslandButton label="Notes" onClick={onNotes}>
                                {icons.list}
                            </IslandButton>
                            <IslandButton label="Theme & settings" onClick={onSettings}>
                                {icons.theme}
                            </IslandButton>
                            <span className={styles.sep} />
                            <IslandButton label="Zoom out" onClick={onZoomOut}>
                                {icons.minus}
                            </IslandButton>
                            <span className={styles.zoomLabel}>{zoomLabel}</span>
                            <IslandButton label="Zoom in" onClick={onZoomIn}>
                                {icons.plus}
                            </IslandButton>
                            <span className={styles.sep} />
                            <IslandButton label="Fullscreen" onClick={onFullscreen}>
                                {icons.full}
                            </IslandButton>
                            <IslandButton label="Back to library" onClick={onLibrary}>
                                {icons.home}
                            </IslandButton>
                        </span>
                    </span>
                </span>
                <span className={styles.iline}>
                    <i style={{ width: `${percent}%` }} />
                </span>
            </div>
        </div>
    )
} 