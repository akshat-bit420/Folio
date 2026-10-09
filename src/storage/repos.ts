import type {
  Annotation,
  Book,
  Bookmark,
  Highlight,
  PersonalNote,
  ReadingProgress,
  ThemeId,
} from '../types/models'
import { idbDelete, idbGet, idbGetAll, idbGetAllByIndex, idbPut, STORES } from './idb'

export const booksRepo = {
  all: () => idbGetAll<Book>(STORES.books),
  get: (id: string) => idbGet<Book>(STORES.books, id),
  put: (book: Book) => idbPut(STORES.books, book),
  remove: (id: string) => idbDelete(STORES.books, id),
}

export const filesRepo = {
  get: (bookId: string) => idbGet<Blob>(STORES.files, bookId),
  put: (bookId: string, blob: Blob) => idbPut(STORES.files, blob, bookId),
  remove: (bookId: string) => idbDelete(STORES.files, bookId),
}

export const coversRepo = {
  get: (bookId: string) => idbGet<Blob>(STORES.covers, bookId),
  put: (bookId: string, blob: Blob) => idbPut(STORES.covers, blob, bookId),
  remove: (bookId: string) => idbDelete(STORES.covers, bookId),
}

export const progressRepo = {
  all: () => idbGetAll<ReadingProgress>(STORES.progress),
  get: (bookId: string) => idbGet<ReadingProgress>(STORES.progress, bookId),
  put: (progress: ReadingProgress) => idbPut(STORES.progress, progress),
}

export const bookmarksRepo = {
  forBook: (bookId: string) => idbGetAllByIndex<Bookmark>(STORES.bookmarks, 'bookId', bookId),
  put: (bookmark: Bookmark) => idbPut(STORES.bookmarks, bookmark),
  remove: (id: string) => idbDelete(STORES.bookmarks, id),
}

export const highlightsRepo = {
  forBook: (bookId: string) => idbGetAllByIndex<Highlight>(STORES.highlights, 'bookId', bookId),
  put: (highlight: Highlight) => idbPut(STORES.highlights, highlight),
  remove: (id: string) => idbDelete(STORES.highlights, id),
}

export const annotationsRepo = {
  forBook: (bookId: string) => idbGetAllByIndex<Annotation>(STORES.annotations, 'bookId', bookId),
  put: (annotation: Annotation) => idbPut(STORES.annotations, annotation),
  remove: (id: string) => idbDelete(STORES.annotations, id),
}

export const notesRepo = {
  all: () => idbGetAll<PersonalNote>(STORES.notes),
  put: (note: PersonalNote) => idbPut(STORES.notes, note),
  remove: (id: string) => idbDelete(STORES.notes, id),
}

export const metaRepo = {
  getTheme: async (): Promise<ThemeId> => {
    const value = await idbGet<ThemeId>(STORES.meta, 'themeId')
    return value ?? 'kindle'
  },
  setTheme: (themeId: ThemeId) => idbPut(STORES.meta, themeId, 'themeId'),
}
