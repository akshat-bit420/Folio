// import type { RectNorm } from '../types/models'

// export type PageSelection = {
//   pageNumber: number
//   selectedText: string
//   rects: RectNorm[]
// }

// export function isTypingTarget(target: EventTarget | null): boolean {
//   if (!(target instanceof HTMLElement)) return false
//   if (target.isContentEditable) return true
//   const tag = target.tagName
//   return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
// }

// export function clearBrowserSelection(): void {
//   window.getSelection()?.removeAllRanges()
// }

// function clamp(n: number, min = 0, max = 1): number {
//   return Math.min(max, Math.max(min, n))
// }

// function clampRect(rect: RectNorm): RectNorm | null {
//   const x = clamp(rect.x)
//   const y = clamp(rect.y)
//   const w = clamp(rect.x + rect.w) - x
//   const h = clamp(rect.y + rect.h) - y
//   if (w < 0.0005 || h < 0.0005) return null
//   return { x, y, w, h }
// }

// function mergeLineRects(rawRects: RectNorm[]): RectNorm[] {
//   if (rawRects.length <= 1) return rawRects

//   const sortedByY = [...rawRects].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))
//   const lines: RectNorm[][] = []
//   for (const r of sortedByY) {
//     const cy = r.y + r.h / 2
//     let matchedLine: RectNorm[] | null = null
//     for (const line of lines) {
//       const ref = line[0]
//       const lineTol = Math.max(ref.h, r.h) * 0.65
//       if (Math.abs(cy - (ref.y + ref.h / 2)) <= lineTol) {
//         matchedLine = line
//         break
//       }
//     }
//     if (matchedLine) {
//       matchedLine.push(r)
//       if (r.h > matchedLine[0].h) {
//         matchedLine[matchedLine.indexOf(r)] = matchedLine[0]
//         matchedLine[0] = r
//       }
//     } else {
//       lines.push([r])
//     }
//   }

//   const merged: RectNorm[] = []
//   for (const line of lines) {
//     line.sort((a, b) => a.x - b.x)
//     let curr = { ...line[0] }
//     for (let i = 1; i < line.length; i++) {
//       const next = line[i]
//       const gap = next.x - (curr.x + curr.w)
//       if (gap < 0.04) {
//         const x = Math.min(curr.x, next.x)
//         const y = Math.min(curr.y, next.y)
//         curr = {
//           x,
//           y,
//           w: Math.max(curr.x + curr.w, next.x + next.w) - x,
//           h: Math.max(curr.y + curr.h, next.y + next.h) - y,
//         }
//       } else {
//         merged.push(curr)
//         curr = { ...next }
//       }
//     }
//     merged.push(curr)
//   }
//   return merged
// }

// export function capturePageSelection(
//   textLayer: HTMLElement,
//   pageNumber: number,
// ): PageSelection | null {
//   const sel = window.getSelection()
//   if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

//   const range = sel.getRangeAt(0)
//   if (!textLayer.contains(range.commonAncestorContainer)) return null

//   const selectedText = sel.toString().replace(/\s+/g, ' ').trim()
//   if (!selectedText) return null

//   const box = textLayer.getBoundingClientRect()
//   const width = textLayer.offsetWidth || box.width
//   const height = textLayer.offsetHeight || box.height
//   if (width < 1 || height < 1) return null

//   const rects: RectNorm[] = []
//   const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT, {
//     acceptNode(node) {
//       if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT
//       return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
//     },
//   })

//   let currentNode = walker.nextNode()
//   while (currentNode) {
//     const nodeRange = document.createRange()
//     nodeRange.selectNodeContents(currentNode)
//     if (currentNode === range.startContainer) nodeRange.setStart(currentNode, range.startOffset)
//     if (currentNode === range.endContainer) nodeRange.setEnd(currentNode, range.endOffset)

//     for (const r of nodeRange.getClientRects()) {
//       if (r.width < 0.5 || r.height < 0.5) continue
//       const next = clampRect({
//         x: (r.left - box.left) / width,
//         y: (r.top - box.top) / height,
//         w: r.width / width,
//         h: r.height / height,
//       })
//       if (next) rects.push(next)
//     }
//     currentNode = walker.nextNode()
//   }

//   if (rects.length === 0) return null
//   return { pageNumber, selectedText, rects: mergeLineRects(rects) }
// }

import type { RectNorm } from '../types/models'
import { diag } from './diag'

export type PageSelection = {
  selectedText: string
  rects: RectNorm[]
}

