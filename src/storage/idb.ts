const DB_NAME = 'folio'
const DB_VERSION = 1

export const STORES = {
  books: 'books',
  files: 'files',
  covers: 'covers',
  progress: 'progress',
  bookmarks: 'bookmarks',
  highlights: 'highlights',
  annotations: 'annotations',
  notes: 'notes',
  meta: 'meta',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.books)) {
        db.createObjectStore(STORES.books, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.files)) {
        db.createObjectStore(STORES.files)
      }
      if (!db.objectStoreNames.contains(STORES.covers)) {
        db.createObjectStore(STORES.covers)
      }
      if (!db.objectStoreNames.contains(STORES.progress)) {
        db.createObjectStore(STORES.progress, { keyPath: 'bookId' })
      }
      if (!db.objectStoreNames.contains(STORES.bookmarks)) {
        const s = db.createObjectStore(STORES.bookmarks, { keyPath: 'id' })
        s.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.highlights)) {
        const s = db.createObjectStore(STORES.highlights, { keyPath: 'id' })
        s.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.annotations)) {
        const s = db.createObjectStore(STORES.annotations, { keyPath: 'id' })
        s.createIndex('bookId', 'bookId', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.notes)) {
        db.createObjectStore(STORES.notes, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('Failed to open Folio storage'))
    }
  })
  return dbPromise
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).get(key))
}

export async function idbPut<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDb()
  const os = db.transaction(store, 'readwrite').objectStore(store)
  await reqToPromise(key !== undefined ? os.put(value, key) : os.put(value))
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  await reqToPromise(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).getAll())
}

export async function idbGetAllByIndex<T>(
  store: StoreName,
  index: string,
  query: IDBValidKey,
): Promise<T[]> {
  const db = await openDb()
  const idx = db.transaction(store, 'readonly').objectStore(store).index(index)
  return reqToPromise(idx.getAll(query))
}
