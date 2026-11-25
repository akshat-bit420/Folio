import { useCallback, useEffect, useRef, useState } from 'react'
import type { MarkupTool } from '../types/models'
import { percentForPage } from '../utils/time'
import styles from './ReaderIsland.module.css'

// How long the island stays open after the pointer (or the last click inside
// it) leaves. The fold itself is a slow 460ms ease, so closing reads as a
// deliberate settle instead of the old toolbar's instant snap.
const COLLAPSE_GRACE_MS = 1000

// Wheel-scrub timing (ported from the approved Reader Island prototype).
// STOP_COMMIT_MS: the wheel must stay still this long before the previewed
// position becomes one real turn. SOFT_COMMIT_MS: the same for single arrow
// taps on the focused number, where another tap usually follows. A wheel
// notch is ~100 units (deltaMode 0); velocity (units per ms, smoothed) is
// raised to a power so fast scrolling skips further per notch than slow
// scrolling — capped so one notch can never overshoot a whole chapter.
const STOP_COMMIT_MS = 520
const SOFT_COMMIT_MS = 650
const WHEEL_PAGE_UNITS = 100
const SCRUB_MAX_SKIP = 14

type ReaderIslandProps = {
    pageNumber: number
    pageCount: number
    pageInput: string
    // Label/step math needs the layout: spread mode pairs even-odd pages after
    // the lone cover, so a scrub notch moves two pages and the previewed label
    // reads "36 – 37".
    spread: boolean
    rangeLabel?: string
    onPageInputChange: (value: string) => void
    onPageCommit: () => void
    // Wheel-scrub over the page-number area (and single arrow taps on the
    // focused number): the island previews the target locally and only calls
    // this ONCE, when the scrolling stops. getPagePreview renders a themed
    // miniature for the card (cached by the reader); chapterLabelForPage names
    // the outline section the previewed page sits in; railMarks are outline
    // start pages drawn as ticks on the card's rail.
    onScrubCommit?: (page: number) => void
    getPagePreview?: (page: number) => Promise<string | null>
    chapterLabelForPage?: (page: number) => string | null
    railMarks?: number[]
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

// Book parity mirrored from ReaderScreen (cover sits alone, even verso on the
// left): the pair — and therefore the label and progress anchor — for ANY
// page, not just the live one. The scrub card and the pill's underline both
// need this for the previewed position.
function pairOf(page: number, spread: boolean, total: number): [number, number | null] {
    if (!spread) return [Math.max(1, page), null]
    const left = page <= 1 ? 1 : page % 2 === 0 ? page : page - 1
    if (left === 1) return [1, null]
    return [left, left + 1 <= total ? left + 1 : null]
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
    spread,
    rangeLabel,
    onPageInputChange,
    onPageCommit,
    onScrubCommit,
    getPagePreview,
    chapterLabelForPage,
    railMarks,
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
    // Hover on the page-number zone (input + "/ total") arms the scroll hint
    // under the pill — the discoverability cue for the wheel scrub.
    const [pgHover, setPgHover] = useState(false)

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

    // ===== Wheel scrub (Change C from the approved prototype) =====
    // The wheel over the page number does NOT turn pages directly. It opens a
    // scrub: the pill's number and underline preview the target locally (with
    // an origin marker where the scrub started), a card below the island shows
    // real miniatures of the previewed spread, the chapter it sits in, how far
    // it is from the start, and a rail with the outline's chapters. Faster
    // scrolling skips further. When the scrolling stops, ONE real turn commits
    // the previewed page; Esc cancels and puts the label back.
    type Scrub = { fromPage: number; curPage: number }
    const scrubRef = useRef<Scrub | null>(null)
    const [scrub, setScrub] = useState<Scrub | null>(null)
    const applyScrub = useCallback((next: Scrub | null) => {
        scrubRef.current = next
        setScrub(next)
    }, [])
    const commitTimer = useRef(0)
    const wheelAcc = useRef(0)
    const lastWheelAt = useRef(0)
    const wheelSpeed = useRef(0)
    // Latest-ref for the commit callback: the reader's handler identity can
    // change (jumpToPage/attemptTurn depend on sequence and page), but the
    // commit timer must always call the current one.
    const scrubCommitRef = useRef(onScrubCommit)
    scrubCommitRef.current = onScrubCommit
    const miniRef = useRef<HTMLDivElement | null>(null)

    const percentOf = useCallback(
        (page: number) => {
            const [left, right] = pairOf(page, spread, pageCount)
            return percentForPage(spread ? right ?? left : left, Math.max(pageCount, 1))
        },
        [spread, pageCount],
    )

    const endScrub = useCallback(() => {
        window.clearTimeout(commitTimer.current)
        wheelAcc.current = 0
        wheelSpeed.current = 0
        applyScrub(null)
    }, [applyScrub])

    const commitScrub = useCallback(() => {
        const active = scrubRef.current
        endScrub()
        if (!active || active.curPage === active.fromPage) return
        scrubCommitRef.current?.(active.curPage)
    }, [endScrub])

    const scheduleCommit = useCallback(
        (delay: number) => {
            window.clearTimeout(commitTimer.current)
            commitTimer.current = window.setTimeout(commitScrub, delay)
        },
        [commitScrub],
    )

    // Miniature sheet tick: a blank page sweeps across the card's mini spread
    // in the scrub direction (capped at three concurrent), echoing the real
    // page-turn that will land when the scrolling stops.
    const tickMini = useCallback(
        (dir: 1 | -1) => {
            const mini = miniRef.current
            if (!mini || !spread) return
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
            if (mini.querySelectorAll('[data-tick]').length > 2) return
            const sheet = document.createElement('span')
            sheet.setAttribute('data-tick', '')
            sheet.className = dir > 0 ? styles.tickSheetFwd : styles.tickSheetBack
            sheet.addEventListener('animationend', () => sheet.remove(), { once: true })
            mini.appendChild(sheet)
        },
        [spread],
    )

    const move = useCallback(
        (units: number, soft = false) => {
            if (!units || pageCount < 1) return
            const current = scrubRef.current ?? { fromPage: pageNumber, curPage: pageNumber }
            const step = spread ? 2 : 1
            const next = Math.max(1, Math.min(pageCount, current.curPage + units * step))
            if (next !== current.curPage) {
                applyScrub({ fromPage: current.fromPage, curPage: next })
                tickMini(next > current.curPage ? 1 : -1)
            }
            scheduleCommit(soft ? SOFT_COMMIT_MS : STOP_COMMIT_MS)
        },
        [applyScrub, pageNumber, pageCount, spread, scheduleCommit, tickMini],
    )

    // Native non-passive listeners on the page-number zone (React's synthetic
    // wheel is passive at the root, so preventDefault would not stick — the
    // stage must not scroll while scrubbing). Same accumulator/velocity math
    // as the prototype: whole notches move the preview; the exponent turns a
    // fast stream into bigger skips.
    const pgZoneWheel = useCallback(
        (event: WheelEvent) => {
            event.preventDefault()
            const now = performance.now()
            const dt = Math.max(8, now - lastWheelAt.current)
            lastWheelAt.current = now
            const d = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY
            const inst = Math.abs(d) / dt
            wheelSpeed.current = wheelSpeed.current * 0.6 + inst * 0.4
            if (dt > 220) wheelSpeed.current = inst * 0.5
            wheelAcc.current += d / WHEEL_PAGE_UNITS
            const whole = Math.trunc(wheelAcc.current)
            if (!whole) {
                // Trickling below a notch: keep the card's settle timer alive so a
                // slow drag across the number still ends in one commit, not many.
                if (scrubRef.current) scheduleCommit(STOP_COMMIT_MS)
                return
            }
            wheelAcc.current -= whole
            const mult = 1 + Math.floor(Math.pow(wheelSpeed.current, 1.3) * 1.2)
            move(whole * Math.min(mult, SCRUB_MAX_SKIP))
        },
        [move, scheduleCommit],
    )

    const pgRef = useRef<HTMLInputElement | null>(null)
    const idleRef = useRef<HTMLSpanElement | null>(null)
    useEffect(() => {
        const els = [pgRef.current, idleRef.current].filter(
            (el): el is HTMLElement => el != null,
        )
        els.forEach((el) => el.addEventListener('wheel', pgZoneWheel, { passive: false }))
        return () => els.forEach((el) => el.removeEventListener('wheel', pgZoneWheel))
    }, [pgZoneWheel])

    // Esc cancels the scrub even when the input is not focused (wheel scrub):
    // capture phase so it wins over the reader's own Escape (exit reader)
    // while a preview is up, and never touches it otherwise.
    useEffect(() => {
        if (!scrub) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            endScrub()
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [scrub, endScrub])

    useEffect(
        () => () => {
            window.clearTimeout(commitTimer.current)
        },
        [],
    )

    // Miniature previews for the card: the pair under the previewed page,
    // rendered by the reader (themed + cached). The effect races only the
    // newest target; stale results are dropped.
    const [miniSrc, setMiniSrc] = useState<{ page: number; left: string | null; right: string | null } | null>(null)
    const scrubTargetPage = scrub?.curPage ?? null
    useEffect(() => {
        if (scrubTargetPage == null || !getPagePreview) return
        let cancelled = false
        const [left, right] = pairOf(scrubTargetPage, spread, pageCount)
        void (async () => {
            const leftUrl = left != null ? await getPagePreview(left) : null
            if (cancelled) return
            const rightUrl = right != null ? await getPagePreview(right) : null
            if (cancelled) return
            setMiniSrc({ page: scrubTargetPage, left: leftUrl, right: rightUrl })
        })()
        return () => {
            cancelled = true
        }
    }, [scrubTargetPage, spread, pageCount, getPagePreview])

    const chapterTitle =
        scrub != null && chapterLabelForPage ? chapterLabelForPage(scrub.curPage) : null
    const scrubPair = scrub != null ? pairOf(scrub.curPage, spread, pageCount) : null
    const scrubFromPair = scrub != null ? pairOf(scrub.fromPage, spread, pageCount) : null
    const scrubLabel =
        scrubPair != null
            ? scrubPair[1] != null
                ? `${scrubPair[0]} – ${scrubPair[1]}`
                : `${scrubPair[0]}`
            : ''
    const scrubPercent = scrub != null ? percentOf(scrub.curPage) : null
    const scrubFromPercent = scrub != null ? percentOf(scrub.fromPage) : null
    const scrubDelta =
        scrub != null && scrubFromPair != null && scrubPair != null
            ? (scrubPair[1] ?? scrubPair[0]) - (scrubFromPair[1] ?? scrubFromPair[0])
            : 0

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
            <div
                className={`${styles.island} ${open ? styles.open : ''} ${scrub ? styles.scrubbing : ''}`}
            >
                <span className={styles.pgZone}>
                    <input
                        ref={pgRef}
                        className={`${styles.pg} ${tick === 'fwd' ? styles.tickFwd : ''} ${tick === 'back' ? styles.tickBack : ''}`}
                        value={scrub ? scrubLabel : pageInput}
                        onChange={(event) => {
                            if (scrub) endScrub()
                            onPageInputChange(event.target.value)
                        }}
                        onFocus={() => {
                            if (scrub) endScrub()
                        }}
                        onBlur={() => {
                            if (scrub) commitScrub()
                            else onPageCommit()
                        }}
                        onMouseEnter={() => setPgHover(true)}
                        onMouseLeave={() => setPgHover(false)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                if (scrub) commitScrub()
                                else onPageCommit()
                            } else if (event.key === 'ArrowDown') {
                                // Arrow taps on the focused number scrub too (soft commit —
                                // a second tap usually follows before the settle timer ends).
                                event.preventDefault()
                                move(1, true)
                            } else if (event.key === 'ArrowUp') {
                                event.preventDefault()
                                move(-1, true)
                            } else if (event.key === 'Escape' && scrub) {
                                event.stopPropagation()
                                endScrub()
                            }
                        }}
                        aria-label="Page number"
                        style={{
                            width: scrub
                                ? `${scrubLabel.length + 1}ch`
                                : `${Math.max(2, String(pageCount).length) + 1}ch`,
                        }}
                    />
                    <span className={styles.idleExpander} ref={idleRef}>
                        <span
                            className={styles.idleClip}
                            onMouseEnter={() => setPgHover(true)}
                            onMouseLeave={() => setPgHover(false)}
                        >
                            {!scrub && rangeLabel ? <span className={styles.tot}>{rangeLabel}</span> : null}
                            <span className={styles.tot}>/ {pageCount}</span>
                            <span className={styles.track}>
                                <i style={{ width: `${scrubPercent ?? percent}%` }} />
                            </span>
                        </span>
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
                    <i style={{ width: `${scrubPercent ?? percent}%` }} />
                    {scrub && scrubFromPercent != null ? (
                        <b className={styles.ilineOrigin} style={{ left: `${scrubFromPercent}%` }} />
                    ) : null}
                </span>
            </div>
            <div className={`${styles.tip} ${pgHover && !scrub ? styles.tipOn : ''}`}>
                Scroll over the number to flip fast
            </div>
            <div
                className={`${styles.peek} ${scrub ? styles.peekOn : ''}`}
                aria-hidden={!scrub}
                onClick={() => {
                    if (scrub) commitScrub()
                }}
            >
                <div className={styles.peekMain}>
                    <div
                        className={`${styles.mini} ${spread ? '' : styles.miniSingle}`}
                        ref={miniRef}
                    >
                        {miniSrc?.left ? (
                            <img className={styles.miniPage} src={miniSrc.left} alt="" />
                        ) : (
                            <span className={`${styles.miniPage} ${styles.miniBlank}`} />
                        )}
                        {spread ? (
                            miniSrc?.right ? (
                                <img className={styles.miniPage} src={miniSrc.right} alt="" />
                            ) : (
                                <span className={`${styles.miniPage} ${styles.miniBlank}`} />
                            )
                        ) : null}
                    </div>
                    <div className={styles.peekTxt}>
                        {chapterTitle ? <div className={styles.peekCh}>{chapterTitle}</div> : null}
                        <div className={styles.peekPg}>
                            Page {scrubLabel || '–'} of {pageCount}
                        </div>
                        <div className={styles.peekD}>
                            {scrubDelta === 0
                                ? 'Where you started'
                                : `${scrubDelta > 0 ? '+' : '−'}${Math.abs(scrubDelta)} pages from ${scrubFromPair != null ? scrubFromPair[0] : scrub?.fromPage ?? ''
                                }`}
                        </div>
                    </div>
                </div>
                <div className={styles.rail}>
                    <i className={styles.railFill} style={{ width: `${scrubPercent ?? 0}%` }} />
                    {(railMarks ?? []).map((mark) => {
                        const [, right] = pairOf(mark, spread, pageCount)
                        const anchor = spread ? right ?? mark : mark
                        return (
                            <i
                                key={mark}
                                className={styles.railTick}
                                style={{ left: `${percentForPage(anchor, Math.max(pageCount, 1))}%` }}
                            />
                        )
                    })}
                    {scrubFromPercent != null ? (
                        <i className={styles.railOrigin} style={{ left: `${scrubFromPercent}%` }} />
                    ) : null}
                    <i className={styles.railThumb} style={{ left: `${scrubPercent ?? 0}%` }} />
                </div>
                <div className={styles.peekHint}>
                    <span>Stop scrolling to jump</span>
                    <span>Esc cancels</span>
                </div>
            </div>
        </div>
    )
} 