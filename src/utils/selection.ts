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

  if (rects.length === 0) return null
  return { selectedText, rects }
}
