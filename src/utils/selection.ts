// import type { RectNorm } from '../types/models'

// export type PageSelection = {
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

// function mergeLineRects(rawRects: RectNorm[]): RectNorm[] {
//   if (rawRects.length <= 1) return rawRects

//   const sorted = [...rawRects].sort((a, b) => {
//     const cyA = a.y + a.h / 2
//     const cyB = b.y + b.h / 2
//     const minH = Math.min(a.h, b.h)
//     if (Math.abs(cyA - cyB) > minH * 0.6) {
//       return cyA - cyB
//     }
//     return a.x - b.x
//   })

//   const lines: RectNorm[][] = []
//   for (const r of sorted) {
//     const cy = r.y + r.h / 2
//     const lastLine = lines[lines.length - 1]
//     if (!lastLine) {
//       lines.push([r])
//       continue
//     }
//     const ref = lastLine[0]
//     const refCy = ref.y + ref.h / 2
//     const minH = Math.min(ref.h, r.h)
//     if (Math.abs(cy - refCy) <= minH * 0.6) {
//       lastLine.push(r)
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
//       if (gap < 0.03) {
//         const x = Math.min(curr.x, next.x)
//         const y = Math.min(curr.y, next.y)
//         const right = Math.max(curr.x + curr.w, next.x + next.w)
//         const bottom = Math.max(curr.y + curr.h, next.y + next.h)
//         curr = { x, y, w: right - x, h: bottom - y }
//       } else {
//         merged.push(curr)
//         curr = { ...next }
//       }
//     }
//     merged.push(curr)
//   }

//   return merged
// }

// export function capturePageSelection(pageEl: HTMLElement): PageSelection | null {
//   const sel = window.getSelection()
//   if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

//   const range = sel.getRangeAt(0)
//   if (!pageEl.contains(range.commonAncestorContainer)) return null

//   const selectedText = sel.toString().replace(/\s+/g, ' ').trim()
//   if (!selectedText) return null

//   const pageBox = pageEl.getBoundingClientRect()
//   if (pageBox.width < 1 || pageBox.height < 1) return null

//   const rects: RectNorm[] = []

//   const walker = document.createTreeWalker(
//     pageEl,
//     NodeFilter.SHOW_TEXT,
//     {
//       acceptNode(node) {
//         if (!node.nodeValue || !node.nodeValue.trim()) {
//           return NodeFilter.FILTER_REJECT
//         }
//         return range.intersectsNode(node)
//           ? NodeFilter.FILTER_ACCEPT
//           : NodeFilter.FILTER_REJECT
//       },
//     },
//   )

//   let currentNode = walker.nextNode()
//   while (currentNode) {
//     const nodeRange = document.createRange()
//     nodeRange.selectNodeContents(currentNode)

//     if (currentNode === range.startContainer) {
//       nodeRange.setStart(currentNode, range.startOffset)
//     }
//     if (currentNode === range.endContainer) {
//       nodeRange.setEnd(currentNode, range.endOffset)
//     }

//     for (const r of Array.from(nodeRange.getClientRects())) {
//       if (r.width < 1 || r.height < 1) continue
//       const cx = r.left + r.width / 2
//       const cy = r.top + r.height / 2
//       if (cx < pageBox.left || cx > pageBox.right || cy < pageBox.top || cy > pageBox.bottom) {
//         continue
//       }
//       rects.push({
//         x: (r.left - pageBox.left) / pageBox.width,
//         y: (r.top - pageBox.top) / pageBox.height,
//         w: r.width / pageBox.width,
//         h: r.height / pageBox.height,
//       })
//     }

//     currentNode = walker.nextNode()
//   }

//   if (rects.length === 0) return null
//   return { selectedText, rects: mergeLineRects(rects) }
// }

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

export function capturePageSelection(pageEl: HTMLElement): PageSelection | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

  const range = sel.getRangeAt(0)
  // if (!pageEl.contains(range.commonAncestorContainer)) return null
  if (!range.intersectsNode(pageEl)) return null

  const selectedText = sel.toString().replace(/\s+/g, ' ').trim()
  if (!selectedText) return null

  const pageBox = pageEl.getBoundingClientRect()
  if (pageBox.width < 1 || pageBox.height < 1) return null

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
      rects.push({
        x: (r.left - pageBox.left) / pageBox.width,
        y: (r.top - pageBox.top) / pageBox.height,
        w: r.width / pageBox.width,
        h: r.height / pageBox.height,
      })
    }

    currentNode = walker.nextNode()
  }

  if (rects.length === 0) return null
  return { selectedText, rects: mergeLineRects(rects) }
}
