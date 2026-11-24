import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFolio } from '../app/FolioContext'
import { useShortcuts } from '../hooks/useShortcuts'
import {
  annotationsRepo,
  bookmarksRepo,
  filesRepo,
  highlightsRepo,
  progressRepo,
} from '../storage/repos'
import type {
  Annotation,
  Bookmark,
  Highlight,
  MarkupTool,
  ReadingProgress,
} from '../types/models'
import { clearBrowserSelection, type PageSelection } from '../utils/selection'
import { nowIso, percentForPage } from '../utils/time'
import { AnnotationComposer } from './AnnotationComposer'
import { AnnotationPopover } from './AnnotationPopover'
import { OutlinePanel } from './OutlinePanel'
import { PdfEngine, type OutlineEntry } from './pdf/PdfEngine'
import { PdfViewport } from './PdfViewport'
import { buildPdfSequence, indexForPdfPage, pdfPageAt } from './readingSequence'
import { ReaderIsland } from './ReaderIsland'
import { ReaderRail } from './ReaderRail'
import styles from './ReaderScreen.module.css'

// PageSelection carries an optional `page` tag ("which page was this
// selection drawn on") that arrived together with spread mode. Project
// copies whose utils/selection.ts predates that do not declare the field —
// read it through a cast instead of the type so this file drops in cleanly
// on both revisions. On the older one the field is absent at runtime and the
// fallback (the canonical current page) applies, which is exactly the
// pre-spread behaviour.
function selectionPage(selection: PageSelection, fallback: number): number {
  const tagged = selection as { page?: number }
  return tagged.page ?? fallback
}

const MIN_SCALE = 0.6
const MAX_SCALE = 3.0
const SCALE_STEP = 0.1
// Two-page spread: two letter/A4 pages side by side can legitimately need a
// small scale on narrow windows, so the spread floor sits lower than the
// single-page one.
const SPREAD_MIN_SCALE = 0.25
// Padding + gutter of the spread layout. MUST stay in sync with
// .pageWrapSpread / .bookCover in ReaderScreen.module.css — the auto-fit
// subtracts them from the measured stage box.
const SPREAD_PAD_X = 84 // 16px left + 16px right wrap padding + 26px cover overhang each side
const SPREAD_PAD_Y = 96 // 32px top + 20px bottom wrap padding + 18px top / 26px bottom cover overhang
// Cover-first fit: the spread targets this share of the stage WIDTH even
// when that overflows the height a little (see fitSpread), but never grows
// more than this factor past the height fit — an ultra-wide window must
// not push the book into a half-screen vertical scroll.
const SPREAD_COVER_RATIO = 0.86
const SPREAD_COVER_MAX_GROW = 1.35
const SPREAD_GAP = 0 // the two sheets meet at the spine; the gutter overlay shades the seam

// Left page of the spread containing `page` (book parity: even verso on the
// left, odd recto on the right, cover on its own).
const leftPageOf = (page: number) => (page <= 1 || page % 2 === 0 ? page : page - 1)

