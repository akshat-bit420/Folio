import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RenderTask, TextLayer } from 'pdfjs-dist'
import type { Annotation, Highlight } from '../types/models'
import { diag } from '../utils/diag'
import { PdfEngine } from './pdf/PdfEngine'
import { OverlayLayer } from './OverlayLayer'
import { capturePageSelection, getTextLayerState, type PageSelection } from '../utils/selection'
import './pdf/textLayer.css'
import styles from './PdfViewport.module.css'

type PdfViewportProps = {
  engine: PdfEngine
  pageNumber: number
  scale: number
  highlights: Highlight[]
  annotations: Annotation[]
  activeAnnotationId: string | null
  onSelectAnnotation: (id: string | null) => void
  onSelection: (selection: PageSelection | null) => void
  onPainted?: () => void
  /* The 2D flip-in cue (280ms opacity dip on the page container) belongs to
     plain page changes. When the spread-mode 3D flip owns the transition the
     sheet already provides the motion, and a dip that outlives the sheet
     exposes a half-faded page over raw paper — the end-of-turn blink. The
     reader passes true while a book flip is in flight so the cue is skipped
     for the turn's commit. */
  suppressFlipCue?: boolean
  children?: ReactNode
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

// pdf.js's TextLayerBuilder appends an .endOfContent marker after the text
// spans and toggles .selecting on the layer while a drag is in progress. The
// low level TextLayer API does none of that, so we restore it here: without
// it, drags that leave the text layer (page margins, the page edge) can make
// the browser resolve the drag endpoint to the start of the page and select
// the whole page (pdf.js issues #19526 / #22259).
function ensureEndOfContent(textLayer: HTMLElement): void {
  if (!textLayer.querySelector(':scope > .endOfContent')) {
    const end = document.createElement('div')
    end.className = 'endOfContent'
    textLayer.appendChild(end)
  }
}

export function PdfViewport({
  engine,
  pageNumber,
  scale,
  highlights,
  annotations,
  activeAnnotationId,
  onSelectAnnotation,
  onSelection,
  onPainted,
  suppressFlipCue,
  children,
}: PdfViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const activeTaskRef = useRef<RenderTask | null>(null)
  const textTaskRef = useRef<TextLayer | null>(null)
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve())
  const taskSeqRef = useRef(0)
  const dragTraceRef = useRef({
    active: false,
    moved: false,
    downX: 0,
    downY: 0,
    endX: 0,
    endY: 0,
    minY: 0,
    maxY: 0,
  })
  const prevPageRef = useRef<number | null>(null)
  // Kept in a ref so a new callback identity never re-runs the render effect.
  const onPaintedRef = useRef(onPainted)
  onPaintedRef.current = onPainted
  // Same for the cue suppression: the turn commit changes pageNumber and this
  // flag in the same render, and the effect below must read the value that
  // belongs to that commit without re-subscribing.
  const suppressFlipCueRef = useRef(suppressFlipCue ?? false)
  suppressFlipCueRef.current = suppressFlipCue ?? false
  const [flip, setFlip] = useState<'none' | 'forward' | 'backward'>('none')

  useEffect(() => {
    const canvas = canvasRef.current
    const textLayer = textRef.current
    if (!canvas || !textLayer) return

    let cancelled = false
    taskSeqRef.current += 1
    const mySeq = taskSeqRef.current
    const stale = () => cancelled || mySeq !== taskSeqRef.current

    // Wait (capped) for an in-progress selection drag to finish before the
    // old text layer is cleared — a wipe mid-drag would destroy the user's
    // selection and make highlight/annotate silently do nothing.
    const waitForDragEnd = async () => {
      const startedAt = Date.now()
      while (dragTraceRef.current.active && Date.now() - startedAt < 2000) {
        await sleep(30)
      }
    }

    const executeRender = async () => {
      try {
        // Cancel whatever canvas/text work the previous page still had going.
        if (activeTaskRef.current) {
          activeTaskRef.current.cancel()
          await activeTaskRef.current.promise.catch(() => { })
          activeTaskRef.current = null
        }
        if (textTaskRef.current) {
          textTaskRef.current.cancel()
          textTaskRef.current = null
        }
        if (stale()) return

        await waitForDragEnd()
        if (stale()) return

        // Drop the previous page's spans right away: keeping them mounted
        // would let a drag "select" invisible text of a page the user has
        // already left, and capture would refuse it anyway.
        textLayer.replaceChildren()
        delete textLayer.dataset.page
        delete textLayer.dataset.items
        ensureEndOfContent(textLayer)

        const mountText = async (): Promise<boolean> => {
          const { layer, textItems } = await engine.renderTextLayer({
            pageNumber,
            container: textLayer,
            scale,
          })
          textTaskRef.current = layer
          ensureEndOfContent(textLayer)
          const spans = textLayer.querySelectorAll('span').length
          if (textItems > 0 && spans === 0) {
            throw new Error(`text layer mounted 0 spans for ${textItems} items`)
          }
          diag('text-mounted', `page=${pageNumber} spans=${spans} items=${textItems}`)
          return true
        }

        const mountTextWithRetry = async () => {
          try {
            await mountText()
          } catch (error) {
            if (stale()) throw error
            diag('text-retry', `page=${pageNumber} ${String(error).slice(0, 80)}`)
            // One retry: transient worker/font hiccups leave the container
            // wiped, so without this the page would stay permanently
            // text-less (and highlight/annotate would silently fail).
            await mountText()
          }
        }

        const paintCanvas = async () => {
          // Turn-commit renders (the flip cue is suppressed exactly then)
          // defer the canvas swap: the neighbouring slot is exposed while
          // the sheet flies, and a stale page beats a blank one.
          const renderTask = await engine.renderPage({
            pageNumber,
            canvas,
            scale,
            deferResize: suppressFlipCueRef.current,
          })
          if (stale()) {
            renderTask.cancel()
            await renderTask.promise.catch(() => { })
            return
          }
          activeTaskRef.current = renderTask
          await renderTask.promise
          // First-paint signal for the page-turn commit gate (ReaderScreen
          // holds the flipper until the landing canvases actually painted).
          // The engine blits the finished render before this promise
          // resolves, so the gate here also guarantees the pixels swapped.
          if (!stale()) onPaintedRef.current?.()
        }

        diag('render-start', `page=${pageNumber} scale=${scale}`)
        // Text layer and canvas render in parallel: the text layer is fast
        // and cheap, while the canvas (especially deep into a long book) can
        // take seconds. Rendering text only AFTER the canvas finished left a
        // window where users were dragging across a page with no text spans
        // at all — highlight/annotate then did nothing.
        await Promise.all([
          mountTextWithRetry().catch((error) => {
            if (stale()) return
            diag('text-failed', `page=${pageNumber} ${String(error).slice(0, 120)}`)
            console.error('Folio: text layer failed to mount', error)
          }),
          paintCanvas().catch((error) => {
            if (stale()) return
            const name = error instanceof Error ? error.name : ''
            if (name !== 'RenderingCancelledException') {
              diag('canvas-failed', `page=${pageNumber} ${String(error).slice(0, 120)}`)
              console.error(error)
            }
          }),
        ])
      } catch (error) {
        if (stale()) return
        const name = error instanceof Error ? error.name : ''
        if (name !== 'RenderingCancelledException' && name !== 'AbortException') {
          console.error(error)
        }
      }
    }

    // Chain onto the queue so two renders can NEVER interleave on the same
    // canvas/textLayer, while stale entries exit immediately (see mySeq).
    renderQueueRef.current = renderQueueRef.current.then(executeRender, executeRender)

    return () => {
      cancelled = true
      if (activeTaskRef.current) {
        activeTaskRef.current.cancel()
      }
      if (textTaskRef.current) {
        textTaskRef.current.cancel()
        textTaskRef.current = null
      }
    }
  }, [engine, pageNumber, scale])

  // Subtle page-turn cue whenever the displayed page changes. Purely
  // cosmetic: it animates the page container after the render pipeline has
  // already been switched, so it can never delay or break rendering, and it
  // is disabled for users with reduced-motion preferences (see the module
  // css). No flip on first mount (prev === null).
  useEffect(() => {
    const prev = prevPageRef.current
    prevPageRef.current = pageNumber
    // A suppressed cue still advances prevPageRef: the page DID change, and
    // the next unsuppressed change must compare against it.
    if (prev === null || prev === pageNumber || suppressFlipCueRef.current) return
    setFlip(pageNumber > prev ? 'forward' : 'backward')
    const timer = window.setTimeout(() => setFlip('none'), 320)
    return () => window.clearTimeout(timer)
  }, [pageNumber])

  // Restore pdf.js's selecting marker behaviour on the text layer.
  useEffect(() => {
    const textLayer = textRef.current
    if (!textLayer) return

    ensureEndOfContent(textLayer)

    const onDown = () => textLayer.classList.add('selecting')
    const onUp = () => textLayer.classList.remove('selecting')

    textLayer.addEventListener('mousedown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      textLayer.removeEventListener('mousedown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('blur', onUp)
      textLayer.classList.remove('selecting')
    }
  }, [pageNumber])

  // Track the pointer path of each text-selection drag so the captured
  // selection can be cleaned of whole-page "explosions" (see DragTrace).
  useEffect(() => {
    const pageEl = pageRef.current
    if (!pageEl) return

    const trace = dragTraceRef.current

    const onPointerDown = (event: PointerEvent) => {
      trace.active = true
      trace.moved = false
      trace.downX = event.clientX
      trace.downY = event.clientY
      trace.endX = event.clientX
      trace.endY = event.clientY
      trace.minY = event.clientY
      trace.maxY = event.clientY
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!trace.active) return
      if (
        Math.abs(event.clientX - trace.downX) > 3 ||
        Math.abs(event.clientY - trace.downY) > 3
      ) {
        trace.moved = true
      }
      trace.endX = event.clientX
      trace.endY = event.clientY
      if (event.clientY < trace.minY) trace.minY = event.clientY
      if (event.clientY > trace.maxY) trace.maxY = event.clientY
    }
    const onPointerUp = () => {
      trace.active = false
    }
    const onPointerCancel = () => {
      trace.active = false
      trace.moved = false
    }

    const onMouseUp = (event: MouseEvent) => {
      // Ignore mouseups that did not end on the page (toolbar buttons, hints,
      // popovers). Otherwise a stale browser selection could get captured the
      // moment the user clicks "Highlight" and be saved as garbage.
      if (!(event.target instanceof Node) || !pageEl.contains(event.target)) return
      window.setTimeout(() => {
        const tracePayload = trace.moved
          ? {
            moved: true,
            downX: trace.downX,
            downY: trace.downY,
            endX: trace.endX,
            endY: trace.endY,
            minY: trace.minY,
            maxY: trace.maxY,
          }
          : undefined
        const captured = capturePageSelection(pageEl, tracePayload, pageNumber)
        if (captured) {
          // Tag the capture with THIS viewport's page: in two-page spread
          // mode two viewports are live at once, and the anchor must be the
          // page the user actually dragged on. Cast, not a bare literal:
          // project copies whose utils/selection.ts predates spread mode
          // don't declare the optional `page` field, and a literal here
          // would fail their tsc (TS2353 'page' does not exist). On the
          // older revision the extra field is simply ignored at runtime.
          onSelection({ ...captured, page: pageNumber } as PageSelection & { page?: number })
          return
        }
        // A real drag produced nothing. If the text layer was not ready
        // (still mounting, wiped, or stale after a fast page change), tell
        // the parent so it can show a hint instead of failing silently.
        if (tracePayload) {
          const state = getTextLayerState(pageEl, pageNumber)
          if (state !== 'ready') {
            diag('capture-not-ready', `page=${pageNumber} layerState=${state}`)
            onSelection(null)
          }
        }
      }, 10)
    }

    pageEl.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      pageEl.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onSelection, pageNumber])

  const pageHighlights = highlights.filter((item) => item.anchor.pageNumber === pageNumber)
  const pageAnnotations = annotations.filter((item) => item.anchor.pageNumber === pageNumber)

  return (
    <div
      ref={pageRef}
      className={[
        styles.page,
        flip === 'forward' ? styles.flipForward : '',
        flip === 'backward' ? styles.flipBackward : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={() => onSelectAnnotation(null)}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <div ref={textRef} className={`textLayer ${styles.textLayer}`} />
      <OverlayLayer
        highlights={pageHighlights}
        annotations={pageAnnotations}
        activeAnnotationId={activeAnnotationId}
        onSelectAnnotation={onSelectAnnotation}
      />
      {children}
    </div>
  )
} 