/**
 * Whether the page's invisible text layer currently holds the text of the
 * page the user is looking at.
 *
 * - `ready`   — spans for this exact page are mounted; capture is safe.
 * - `stale`   — the layer still holds the PREVIOUS page's text (mid page
 *               change). Capturing now would anchor highlights to the wrong
 *               page, so it must be refused.
 * - `empty`   — the page HAS text but no spans got mounted (mount failed).
 * - `missing` — no layer at all.
 */
export type TextLayerState = 'ready' | 'stale' | 'empty' | 'missing'

export function getTextLayerState(pageEl: HTMLElement, expectedPage: number): TextLayerState {
  const layer = pageEl.querySelector('.textLayer')
  if (!(layer instanceof HTMLElement)) return 'missing'

  if (layer.dataset.page !== String(expectedPage)) return 'stale'

  const items = Number(layer.dataset.items ?? '0')
  const spans = layer.querySelectorAll('span').length
  if (items > 0 && spans === 0) return 'empty'
  return 'ready'
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function clearBrowserSelection(): void {
  window.getSelection()?.removeAllRanges()
}

function mergeLineRects(rawRects: RectNorm[]): RectNorm[] {
  if (rawRects.length <= 1) return rawRects

  const sortedByY = [...rawRects].sort((a, b) => {
    const cyA = a.y + a.h / 2
    const cyB = b.y + b.h / 2
    return cyA - cyB
  })

  const lines: RectNorm[][] = []
  for (const r of sortedByY) {
    const cy = r.y + r.h / 2
    let matchedLine: RectNorm[] | null = null

    for (const line of lines) {
      const ref = line[0]
      const refCy = ref.y + ref.h / 2
      const lineTol = Math.max(ref.h, r.h) * 0.65
      if (Math.abs(cy - refCy) <= lineTol) {
        matchedLine = line
        break
      }
    }

    if (matchedLine) {
      matchedLine.push(r)
      if (r.h > matchedLine[0].h) {
        const idx = matchedLine.indexOf(r)
        matchedLine[idx] = matchedLine[0]
        matchedLine[0] = r
      }
    } else {
      lines.push([r])
    }
  }

  const merged: RectNorm[] = []
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x)
    let curr = { ...line[0] }

    for (let i = 1; i < line.length; i++) {
      const next = line[i]
      const gap = next.x - (curr.x + curr.w)
      if (gap < 0.04) {
        const x = Math.min(curr.x, next.x)
        const y = Math.min(curr.y, next.y)
        const right = Math.max(curr.x + curr.w, next.x + next.w)
        const bottom = Math.max(curr.y + curr.h, next.y + next.h)
        curr = { x, y, w: right - x, h: bottom - y }
      } else {
        merged.push(curr)
        curr = { ...next }
      }
    }
    merged.push(curr)
  }

  return merged
}

type CaretPos = { node: Node; offset: number }

/**
 * Pointer path of the drag that produced the selection, in client coordinates.
 *
 * When a text-selection drag leaves the text layer (page margins, the page
 * edge, blank space), browsers resolve the drag endpoint to "the start of the
 * element under the pointer" — which for a pdf.js text layer means the native
 * selection explodes to whole-page text or collapses back to the drag's start
 * (pdf.js issues #19526 / #22259). The trace lets capturePageSelection
 * reconstruct the intended range from where the drag actually started and
 * ended, and drop any stray rows in the fallback path.
 */
export type DragTrace = {
  moved: boolean
  downX: number
  downY: number
  endX: number
  endY: number
  minY: number
  maxY: number
}

function caretAtPoint(x: number, y: number): CaretPos | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null
  }
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y)
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null
  }
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y)
    return range ? { node: range.startContainer, offset: range.startOffset } : null
  }
  return null
}

function orderedRange(a: CaretPos, b: CaretPos): Range | null {
  const ra = document.createRange()
  ra.setStart(a.node, a.offset)
  ra.setEnd(a.node, a.offset)
  const rb = document.createRange()
  rb.setStart(b.node, b.offset)
  rb.setEnd(b.node, b.offset)
  const range = document.createRange()
  if (ra.compareBoundaryPoints(Range.START_TO_START, rb) <= 0) {
    range.setStart(a.node, a.offset)
    range.setEnd(b.node, b.offset)
  } else {
    range.setStart(b.node, b.offset)
    range.setEnd(a.node, a.offset)
  }
  return range.collapsed ? null : range
}

/**
 * Resolve the caret the drag ended at, clamping to the text layer when the
 * pointer finished on blank space (margin, page edge, beyond the page).
 */
