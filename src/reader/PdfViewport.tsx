// import { useEffect, useRef, type ReactNode } from 'react'
// import type { RenderTask } from 'pdfjs-dist'
// import type { Annotation, Highlight } from '../types/models'
// import { capturePageSelection, type PageSelection } from '../utils/selection'
// import { OverlayLayer } from './OverlayLayer'
// import { PdfEngine } from './pdf/PdfEngine'
// import './pdf/textLayer.css'
// import styles from './PdfViewport.module.css'

// type PdfViewportProps = {
//   engine: PdfEngine
//   pageNumber: number
//   scale: number
//   highlights: Highlight[]
//   annotations: Annotation[]
//   activeAnnotationId: string | null
//   onSelectAnnotation: (id: string | null) => void
//   onSelection: (selection: PageSelection | null) => void
//   children?: ReactNode
// }

// export function PdfViewport({
//   engine,
//   pageNumber,
//   scale,
//   highlights,
//   annotations,
//   activeAnnotationId,
//   onSelectAnnotation,
//   onSelection,
//   children,
// }: PdfViewportProps) {
//   const canvasRef = useRef<HTMLCanvasElement>(null)
//   const textRef = useRef<HTMLDivElement>(null)
//   const pageRef = useRef<HTMLDivElement>(null)
//   const activeTaskRef = useRef<RenderTask | null>(null)
//   const renderQueueRef = useRef(Promise.resolve())
//   const genRef = useRef(0)
//   const textLayerPageRef = useRef<number | null>(null)

//   useEffect(() => {
//     const canvas = canvasRef.current
//     const textLayer = textRef.current
//     if (!canvas || !textLayer) return

//     const gen = ++genRef.current
//     textLayerPageRef.current = null
//     textLayer.replaceChildren()

//     let cancelled = false
//     let textTask: { cancel: () => void } | null = null

//     const executeRender = async () => {
//       try {
//         if (activeTaskRef.current) {
//           activeTaskRef.current.cancel()
//           await activeTaskRef.current.promise.catch(() => {})
//           activeTaskRef.current = null
//         }
//         if (cancelled || gen !== genRef.current) return

//         const renderTask = await engine.renderPage({ pageNumber, canvas, scale })
//         activeTaskRef.current = renderTask
//         if (cancelled || gen !== genRef.current) {
//           renderTask.cancel()
//           await renderTask.promise.catch(() => {})
//           return
//         }

//         await renderTask.promise
//         if (cancelled || gen !== genRef.current) return

//         textTask = await engine.renderTextLayer({ pageNumber, container: textLayer, scale })
//         if (cancelled || gen !== genRef.current) {
//           textTask.cancel()
//           return
//         }
//         textLayerPageRef.current = pageNumber
//       } catch (error) {
//         if (cancelled || gen !== genRef.current) return
//         const name = error instanceof Error ? error.name : ''
//         if (name !== 'RenderingCancelledException') console.error(error)
//       }
//     }

//     renderQueueRef.current = renderQueueRef.current.then(executeRender, executeRender)

//     return () => {
//       cancelled = true
//       textLayerPageRef.current = null
//       activeTaskRef.current?.cancel()
//       textTask?.cancel()
//     }
//   }, [engine, pageNumber, scale])

//   useEffect(() => {
//     const onMouseUp = () => {
//       window.setTimeout(() => {
//         const textLayer = textRef.current
//         if (!textLayer || textLayerPageRef.current !== pageNumber) return
//         const captured = capturePageSelection(textLayer, pageNumber)
//         if (captured) onSelection(captured)
//       }, 10)
//     }

//     window.addEventListener('mouseup', onMouseUp)
//     return () => window.removeEventListener('mouseup', onMouseUp)
//   }, [onSelection, pageNumber])

//   const pageHighlights = highlights.filter((item) => item.anchor.pageNumber === pageNumber)
//   const pageAnnotations = annotations.filter((item) => item.anchor.pageNumber === pageNumber)

//   return (
//     <div ref={pageRef} className={styles.page} onMouseDown={() => onSelectAnnotation(null)}>
//       <canvas ref={canvasRef} className={styles.canvas} />
//       <div ref={textRef} className={`textLayer ${styles.textLayer}`} />
//       <OverlayLayer
//         highlights={pageHighlights}
//         annotations={pageAnnotations}
//         activeAnnotationId={activeAnnotationId}
//         onSelectAnnotation={onSelectAnnotation}
//       />
//       {children}
//     </div>
//   )
// }

import { useEffect, useRef, type ReactNode } from 'react'
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
          await activeTaskRef.current.promise.catch(() => {})
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
          const {layer, textItems } = await engine.renderTextLayer({
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
          const renderTask = await engine.renderPage({ pageNumber, canvas, scale })
          if (stale()) {
            renderTask.cancel()
            await renderTask.promise.catch(() => {})
            return
          }
          activeTaskRef.current = renderTask
          await renderTask.promise
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
          onSelection(captured)
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
      className={styles.page}
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