export function ReaderScreen() {
  const {
    activeBookId,
    books,
    closeReader,
    refreshProgress,
    showHint,
    theme,
    setTheme,
  } = useFolio()
  const book = books.find((item) => item.id === activeBookId) ?? null
  const bookId = book?.id ?? null

  const engineRef = useRef(new PdfEngine())
  const stageRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef(1)
  const sequenceIndexRef = useRef(0)
  const lastSelection = useRef<PageSelection | null>(null)
  // bookId whose progress is safe to persist (its load completed and the
  // restored page is live in pageRef). Guards the visibilitychange handler
  // against writing load-time defaults over a stored progress record.
  const loadedForRef = useRef<string | null>(null)
  // Two-page spread preference — global like the reading theme, restored
  // lazily so the first paint already uses the right layout.
  const [spread, setSpread] = useState(() => {
    try {
      return window.localStorage.getItem('folio.spread') === '1'
    } catch {
      return false
    }
  })
  const spreadRef = useRef(spread)
  spreadRef.current = spread

  const [engineReady, setEngineReady] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [pageNumber, setPageNumber] = useState(1)
  const [sequenceIndex, setSequenceIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const [pageInput, setPageInput] = useState('1')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [tool, setTool] = useState<MarkupTool>('none')
  const [pendingAnnotation, setPendingAnnotation] = useState<PageSelection | null>(null)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [outline, setOutline] = useState<OutlineEntry[]>([])
  const [outlineOpen, setOutlineOpen] = useState(false)

  const sequence = useMemo(() => buildPdfSequence(pageCount), [pageCount])

  // Spread pair (book parity): page 1 sits alone like a cover, then (2,3),
  // (4,5), … — even verso left, odd recto right, matching the approved mock.
  // pageNumber stays the canonical stored page; the pair is derived from it
  // deterministically, so resume, page jump, bookmarks and progress keep
  // their single-page meaning.
  const leftPage = leftPageOf(pageNumber)
  const rightPage = leftPage === 1 ? null : leftPage + 1 <= pageCount ? leftPage + 1 : null
  // The fit math reads the CURRENT pair through refs so its callback
  // identity stays stable — refitting on every page turn would wipe the
  // user's zoom.
  const leftPageRef = useRef(1)
  const rightPageRef = useRef<number | null>(null)
  leftPageRef.current = leftPage
  rightPageRef.current = rightPage
  // Settings/composer/markup tools hold the island open instead of the old
  // idle timer — the droplet never hides itself, only folds shut.
  const heldChrome = Boolean(pendingAnnotation || activeAnnotationId || settingsOpen || tool !== 'none')
  const [islandExpanded, setIslandExpanded] = useState(false)

  const persistProgress = useCallback(
    async (page: number, index: number, nextScale?: number) => {
      if (!bookId) return
      const total = book?.pageCount || pageCount
      const progress: ReadingProgress = {
        bookId,
        lastPdfPage: page,
        sequenceIndex: index,
        percent: percentForPage(page, total),
        scale: nextScale ?? scaleRef.current,
        updatedAt: nowIso(),
      }
      await progressRepo.put(progress)
      refreshProgress(progress)
    },
    [book?.pageCount, bookId, pageCount, refreshProgress],
  )
  const persistRef = useRef(persistProgress)
  persistRef.current = persistProgress
  // Last zoom chosen per layout: toggling spread swaps between the
  // single-page zoom and the spread auto-fit instead of losing either.
  const singleScaleRef = useRef<number | null>(null)
  const spreadScaleRef = useRef<number | null>(null)

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(sequence.length - 1, index))
      const page = pdfPageAt(sequence, clamped)
      if (page == null) return
      sequenceIndexRef.current = clamped
      pageRef.current = page
      setSequenceIndex(clamped)
      setPageNumber(page)
      // In spread mode the pill's editable number is the LEFT page of the
      // pair, matching what the island displays (36 – 37).
      setPageInput(String(spreadRef.current ? leftPageOf(page) : page))
      lastSelection.current = null
      setPendingAnnotation(null)
      setActiveAnnotationId(null)
      void persistProgress(page, clamped)
    },
    [persistProgress, sequence],
  )

  useEffect(() => {
    if (!bookId) return
    let cancelled = false
    const engine = engineRef.current

    const load = async () => {
      loadedForRef.current = null
      setEngineReady(false)
      setLoadError(null)
      const blob = await filesRepo.get(bookId)
      if (!blob) {
        setLoadError('This book is no longer in local storage.')
        return
      }
      await engine.open(blob)
      if (cancelled) return

      const count = engine.pageCount
      setPageCount(count)
      setOutline([])
      setOutlineOpen(false)
      // The outline resolves over several worker round trips and is only
      // chrome, not content — fetch it in the background so the reader's
      // first paint never waits on it.
      void engine
        .getOutline()
        .then((entries) => {
          if (!cancelled) setOutline(entries)
        })
        .catch(() => {
          if (!cancelled) setOutline([])
        })
      const items = buildPdfSequence(count)
      const stored = await progressRepo.get(bookId)
      const page = Math.min(Math.max(stored?.lastPdfPage ?? 1, 1), Math.max(count, 1))
      // Trust the stored sequence index only when it still maps back to the
      // stored page; a stale or foreign record would otherwise land the
      // reader on a page that disagrees with the one we just restored.
      const index =
        stored != null && pdfPageAt(items, stored.sequenceIndex) === stored.lastPdfPage
          ? stored.sequenceIndex
          : indexForPdfPage(items, page)
      sequenceIndexRef.current = index
      pageRef.current = page
      setSequenceIndex(index)
      setPageNumber(page)
      setPageInput(String(page))
      if (stored && page > 1) {
        showHint(`Resumed at page ${page} of ${count}`)
      }

      const [nextBookmarks, nextHighlights, nextAnnotations] = await Promise.all([
        bookmarksRepo.forBook(bookId),
        highlightsRepo.forBook(bookId),
        annotationsRepo.forBook(bookId),
      ])
      if (cancelled) return
      setBookmarks(nextBookmarks)
      setHighlights(nextHighlights)
      setAnnotations(nextAnnotations)

      // Zoom is part of the reading context: restore the stored scale when
      // it is sane, otherwise fall back to fitting the stage width.
      const size = await engine.getPageSize(page)
      const stage = stageRef.current
      if (stage && size.width > 0) {
        const available = Math.min(stage.clientWidth - 80, 920)
        const fitted = Math.min(MAX_SCALE, Math.max(MIN_SCALE, available / size.width))
        const storedScale = stored?.scale
        const restoredScale =
          typeof storedScale === 'number' && Number.isFinite(storedScale)
            ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, storedScale))
            : fitted
        const restored = Number(restoredScale.toFixed(2))
        singleScaleRef.current = restored
        setScale(restored)
        scaleRef.current = restored
        // In spread mode the pill shows the left page of the restored pair.
        setPageInput(String(spreadRef.current ? leftPageOf(page) : page))
      }

      setEngineReady(true)
      // From here on pageRef/sequenceIndexRef hold THIS book's restored
      // position, so persisting them (page turns, tab hide) is safe.
      loadedForRef.current = bookId
      void persistRef.current(page, index)
    }

    void load().catch((error) => {
      console.error(error)
      if (!cancelled) setLoadError("Couldn't open this book.")
    })

    return () => {
      cancelled = true
      // No progress persist here on purpose. Under StrictMode this cleanup
      // runs on the aborted first mount with pageRef still at its default,
      // and on a book switch persistRef has already re-closed over the NEXT
      // bookId — either write would clobber a real saved position. Every
      // genuine exit path persists explicitly (page turns, zoom changes,
      // visibilitychange, Library/Notes buttons), so nothing is lost.
      void engine.destroy()
    }
  }, [bookId])

  useEffect(() => {
    const onHide = () => {
      if (
        document.visibilityState === 'hidden' &&
        loadedForRef.current === bookId
      ) {
        void persistProgress(pageRef.current, sequenceIndexRef.current)
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [persistProgress])

  // ===== Physical book shell + page-turn (spread mode only) =====
  // The shell (hardcover, stacked sheet edges, spine gutter, curvature
  // shades) wraps the two live pages. The turn animates two STATIC image
  // clones inside a separate 3D overlay: the real canvas subtree is a
  // blend-mode/filter texture (see PdfViewport.module.css) and must never
  // be re-rasterized in 3D, which would melt on machines without GPU
  // compositing. Single-page mode keeps the viewport's own 2D cue.
  type TurnState = {
    dir: 1 | -1
    slot: 'left' | 'right'
    frontSrc: string
    backSrc: string
    // Horizontal glide (px) baked into the flip keyframes. Zero for turns
    // inside a settled spread; non-zero only when the book re-centers at
    // the commit (cover turns), where a rigid rotateY alone would land the
    // sheet on empty background instead of the slot the new page takes.
    glide: number
    box: { left: number; top: number; width: number; height: number }
  }
  const [turn, setTurn] = useState<TurnState | null>(null)
  const turnLockRef = useRef(false)
  const bookRef = useRef<HTMLDivElement | null>(null)
  const flipperRef = useRef<HTMLDivElement | null>(null)
  const turnAnimRef = useRef<Animation | null>(null)
  const turnTargetRef = useRef(0)
  // Paint gate for the commit: the flipper stays mounted until the landing
  // canvases have actually painted (capped) — see the turn effect below.
  const paintWaitRef = useRef<(() => void) | null>(null)
  const paintTargetsRef = useRef(2)

  // The spread's two viewport roots are the shell's canvas-bearing children
  // (cover/block/gutter/shades carry no canvas). Forward turns always lift
  // the right-most sheet — the lone cover (page 1 alone) IS that right-most
  // sheet, so it turns with right-sheet choreography (pivot on its left,
  // binding edge) exactly like any other forward turn; the previous logic
  // misclassified it as a left sheet and swung it off the book's outer
  // edge to the right. Boxes are measured in the pageWrap's coordinate
  // space: the flipper renders as a SIBLING of the book (see the JSX), so
  // a mid-turn commit that re-centers the book cannot move it mid-flight.
  const measureTurnSlot = (dir: 1 | -1) => {
    const book = bookRef.current
    if (!book) return null
    const pages = Array.from(book.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement && el.querySelector(':scope > canvas') !== null,
    )
    if (pages.length === 0) return null
    const wrap = book.offsetParent as HTMLElement | null
    if (!wrap) return null
    const bookLeft = book.offsetLeft
    const bookTop = book.offsetTop
    const onRight = dir > 0
    const el = onRight ? pages[pages.length - 1] : pages[0]
    return {
      el,
      slot: (onRight ? 'right' : 'left') as 'left' | 'right',
      // The pageWrap half-width, for the cover landing computations below.
      wrapHalf: wrap.offsetWidth / 2,
      loneCover: pages.length === 1,
      otherSlotLeft: (onRight ? pages[0] : pages[pages.length - 1]).offsetLeft + bookLeft,
      left: el.offsetLeft + bookLeft,
      top: el.offsetTop + bookTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    }
  }

  // The theme look is baked into the face pixels at capture time instead of
  // applied via CSS: a CSS filter on an element inside the flipper's 3D
  // preserve-3d subtree is dropped by GPU compositors once the face flips
  // past 90°, which flashed raw paper mid-turn. Same strings as
  // PdfViewport.module.css, so the faces match the live pages exactly.
  const DARK_FACE_FILTER =
    'grayscale(100%) contrast(1.55) brightness(0.92) invert(1) sepia(0.25) brightness(0.95)'
  const LIGHT_FACE_FILTER = 'grayscale(100%) contrast(1.55) brightness(0.92)'

  const bakeFace = (source: HTMLCanvasElement, w: number, h: number): string => {
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    if (!ctx) return ''
    ctx.filter =
      document.documentElement.dataset.theme === 'dark' ? DARK_FACE_FILTER : LIGHT_FACE_FILTER
    ctx.drawImage(source, 0, 0, w, h)
    return out.toDataURL('image/png')
  }

  // Offscreen render for a page that is not live yet (the landing page's
  // face of the flip). Same pipeline as the viewport, so the look matches.
  // `warmOnly` skips the PNG encode: it exists to warm the pdf.js worker
  // cache so the live render after the commit paints in a frame or two.
  const renderPageSnapshot = async (
    page: number,
    scale: number,
    warmOnly = false,
  ): Promise<string | null> => {
    try {
      const canvas = document.createElement('canvas')
      const task = await engineRef.current.renderPage({ pageNumber: page, canvas, scale })
      await task.promise
      if (warmOnly) return null
      return bakeFace(canvas, canvas.width, canvas.height)
    } catch {
      return null
    }
  }

  const attemptTurn = useCallback(
    async (dir: 1 | -1) => {
      const step = spreadRef.current ? 2 : 1
      const target = Math.max(
        0,
        Math.min(sequence.length - 1, sequenceIndexRef.current + dir * step),
      )
      if (target === sequenceIndexRef.current) return
      if (!spreadRef.current) {
        goToIndex(target)
        return
      }
      if (turnLockRef.current) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        goToIndex(target)
        return
      }
      const slot = measureTurnSlot(dir)
      if (!slot || slot.width < 8 || slot.height < 8) {
        goToIndex(target)
        return
      }
      turnLockRef.current = true
      try {
        // Front face: the sheet being lifted (its already-painted canvas).
        // Back face: the page the sheet lands as — next spread's left page
        // going forward, previous spread's right page going back.
        const turningPage =
          dir > 0 ? (rightPageRef.current ?? leftPageRef.current) : leftPageRef.current
        const landingPage = dir > 0 ? leftPageOf(turningPage + 1) : turningPage - 1
        if (landingPage < 1 || landingPage > pageCount) {
          turnLockRef.current = false
          goToIndex(target)
          return
        }
        // Where the sheet must finish, in pageWrap coordinates, and how far
        // the flip must therefore glide. A rigid rotateY maps the box
        // [left .. left+width] to [left-width .. left] (forward, pivot on
        // the left edge) or [left+width .. left+2*width] (backward, pivot
        // on the right edge). Inside a settled spread that already IS the
        // landing slot, so the glide is zero. Cover turns re-center the
        // book at the commit (1 sheet <-> 2), so the landing geometry comes
        // from the pageWrap centre instead — without the compensation the
        // sheet sweeps over empty background and lands beside the slot the
        // new page actually takes (269px off on the verification copy).
        let glide = 0
        if (dir > 0) {
          const landingLeft = slot.loneCover
            ? slot.wrapHalf - slot.width
            : slot.otherSlotLeft
          glide = landingLeft - (slot.left - slot.width)
        } else {
          const landingLeft =
            landingPage === 1 ? slot.wrapHalf - slot.width / 2 : slot.otherSlotLeft
          glide = landingLeft - (slot.left + slot.width)
        }
        const scale = scaleRef.current
        // Warm the other landing page (this spread's right page going
        // forward, the previous spread's left page going back) without
        // blocking the turn start — the live render after the commit then
        // hits the pdf.js worker cache instead of flashing a blank page.
        const warmLandingPage = dir > 0 ? landingPage + 1 : landingPage - 1
        if (warmLandingPage >= 1 && warmLandingPage <= pageCount) {
          void renderPageSnapshot(warmLandingPage, scale, true)
        }
        // How many live canvases must paint before the sheet may unmount:
        // both pages of the landing spread, or just the lone cover.
        paintTargetsRef.current =
          dir > 0 ? (landingPage + 1 <= pageCount ? 2 : 1) : landingPage === 1 ? 1 : 2
        const liveCanvas = slot.el.querySelector('canvas')
        const [frontSrc, backSrc] = await Promise.all([
          liveCanvas
            ? bakeFace(liveCanvas, liveCanvas.width, liveCanvas.height)
            : renderPageSnapshot(turningPage, scale),
          renderPageSnapshot(landingPage, scale),
        ])
        if (!frontSrc && !backSrc) {
          turnLockRef.current = false
          goToIndex(target)
          return
        }
        turnTargetRef.current = target
        setTurn({
          dir,
          slot: slot.slot,
          glide,
          frontSrc: frontSrc ?? backSrc ?? '',
          backSrc: backSrc ?? frontSrc ?? '',
          box: { left: slot.left, top: slot.top, width: slot.width, height: slot.height },
        })
      } catch {
        turnLockRef.current = false
        goToIndex(target)
      }
    },
    [goToIndex, pageCount, sequence.length],
  )

  // Drive the 3D flip once the flipper mounts; commit the REAL page change
  // at the midpoint (the sheet is edge-on there) so the viewports start
  // rendering underneath while the sheet is still settling. The commit arms
  // a paint gate: the flipper stays mounted until the landing canvases have
  // actually painted — swapping pages while the sheet still covers the seam
  // hides the async first paint and removes the blank-page flash. The gate
  // counts REAL paints only: faking one on a timeout released the sheet over
  // a still-blank canvas (renderPage clears + paper-fills the canvas before
  // the async draw), which was the white blink at the end of slow turns.
  // fill: 'forwards' is what makes the gate meaningful: without it the
  // animation's end snaps the element back to identity, where the front face
  // is hidden and the back face culled, so the sheet VANISHED at 700ms
  // regardless of the gate and exposed whatever the landing canvas was
  // still showing. With the fill the sheet holds its landed pose — the
  // landing image — until the gate (or an escape hatch) releases it, and
  // renderPage's paper-only phase stays covered however slow the render is.
  const goToIndexRef = useRef(goToIndex)
  goToIndexRef.current = goToIndex
  useEffect(() => {
    if (!turn || !flipperRef.current) return
    const flipper = flipperRef.current
    const to = turn.slot === 'left' ? 180 : -180
    const anim = flipper.animate(
      [
        { transform: 'translateX(0px) rotateY(0deg)' },
        { transform: `translateX(${turn.glide}px) rotateY(${to}deg)` },
      ],
      { duration: 700, easing: 'cubic-bezier(.45,.05,.32,1)', fill: 'forwards' },
    )
    turnAnimRef.current = anim
    let finished = false
    let paintedCount = 0
    let capForced = false
    let paintCapTimer = 0
    const maybeCleanup = () => {
      if (finished && (paintedCount >= paintTargetsRef.current || capForced)) {
        turnLockRef.current = false
        setTurn(null)
      }
    }
    // Edge-on moment. Swap the visible face EXPLICITLY instead of trusting
    // backface-visibility: the front face carries no rotation of its own
    // beyond the epsilon lift, and on several compositors its backside
    // still painted past 90° — the departing page flashed MIRRORED on the
    // landing side for the rest of the flip (the inverted-page flash).
    // Flipping the flipper's data-phase to 'landing' here is deterministic
    // in every engine, and at edge-on the swap is invisible. Visibility is
    // owned entirely by the module css keyed off that attribute (see
    // turnFaceFront/turnFaceBack) — neither the JSX nor React holds a copy
    // of it, so a re-render can never clobber the imperative swap.
    // Driven off the ANIMATION's progress (rAF + getComputedTiming), not a
    // wall-clock timeout: a stalled main thread would fire a wall timer at
    // the wrong visual moment (content pops mid-turn), and a paused or
    // seeked animation (test probes) desyncs from wall time entirely.
    // progress >= 0.5 is the exact edge-on frame whatever the clock does.
    let raf = 0
    const swapWhenEdgeOn = () => {
      const p = anim.effect?.getComputedTiming().progress
      if (typeof p === 'number' && p >= 0.5) {
        if (flipper.children.length === 2) {
          flipper.dataset.phase = 'landing'
        }
        return
      }
      raf = requestAnimationFrame(swapWhenEdgeOn)
    }
    raf = requestAnimationFrame(swapWhenEdgeOn)
    // The COMMIT stays on the wall clock — it only starts the async render
    // of the landing pages early, and being a few frames off the visual
    // midpoint is invisible underneath the near-opaque sheet.
    const midTimer = window.setTimeout(() => {
      // Arm the gate only AFTER the commit — paints of the outgoing pages
      // must not release the sheet.
      paintWaitRef.current = () => {
        paintedCount += 1
        if (paintedCount >= paintTargetsRef.current) {
          window.clearTimeout(paintCapTimer)
          maybeCleanup()
        }
      }
      goToIndexRef.current(turnTargetRef.current)
      // Cap: a render that never completes (cancelled render, hidden tab)
      // must not hold the turn lock forever. It FORCES the release instead
      // of faking a paint — the old fake released the sheet over a
      // still-blank canvas on slower machines. With fill: 'forwards' the
      // sheet shows the correct landing image while it waits, so the
      // generous deadline costs nothing visually; the safety net below
      // remains the absolute backstop.
      paintCapTimer = window.setTimeout(() => {
        capForced = true
        maybeCleanup()
      }, 1000)
    }, 360)
    // Safety net: if onfinish/oncancel never fire (element torn down by a
    // fast spread toggle), the lock must still release.
    const safety = window.setTimeout(() => {
      if (turnLockRef.current) {
        turnLockRef.current = false
        setTurn(null)
      }
    }, 1600)
    anim.onfinish = () => {
      finished = true
      maybeCleanup()
    }
    anim.oncancel = () => {
      turnLockRef.current = false
      setTurn(null)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(midTimer)
      window.clearTimeout(paintCapTimer)
      window.clearTimeout(safety)
      paintWaitRef.current = null
    }
  }, [turn])

  // PdfViewport reports its first successful canvas paint; the flip's
  // commit gate (see the turn effect) consumes these.
  const onViewportPainted = useCallback(() => {
    paintWaitRef.current?.()
  }, [])

  // Toggling the layout or switching books mid-turn would leave the flipper
  // over a slot that no longer exists — drop the overlay and release the lock.
  useEffect(() => {
    turnAnimRef.current?.cancel()
    turnAnimRef.current = null
    turnLockRef.current = false
    setTurn(null)
  }, [spread, bookId])

  // Spread turns move one SPREAD at a time (±2 in sequence space). Because
  // the pair is re-derived from whichever page lands, ±2 always arrives on
  // the neighbouring spread no matter which page of the current pair is
  // canonical, and goToIndex's clamping keeps the cover transitions safe.
  const onPrev = useCallback(() => void attemptTurn(-1), [attemptTurn])
  const onNext = useCallback(() => void attemptTurn(1), [attemptTurn])

  const changeScale = useCallback(
    (next: number) => {
      const floor = spread ? SPREAD_MIN_SCALE : MIN_SCALE
      const clamped = Number(Math.min(MAX_SCALE, Math.max(floor, next)).toFixed(2))
      setScale(clamped)
      scaleRef.current = clamped
      if (spread) spreadScaleRef.current = clamped
      else singleScaleRef.current = clamped
      void persistProgress(pageRef.current, sequenceIndexRef.current, clamped)
    },
    [persistProgress, spread],
  )

  // Spread auto-fit: measure the stage, subtract the layout's padding and
  // gutter, then scale so the book covers the stage — preferring ~86% of
  // its WIDTH (cover-first, see SPREAD_COVER_RATIO) and letting the height
  // overflow slightly on wide screens, where the stage scrolls vertically.
  // Runs when spread turns on, when a book becomes ready, and whenever the
  // stage box changes (window resize, outline panel open/close). Manual
  // zoom wins until the next one of those events.
  const fitSpread = useCallback(async () => {
    const stage = stageRef.current
    if (!stage || !engineReady || pageCount < 1) return
    const left = leftPageRef.current
    const right = rightPageRef.current
    try {
      const leftSize = await engineRef.current.getPageSize(left)
      const rightSize = right != null ? await engineRef.current.getPageSize(right) : null
      const totalW = leftSize.width + (rightSize?.width ?? 0)
      const maxH = Math.max(leftSize.height, rightSize?.height ?? 0)
      if (totalW <= 0 || maxH <= 0) return
      const availW = Math.max(stage.clientWidth - SPREAD_PAD_X - SPREAD_GAP, 120)
      const availH = Math.max(stage.clientHeight - SPREAD_PAD_Y, 120)
      // Cover-first fit: two upright pages side by side are ALWAYS
      // height-limited on a wide screen, and a pure fit-to-height left a
      // quarter of the screen empty around the book. Prefer covering ~86%
      // of the stage WIDTH instead and let the height overflow slightly —
      // the stage scrolls vertically in that case (same path as manual
      // zoom past fit). Capped at 1.35× the height fit so an ultra-wide
      // window can't push the book into a half-screen vertical scroll.
      // The lone cover spread keeps a strict fit: one page is half the
      // width of a spread, so the width rule would explode it. On squarer
      // windows heightFit still wins and nothing scrolls.
      const heightFit = availH / maxH
      const widthFit = availW / totalW
      const fitted =
        right != null
          ? Math.max(heightFit, Math.min(widthFit * SPREAD_COVER_RATIO, heightFit * SPREAD_COVER_MAX_GROW))
          : Math.min(widthFit, heightFit)
      // Floor to 2 decimals — rounding UP (toFixed) would push the pages a
      // few pixels past the measured box and reintroduce a small scroll.
      const clamped = Number(
        Math.min(MAX_SCALE, Math.max(SPREAD_MIN_SCALE, Math.floor(fitted * 100) / 100)).toFixed(
          2,
        ),
      )
      spreadScaleRef.current = clamped
      setScale(clamped)
      scaleRef.current = clamped
      void persistProgress(pageRef.current, sequenceIndexRef.current, clamped)
    } catch {
      // A failed page probe must never take the reader down; the stored
      // or restored scale still applies.
    }
  }, [engineReady, pageCount, persistProgress])
  const fitSpreadRef = useRef(fitSpread)
  fitSpreadRef.current = fitSpread

  useEffect(() => {
    if (!spread) return
    void fitSpread()
  }, [spread, engineReady, pageCount, fitSpread])

  // Re-fit when the stage box itself changes (window resize, outline panel
  // slide) — observing the stage rather than the window catches both.
  useEffect(() => {
    if (!spread) return
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      void fitSpreadRef.current()
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [spread])

  // Swap layouts, remembering each layout's own zoom so toggling back and
  // forth never loses the user's chosen scale.
  const toggleSpread = useCallback(() => {
    const next = !spread
    setSpread(next)
    try {
      window.localStorage.setItem('folio.spread', next ? '1' : '0')
    } catch {
      // Private mode: the preference just won't survive a reload.
    }
    if (next) {
      singleScaleRef.current = scale
      // Entering spread: the fit effect above applies the auto-fit scale
      // once the layout has rendered and measured itself.
    } else {
      spreadScaleRef.current = scale
      const restore = singleScaleRef.current ?? scale
      const clamped = Number(Math.min(MAX_SCALE, Math.max(MIN_SCALE, restore)).toFixed(2))
      setScale(clamped)
      scaleRef.current = clamped
      void persistProgress(pageRef.current, sequenceIndexRef.current, clamped)
    }
    showHint(next ? 'Two-page spread on' : 'Two-page spread off')
  }, [persistProgress, scale, showHint, spread])

  const exitChrome = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    void persistProgress(pageRef.current, sequenceIndexRef.current)
    closeReader('library')
  }, [closeReader, persistProgress])

  const shortcutHandlers = useMemo(
    () => ({
      onPrev,
      onNext,
      onEscape: exitChrome,
    }),
    [exitChrome, onNext, onPrev],
  )
  useShortcuts(true, shortcutHandlers)

  const applySelection = useCallback(
    (selection: PageSelection | null) => {
      if (!selection) {
        // The viewport signals "a real drag happened but the page text was
        // not ready". With a markup tool armed this must not fail silently.
        if (tool !== 'none') {
          showHint('Page text is still loading — try selecting again in a second')
        }
        return
      }
      lastSelection.current = selection
      if (!book) return
      if (tool === 'highlight') {
        void saveHighlight(selection)
        setTool('none')
        clearBrowserSelection()
      } else if (tool === 'annotate') {
        setPendingAnnotation(selection)
        clearBrowserSelection()
      }
    },
    [book, showHint, tool],
  )

  async function saveHighlight(selection: PageSelection) {
    if (!book) return
    const highlight: Highlight = {
      id: crypto.randomUUID(),
      bookId: book.id,
      anchor: {
        // The viewport tags each capture with the page it was drawn on —
        // in spread mode that is not always the canonical page.
        pageNumber: selectionPage(selection, pageRef.current),
        selectedText: selection.selectedText,
        rects: selection.rects,
      },
      createdAt: nowIso(),
    }
    await highlightsRepo.put(highlight)
    setHighlights((current) => [...current, highlight])
  }

  const bookmarked = bookmarks.some((item) => item.pageNumber === pageNumber)

  const toggleBookmark = async () => {
    if (!book) return
    const existing = bookmarks.find((item) => item.pageNumber === pageNumber)
    if (existing) {
      await bookmarksRepo.remove(existing.id)
      setBookmarks((current) => current.filter((item) => item.id !== existing.id))
      return
    }
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      bookId: book.id,
      pageNumber,
      createdAt: nowIso(),
    }
    await bookmarksRepo.put(bookmark)
    setBookmarks((current) => [...current, bookmark])
  }

  const handleTool = (next: MarkupTool) => {
    setPendingAnnotation(null)
    setActiveAnnotationId(null)
    if (next === 'none') {
      setTool('none')
      return
    }
    // Only reuse a stored selection when the browser still holds a live,
    // non-empty selection. Otherwise a leftover capture from earlier (saved
    // highlight, previous page, failed attempt) would instantly "consume"
    // the button press and disarm the tool, making the user's NEXT selection
    // do nothing — the feature then feels dead with no feedback.
    const browserSel = window.getSelection()
    const hasLiveSelection =
      !!browserSel && browserSel.rangeCount > 0 && !browserSel.isCollapsed &&
      browserSel.toString().replace(/\s+/g, ' ').trim().length > 0
    const selection = hasLiveSelection ? lastSelection.current : null
    if (next === 'highlight') {
      if (selection) {
        void saveHighlight(selection)
        clearBrowserSelection()
        lastSelection.current = null
        setTool('none')
        return
      }
      setTool('highlight')
      showHint('Select text to highlight')
      return
    }
    if (selection) {
      setPendingAnnotation(selection)
      clearBrowserSelection()
      setTool('annotate')
      return
    }
    setTool('annotate')
    showHint('Select text to annotate')
  }

  const jumpToPage = useCallback(
    (page: number) => {
      goToIndex(indexForPdfPage(sequence, page))
    },
    [goToIndex, sequence],
  )

  const commitPage = () => {
    const next = Number.parseInt(pageInput, 10)
    if (!Number.isFinite(next)) {
      setPageInput(String(pageNumber))
      return
    }
    jumpToPage(next)
  }

  // Clicking the page (anything outside the island) dismisses the settings
  // panel; the island then folds after its grace window once the hold clears.
  const dismissSettings = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!settingsOpen) return
      const target = event.target as Element | null
      if (target && !target.closest('[data-island-root]')) {
        setSettingsOpen(false)
      }
    },
    [settingsOpen],
  )

  const activeAnnotation = annotations.find((item) => item.id === activeAnnotationId) ?? null

  // One viewport per page. In spread mode both pages render side by side,
  // and the annotation popover mounts inside the viewport that actually
  // hosts the annotation's page.
  const renderViewport = (page: number) => (
    <PdfViewport
      engine={engineRef.current}
      pageNumber={page}
      scale={scale}
      highlights={highlights}
      annotations={annotations}
      activeAnnotationId={activeAnnotationId}
      onSelectAnnotation={setActiveAnnotationId}
      onSelection={applySelection}
      onPainted={onViewportPainted}
      suppressFlipCue={turn !== null}
    >
      {activeAnnotation && activeAnnotation.anchor.pageNumber === page ? (
        <AnnotationPopover
          annotation={activeAnnotation}
          onClose={() => setActiveAnnotationId(null)}
          onDelete={() => {
            void annotationsRepo.remove(activeAnnotation.id)
            setAnnotations((current) =>
              current.filter((item) => item.id !== activeAnnotation.id),
            )
            setActiveAnnotationId(null)
          }}
          onSave={(body) => {
            const next = { ...activeAnnotation, body, updatedAt: nowIso() }
            void annotationsRepo.put(next)
            setAnnotations((current) =>
              current.map((item) => (item.id === next.id ? next : item)),
            )
            setActiveAnnotationId(null)
          }}
        />
      ) : null}
    </PdfViewport>
  )

  if (!book) {
    return (
      <div className={styles.stage}>
        <p className={styles.status}>This book is unavailable.</p>
      </div>
    )
  }

  return (
    <div className={outlineOpen ? `${styles.shell} ${styles.shellPanel}` : styles.shell}>
      <ReaderRail
        outlineAvailable={outline.length > 0}
        outlineOpen={outlineOpen}
        onToggleOutline={() => setOutlineOpen((open) => !open)}
      />
      {outlineOpen ? (
        <OutlinePanel
          outline={outline}
          pageNumber={pageNumber}
          onJump={jumpToPage}
          onClose={() => setOutlineOpen(false)}
        />
      ) : null}
      <div ref={stageRef} className={styles.stage} onClick={dismissSettings}>
        <ReaderIsland
          pageNumber={pageNumber}
          pageCount={pageCount}
          pageInput={pageInput}
          onPageInputChange={setPageInput}
          onPageCommit={commitPage}
          percent={percentForPage(spread ? (rightPage ?? leftPage) : pageNumber, pageCount)}
          canPrev={spread ? leftPage > 1 : sequenceIndex > 0}
          canNext={
            spread
              ? (rightPage ?? leftPage) < pageCount
              : sequenceIndex < sequence.length - 1
          }
          onPrev={onPrev}
          onNext={onNext}
          onLibrary={() => {
            void persistProgress(pageRef.current, sequenceIndexRef.current)
            closeReader('library')
          }}
          bookmarked={bookmarked}
          onToggleBookmark={() => void toggleBookmark()}
          tool={tool}
          onTool={handleTool}
          onNotes={() => {
            void persistProgress(pageRef.current, sequenceIndexRef.current)
            closeReader('notes')
          }}
          onSettings={() => setSettingsOpen((open) => !open)}
          onZoomOut={() => changeScale(scale - SCALE_STEP)}
          onZoomIn={() => changeScale(scale + SCALE_STEP)}
          zoomLabel={`${Math.round(scale * 100)}%`}
          onFullscreen={() => {
            const node = stageRef.current
            if (!node) return
            if (document.fullscreenElement) void document.exitFullscreen()
            else void node.requestFullscreen()
          }}
          held={heldChrome}
          onExpandedChange={setIslandExpanded}
        />

        {settingsOpen && (islandExpanded || heldChrome) ? (
          <div className={styles.settings}>
            <p className={styles.settingsLabel}>Reading theme</p>
            <button
              type="button"
              className={
                theme === 'kindle'
                  ? `${styles.themeOption} ${styles.themeOptionActive}`
                  : styles.themeOption
              }
              onClick={() => setTheme('kindle')}
            >
              Kindle
              <span className={styles.themeOptionSub}>Warm e-ink monochrome</span>
            </button>
            <button
              type="button"
              className={
                theme === 'dark'
                  ? `${styles.themeOption} ${styles.themeOptionActive}`
                  : styles.themeOption
              }
              onClick={() => setTheme('dark')}
            >
              Dark e-ink
              <span className={styles.themeOptionSub}>True-black room, visible page sheet</span>
            </button>
            <p className={styles.settingsLabel}>Layout</p>
            <button
              type="button"
              className={
                spread
                  ? `${styles.themeOption} ${styles.themeOptionActive}`
                  : styles.themeOption
              }
              onClick={toggleSpread}
            >
              Two-page spread
              <span className={styles.themeOptionSub}>Side-by-side pages, auto-fit</span>
            </button>
            <p className={styles.settingsLabel}>Position</p>
            <button
              type="button"
              className={styles.settingsAction}
              onClick={() => {
                goToIndex(0)
                showHint('Back at page 1')
              }}
              disabled={sequenceIndex === 0}
            >
              Restart from page 1
              <span className={styles.themeOptionSub}>Clears this book's resume point</span>
            </button>
          </div>
        ) : null}

        <div
          className={
            spread ? `${styles.pageWrap} ${styles.pageWrapSpread}` : styles.pageWrap
          }
        >
          {loadError ? (
            <p className={styles.status}>{loadError}</p>
          ) : engineReady ? (
            spread ? (
              <>
                <div ref={bookRef} className={styles.book}>
                  <div className={styles.bookCover} aria-hidden />
                  <div className={styles.bookBlock} aria-hidden>
                    <span className={styles.stackTop} />
                    <span className={styles.stackBot} />
                    <span className={styles.stackSideL} />
                    <span className={styles.stackSideR} />
                  </div>
                  {renderViewport(leftPage)}
                  {rightPage != null ? renderViewport(rightPage) : null}
                  <div className={styles.bookShadeL} aria-hidden />
                  <div className={styles.bookShadeR} aria-hidden />
                  <div className={styles.bookGutter} aria-hidden />
                  <div className={styles.bookShadow} aria-hidden />
                </div>
                {/* The flipper is a SIBLING of the book, positioned in the
                  pageWrap's stable coordinate space: cover turns re-center
                  the book at the commit, and a flipper anchored inside the
                  book would teleport with it mid-flight. data-phase starts
                  'departing' (front face showing, per the module css) and
                  the turn effect flips it to 'landing' at the edge-on
                  moment — see swapWhenEdgeOn there (animation-progress
                  driven, not wall-clock). Visibility is NOT an inline style:
                  React would hold its own copy of the property, and the
                  attribute-keyed css owns it instead. */}
                {turn ? (
                  <div
                    ref={flipperRef}
                    className={styles.turnFlipper}
                    data-phase="departing"
                    style={{
                      left: turn.box.left,
                      top: turn.box.top,
                      width: turn.box.width,
                      height: turn.box.height,
                      transformOrigin:
                        turn.slot === 'left' ? 'right center' : 'left center',
                    }}
                    aria-hidden
                  >
                    <div className={`${styles.turnFace} ${styles.turnFaceFront}`}>
                      <img className={styles.turnImg} src={turn.frontSrc} alt="" />
                    </div>
                    <div className={`${styles.turnFace} ${styles.turnFaceBack}`}>
                      <img className={styles.turnImg} src={turn.backSrc} alt="" />
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              renderViewport(pageNumber)
            )
          ) : (
            <p className={styles.status}>Opening…</p>
          )}
        </div>

        {pendingAnnotation ? (
          <AnnotationComposer
            selectedText={pendingAnnotation.selectedText}
            onCancel={() => {
              setPendingAnnotation(null)
              setTool('none')
              clearBrowserSelection()
              lastSelection.current = null
            }}
            onSave={(body) => {
              const annotation: Annotation = {
                id: crypto.randomUUID(),
                bookId: book.id,
                anchor: {
                  pageNumber: selectionPage(pendingAnnotation, pageRef.current),
                  selectedText: pendingAnnotation.selectedText,
                  rects: pendingAnnotation.rects,
                },
                body,
                createdAt: nowIso(),
                updatedAt: nowIso(),
              }
              void annotationsRepo.put(annotation)
              setAnnotations((current) => [...current, annotation])
              setPendingAnnotation(null)
              setTool('none')
              clearBrowserSelection()
              lastSelection.current = null
            }}
          />
        ) : null}
      </div>
    </div>
  )
} 