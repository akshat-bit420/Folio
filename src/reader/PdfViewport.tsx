import { useEffect, useRef, type ReactNode } from 'react'
import type { RenderTask } from 'pdfjs-dist'
import type { Annotation, Highlight } from '../types/models'
import { PdfEngine } from './pdf/PdfEngine'
import { OverlayLayer } from './OverlayLayer'
import { capturePageSelection, type PageSelection } from '../utils/selection'
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

  useEffect(() => {
    const canvas = canvasRef.current
    const textLayer = textRef.current
    if (!canvas || !textLayer) return

    let cancelled = false
    let renderTask: RenderTask | null = null
    let text: { cancel: () => void } | null = null

    const run = async () => {
      try {
        renderTask = await engine.renderPage({ pageNumber, canvas, scale })
        await renderTask.promise
        if (cancelled) return
        text = await engine.renderTextLayer({ pageNumber, container: textLayer, scale })
      } catch (error) {
        if (cancelled) return
        const name = error instanceof Error ? error.name : ''
        if (name !== 'RenderingCancelledException') {
          console.error(error)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      renderTask?.cancel()
      text?.cancel()
    }
  }, [engine, pageNumber, scale])

  useEffect(() => {
    const pageEl = pageRef.current
    if (!pageEl) return

    const onMouseUp = () => {
      window.setTimeout(() => {
        onSelection(capturePageSelection(pageEl))
      }, 0)
    }

    pageEl.addEventListener('mouseup', onMouseUp)
    return () => pageEl.removeEventListener('mouseup', onMouseUp)
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
