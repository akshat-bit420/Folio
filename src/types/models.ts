export type ThemeId = 'kindle'

export type AppView = 'library' | 'notes' | 'activity' | 'reader'

export type Book = {
  id: string
  title: string
  fileName: string
  pageCount: number
  importedAt: string
  lastOpenedAt: string | null
}

export type ReadingProgress = {
  bookId: string
  lastPdfPage: number
  sequenceIndex: number
  percent: number
  updatedAt: string
}

export type Bookmark = {
  id: string
  bookId: string
  pageNumber: number
  title?: string
  note?: string
  createdAt: string
}

export type RectNorm = {
  x: number
  y: number
  w: number
  h: number
}

export type TextAnchor = {
  pageNumber: number
  selectedText: string
  rects: RectNorm[]
  /** Reserved for later rematch against PDF.js textContent items. */
  itemBegin?: number
  itemEnd?: number
}

export type Highlight = {
  id: string
  bookId: string
  anchor: TextAnchor
  createdAt: string
}

export type Annotation = {
  id: string
  bookId: string
  anchor: TextAnchor
  body: string
  createdAt: string
  updatedAt: string
}

export type PersonalNote = {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  /** Reserved: notes may later be linked to a book. */
  bookId?: string
}

export type ActivityEntry = {
  bookId: string
  title: string
  lastOpenedAt: string
  percent: number
}

/** Future: insert personal pages into the reading stream. */
export type ReadingItem =
  | { kind: 'pdf'; pageNumber: number }
  | { kind: 'personal'; id: string }

export type MarkupTool = 'none' | 'highlight' | 'annotate'
