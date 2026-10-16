import type { RectNorm } from '../types/models'

export type PageSelection = {
  selectedText: string
  rects: RectNorm[]
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function capturePageSelection(pageEl: HTMLElement): PageSelection | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

  const range = sel.getRangeAt(0)
  if (!pageEl.contains(range.commonAncestorContainer)) return null

  const selectedText = sel.toString().replace(/\s+/g, ' ').trim()
  if (!selectedText) return null

  const pageBox = pageEl.getBoundingClientRect()
  if (pageBox.width < 1 || pageBox.height < 1) return null

  const rects: RectNorm[] = []
  for (const r of range.getClientRects()) {
    if (r.width < 0.5 || r.height < 0.5) continue
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    if (cx < pageBox.left || cx > pageBox.right || cy < pageBox.top || cy > pageBox.bottom) {
      return null
    }
    rects.push({
      x: (r.left - pageBox.left) / pageBox.width,
      y: (r.top - pageBox.top) / pageBox.height,
      w: r.width / pageBox.width,
      h: r.height / pageBox.height,
    })
  }

  const merged = mergeLineRects(rects)
  if (merged.length === 0) return null
  return { selectedText, rects: merged }
}

export function mergeLineRects(rects: RectNorm[]): RectNorm[] {
  if (rects.length <= 1) return rects

  // Sort rects primarily by vertical center, then by x
  const sorted = [...rects].sort((a, b) => {
    const cyA = a.y + a.h / 2
    const cyB = b.y + b.h / 2
    if (Math.abs(cyA - cyB) > 0.005) {
      return cyA - cyB
    }
    return a.x - b.x
  })

  type LineGroup = {
    rects: RectNorm[]
    minY: number
    maxY: number
    h: number
    cy: number
  }

  const lines: LineGroup[] = []

  for (const r of sorted) {
    const rCy = r.y + r.h / 2
    let matchedLine: LineGroup | null = null

    for (const line of lines) {
      const centerDist = Math.abs(line.cy - rCy)
      const centerThreshold = 0.6 * Math.min(line.h, r.h)

      const overlapY = Math.min(line.maxY, r.y + r.h) - Math.max(line.minY, r.y)
      const minH = Math.min(line.h, r.h)
      const overlapRatio = minH > 0 ? overlapY / minH : 0

      if (centerDist <= centerThreshold || overlapRatio > 0.5) {
        matchedLine = line
        break
      }
    }

    if (matchedLine) {
      matchedLine.rects.push(r)
      matchedLine.minY = Math.min(matchedLine.minY, r.y)
      matchedLine.maxY = Math.max(matchedLine.maxY, r.y + r.h)
      matchedLine.h = matchedLine.maxY - matchedLine.minY
      matchedLine.cy = (matchedLine.minY + matchedLine.maxY) / 2
    } else {
      lines.push({
        rects: [r],
        minY: r.y,
        maxY: r.y + r.h,
        h: r.h,
        cy: rCy,
      })
    }
  }

  // Sort lines from top to bottom
  lines.sort((a, b) => a.minY - b.minY)

  const mergedRects: RectNorm[] = []

  for (const line of lines) {
    const lineRects = line.rects.sort((a, b) => a.x - b.x)
    let curr = { ...lineRects[0] }

    for (let i = 1; i < lineRects.length; i++) {
      const next = lineRects[i]
      const gap = next.x - (curr.x + curr.w)

      if (gap < 0.03) {
        const x = Math.min(curr.x, next.x)
        const y = Math.min(curr.y, next.y)
        const right = Math.max(curr.x + curr.w, next.x + next.w)
        const bottom = Math.max(curr.y + curr.h, next.y + next.h)
        curr = {
          x,
          y,
          w: right - x,
          h: bottom - y,
        }
      } else {
        mergedRects.push(curr)
        curr = { ...next }
      }
    }
    mergedRects.push(curr)
  }

  return mergedRects
}

export function clearBrowserSelection(): void {
  window.getSelection()?.removeAllRanges()
  window.setTimeout(() => {
    window.getSelection()?.removeAllRanges()
  }, 0)
}

