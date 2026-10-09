import type { ReadingItem } from '../types/models'

export function buildPdfSequence(pageCount: number): ReadingItem[] {
  const items: ReadingItem[] = []
  for (let page = 1; page <= pageCount; page += 1) {
    items.push({ kind: 'pdf', pageNumber: page })
  }
  return items
}

export function pdfPageAt(items: ReadingItem[], index: number): number | null {
  const item = items[index]
  if (!item || item.kind !== 'pdf') return null
  return item.pageNumber
}

export function indexForPdfPage(items: ReadingItem[], pageNumber: number): number {
  const index = items.findIndex((item) => item.kind === 'pdf' && item.pageNumber === pageNumber)
  return index >= 0 ? index : 0
}

// TODO: splice `{ kind: 'personal', id }` into this sequence later without rewriting PdfViewport.
