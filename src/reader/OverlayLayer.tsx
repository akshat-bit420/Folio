import type { CSSProperties } from 'react'
import type { Annotation, Highlight } from '../types/models'
import styles from './OverlayLayer.module.css'

type OverlayLayerProps = {
  highlights: Highlight[]
  annotations: Annotation[]
  activeAnnotationId: string | null
  onSelectAnnotation: (id: string) => void
}

export function OverlayLayer({
  highlights,
  annotations,
  activeAnnotationId,
  onSelectAnnotation,
}: OverlayLayerProps) {
  return (
    <div className={styles.layer} aria-hidden={false}>
      {highlights.map((highlight) =>
        highlight.anchor.rects.map((rect, index) => (
          <span
            key={`${highlight.id}-${index}`}
            className={styles.highlight}
            style={box(rect)}
          />
        )),
      )}
      {annotations.map((annotation) =>
        annotation.anchor.rects.map((rect, index) => (
          <button
            key={`${annotation.id}-${index}`}
            type="button"
            className={`${styles.annotation} ${activeAnnotationId === annotation.id ? styles.annotationActive : ''}`}
            style={box(rect)}
            aria-label="Open annotation"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onSelectAnnotation(annotation.id)
            }}
          />
        )),
      )}
    </div>
  )
}

function box(rect: { x: number; y: number; w: number; h: number }): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
  }
}
