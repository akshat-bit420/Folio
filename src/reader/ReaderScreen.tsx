import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFolio } from '../app/FolioContext'
import { useIdleChrome } from '../hooks/useIdleChrome'
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
import { PdfEngine } from './pdf/PdfEngine'
import { PdfViewport } from './PdfViewport'
import { buildPdfSequence, indexForPdfPage, pdfPageAt } from './readingSequence'
import { ReaderToolbar } from './ReaderToolbar'
import styles from './ReaderScreen.module.css'

const MIN_SCALE = 0.6
const MAX_SCALE = 3.0
const SCALE_STEP = 0.1

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

  const [engineReady, setEngineReady] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [pageNumber, setPageNumber] = useState(1)
  const [sequenceIndex, setSequenceIndex] = useState(0)
  const [scale, setScale] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [tool, setTool] = useState<MarkupTool>('none')
  const [pendingAnnotation, setPendingAnnotation] = useState<PageSelection | null>(null)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const sequence = useMemo(() => buildPdfSequence(pageCount), [pageCount])
  const heldChrome = Boolean(pendingAnnotation || activeAnnotationId || settingsOpen || tool !== 'none')
  const { visible, bump } = useIdleChrome(2500, heldChrome)

  const persistProgress = useCallback(
    async (page: number, index: number) => {
      if (!bookId) return
      const total = book?.pageCount || pageCount
      const progress: ReadingProgress = {
        bookId,
        lastPdfPage: page,
        sequenceIndex: index,
        percent: percentForPage(page, total),
        updatedAt: nowIso(),
      }
      await progressRepo.put(progress)
      refreshProgress(progress)
    },
    [book?.pageCount, bookId, pageCount, refreshProgress],
  )
  const persistRef = useRef(persistProgress)
  persistRef.current = persistProgress

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(sequence.length - 1, index))
      const page = pdfPageAt(sequence, clamped)
      if (page == null) return
      sequenceIndexRef.current = clamped
      pageRef.current = page
      setSequenceIndex(clamped)
      setPageNumber(page)
      setPageInput(String(page))
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
      const items = buildPdfSequence(count)
      const stored = await progressRepo.get(bookId)
      const page = Math.min(Math.max(stored?.lastPdfPage ?? 1, 1), Math.max(count, 1))
      const index = stored?.sequenceIndex ?? indexForPdfPage(items, page)
      sequenceIndexRef.current = index
      pageRef.current = page
      setSequenceIndex(index)
      setPageNumber(page)
      setPageInput(String(page))

      const [nextBookmarks, nextHighlights, nextAnnotations] = await Promise.all([
        bookmarksRepo.forBook(bookId),
        highlightsRepo.forBook(bookId),
        annotationsRepo.forBook(bookId),
      ])
      if (cancelled) return
      setBookmarks(nextBookmarks)
      setHighlights(nextHighlights)
      setAnnotations(nextAnnotations)

      const size = await engine.getPageSize(page)
      const stage = stageRef.current
      if (stage && size.width > 0) {
        const available = Math.min(stage.clientWidth - 80, 920)
        const fitted = Math.min(MAX_SCALE, Math.max(MIN_SCALE, available / size.width))
        setScale(Number(fitted.toFixed(2)))
      }

      setEngineReady(true)
      void persistRef.current(page, index)
    }

    void load().catch((error) => {
      console.error(error)
      if (!cancelled) setLoadError("Couldn't open this book.")
    })

    return () => {
      cancelled = true
      void persistRef.current(pageRef.current, sequenceIndexRef.current)
      void engine.destroy()
    }
  }, [bookId])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        void persistProgress(pageRef.current, sequenceIndexRef.current)
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [persistProgress])

  const onPrev = useCallback(() => goToIndex(sequenceIndex - 1), [goToIndex, sequenceIndex])
  const onNext = useCallback(() => goToIndex(sequenceIndex + 1), [goToIndex, sequenceIndex])

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
        pageNumber: pageRef.current,
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

  const commitPage = () => {
    const next = Number.parseInt(pageInput, 10)
    if (!Number.isFinite(next)) {
      setPageInput(String(pageNumber))
      return
    }
    goToIndex(indexForPdfPage(sequence, next))
  }

  const activeAnnotation = annotations.find((item) => item.id === activeAnnotationId) ?? null

  if (!book) {
    return (
      <div className={styles.stage}>
        <p className={styles.status}>This book is unavailable.</p>
      </div>
    )
  }

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      onMouseMove={bump}
      onClick={bump}
    >
      <ReaderToolbar
        visible={visible || heldChrome}
        pageLabel={`/ ${pageCount}`}
        pageInput={pageInput}
        onPageInputChange={setPageInput}
        onPageCommit={commitPage}
        canPrev={sequenceIndex > 0}
        canNext={sequenceIndex < sequence.length - 1}
        onPrev={onPrev}
        onNext={onNext}
        onBack={() => {
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
        onZoomOut={() => setScale((value) => Math.max(MIN_SCALE, Number((value - SCALE_STEP).toFixed(2))))}
        onZoomIn={() => setScale((value) => Math.min(MAX_SCALE, Number((value + SCALE_STEP).toFixed(2))))}
        zoomLabel={`${Math.round(scale * 100)}%`}
        onFullscreen={() => {
          const node = stageRef.current
          if (!node) return
          if (document.fullscreenElement) void document.exitFullscreen()
          else void node.requestFullscreen()
        }}
      />

      {settingsOpen && (visible || heldChrome) ? (
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
            <span className={styles.themeOptionSub}>Floating text, no page edges</span>
          </button>
        </div>
      ) : null}

      <div className={styles.pageWrap}>
        {loadError ? (
          <p className={styles.status}>{loadError}</p>
        ) : engineReady ? (
          <PdfViewport
            engine={engineRef.current}
            pageNumber={pageNumber}
            scale={scale}
            highlights={highlights}
            annotations={annotations}
            activeAnnotationId={activeAnnotationId}
            onSelectAnnotation={setActiveAnnotationId}
            onSelection={applySelection}
          >
            {activeAnnotation ? (
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
                }}
              />
            ) : null}
          </PdfViewport>
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
                pageNumber: pageRef.current,
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
  )
} 