function resolveFocusCaret(pageEl: HTMLElement, x: number, y: number): CaretPos | null {
  const textLayer = pageEl.querySelector('.textLayer')
  if (!textLayer) return null

  const direct = caretAtPoint(x, y)
  if (
    direct &&
    direct.node.nodeType === Node.TEXT_NODE &&
    textLayer.contains(direct.node)
  ) {
    return direct
  }

  // The pointer ended off any text: clamp to the nearest text row.
  const spans = Array.from(textLayer.querySelectorAll('span'))
  let nearestBox: DOMRect | null = null
  let nearestDist = Number.POSITIVE_INFINITY
  for (const span of spans) {
    const box = span.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) continue
    const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
    if (dy < nearestDist) {
      nearestDist = dy
      nearestBox = box
    }
  }
  if (!nearestBox || nearestDist > nearestBox.height * 2) return null

  const rowCenter = nearestBox.top + nearestBox.height / 2
  const rowHeight = nearestBox.height
  let left = nearestBox.left
  let right = nearestBox.right
  for (const span of spans) {
    const box = span.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) continue
    const center = box.top + box.height / 2
    if (Math.abs(center - rowCenter) <= rowHeight * 0.6) {
      left = Math.min(left, box.left)
      right = Math.max(right, box.right)
    }
  }

  const clampedX = Math.min(Math.max(x, left + 2), right - 2)
  const clampedY = Math.min(Math.max(y, nearestBox.top + 1), nearestBox.bottom - 1)
  const clamped = caretAtPoint(clampedX, clampedY)
  if (
    clamped &&
    clamped.node.nodeType === Node.TEXT_NODE &&
    textLayer.contains(clamped.node)
  ) {
    return clamped
  }
  return null
}

/**
 * Capture the text the user selected on one PDF page.
 *
 * `expectedPage` guards against races with page transitions: when the text
 * layer does not hold exactly this page's spans (still mounting, wiped, or
 * still showing the previous page), the capture is refused instead of
 * anchoring a highlight to the wrong text.
 */
export function capturePageSelection(
  pageEl: HTMLElement,
  drag?: DragTrace,
  expectedPage?: number,
): PageSelection | null {
  const pageBox = pageEl.getBoundingClientRect()
  if (pageBox.width < 1 || pageBox.height < 1) return null

  if (expectedPage != null) {
    const state = getTextLayerState(pageEl, expectedPage)
    if (state !== 'ready') {
      diag('capture-skip', `page=${expectedPage} layerState=${state}`)
      return null
    }
  }

  let range: Range | null = null

  if (drag?.moved) {
    // Reconstruct the intended selection from the pointer path. The native
    // selection cannot be trusted for drags that crossed blank space.
    const down = caretAtPoint(drag.downX, drag.downY)
    const focus = resolveFocusCaret(pageEl, drag.endX, drag.endY)
    const textLayer = pageEl.querySelector('.textLayer')
    if (
      down &&
      focus &&
      textLayer &&
      down.node.nodeType === Node.TEXT_NODE &&
      textLayer.contains(down.node)
    ) {
      range = orderedRange(down, focus)
    }
  }

  if (!range) {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    const candidate = sel.getRangeAt(0)
    if (!candidate.intersectsNode(pageEl)) return null
    range = candidate
  }

  const selectedText = range.toString().replace(/\s+/g, ' ').trim()
  if (!selectedText) return null

  const rects: RectNorm[] = []

  const walker = document.createTreeWalker(
    pageEl,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT
        }
        return range.intersectsNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      },
    },
  )

  let currentNode = walker.nextNode()
  while (currentNode) {
    const nodeRange = document.createRange()
    nodeRange.selectNodeContents(currentNode)

    if (currentNode === range.startContainer) {
      nodeRange.setStart(currentNode, range.startOffset)
    }
    if (currentNode === range.endContainer) {
      nodeRange.setEnd(currentNode, range.endOffset)
    }

    for (const r of Array.from(nodeRange.getClientRects())) {
      if (r.width < 1 || r.height < 1) continue
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (cx < pageBox.left || cx > pageBox.right || cy < pageBox.top || cy > pageBox.bottom) {
        continue
      }
      if (drag) {
        // Drop rects on rows the pointer never travelled near: a safety net
        // for the native-selection path when reconstruction was not possible.
        const tolerance = Math.max(12, r.height * 0.9)
        if (cy < drag.minY - tolerance || cy > drag.maxY + tolerance) {
          continue
        }
      }
      rects.push({
        x: (r.left - pageBox.left) / pageBox.width,
        y: (r.top - pageBox.top) / pageBox.height,
        w: r.width / pageBox.width,
        h: r.height / pageBox.height,
      })
    }

    currentNode = walker.nextNode()
  }

  if (rects.length === 0) {
    diag('capture-empty-rects')
    return null
  }
  const result = { selectedText, rects: mergeLineRects(rects) }
  diag('capture-ok', `page=${expectedPage ?? '?'} text="${selectedText.slice(0, 24)}" rects=${result.rects.length}`)
  return result
}