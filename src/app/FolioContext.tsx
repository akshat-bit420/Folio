import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { importPdfFile } from '../library/importPdf'
import {
  booksRepo,
  coversRepo,
  metaRepo,
  notesRepo,
  progressRepo,
} from '../storage/repos'
import type {
  AppView,
  Book,
  PersonalNote,
  ReadingProgress,
  ThemeId,
} from '../types/models'
import { nowIso } from '../utils/time'

type FolioContextValue = {
  ready: boolean
  view: AppView
  setView: (view: AppView) => void
  books: Book[]
  progressById: Record<string, ReadingProgress>
  coverUrlById: Record<string, string>
  notes: PersonalNote[]
  searchQuery: string
  setSearchQuery: (query: string) => void
  hint: string | null
  showHint: (message: string) => void
  importError: string | null
  importing: boolean
  importPdf: (file: File) => Promise<void>
  openBook: (bookId: string) => Promise<void>
  closeReader: (nextView?: AppView) => void
  activeBookId: string | null
  refreshProgress: (progress: ReadingProgress) => void
  touchBookOpened: (bookId: string) => Promise<void>
  createNote: () => Promise<PersonalNote>
  saveNote: (note: PersonalNote) => Promise<void>
  deleteNote: (id: string) => Promise<void>
}

const FolioContext = createContext<FolioContextValue | null>(null)

export function FolioProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<AppView>('library')
  const [books, setBooks] = useState<Book[]>([])
  const [progressById, setProgressById] = useState<Record<string, ReadingProgress>>({})
  const [coverUrlById, setCoverUrlById] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<PersonalNote[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [activeBookId, setActiveBookId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = 'kindle'
    void metaRepo.setTheme('kindle' satisfies ThemeId)
  }, [])

  useEffect(() => {
    let revoked: string[] = []
    const load = async () => {
      const [nextBooks, progress, nextNotes] = await Promise.all([
        booksRepo.all(),
        progressRepo.all(),
        notesRepo.all(),
      ])
      const progressMap: Record<string, ReadingProgress> = {}
      for (const item of progress) progressMap[item.bookId] = item

      const covers: Record<string, string> = {}
      for (const book of nextBooks) {
        const blob = await coversRepo.get(book.id)
        if (blob) {
          const url = URL.createObjectURL(blob)
          covers[book.id] = url
          revoked.push(url)
        }
      }

      setBooks(nextBooks)
      setProgressById(progressMap)
      setCoverUrlById(covers)
      setNotes(nextNotes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
      setReady(true)
    }

    void load()
    return () => {
      for (const url of revoked) URL.revokeObjectURL(url)
    }
  }, [])

  const showHint = useCallback((message: string) => {
    setHint(message)
    window.setTimeout(() => setHint((current) => (current === message ? null : current)), 2400)
  }, [])

  const importPdf = useCallback(
    async (file: File) => {
      setImportError(null)
      setImporting(true)
      try {
        const book = await importPdfFile(file)
        const cover = await coversRepo.get(book.id)
        setBooks((current) => [book, ...current.filter((item) => item.id !== book.id)])
        const progress = await progressRepo.get(book.id)
        if (progress) {
          setProgressById((current) => ({ ...current, [book.id]: progress }))
        }
        if (cover) {
          const url = URL.createObjectURL(cover)
          setCoverUrlById((current) => {
            if (current[book.id]) URL.revokeObjectURL(current[book.id])
            return { ...current, [book.id]: url }
          })
        }
        showHint('Added to your library')
      } catch (error) {
        console.error(error)
        setImportError("Couldn't open that PDF.")
        showHint("Couldn't open that PDF.")
      } finally {
        setImporting(false)
      }
    },
    [showHint],
  )

  const touchBookOpened = useCallback(async (bookId: string) => {
    const book = await booksRepo.get(bookId)
    if (!book) return
    const next = { ...book, lastOpenedAt: nowIso() }
    await booksRepo.put(next)
    setBooks((current) => current.map((item) => (item.id === bookId ? next : item)))
  }, [])

  const openBook = useCallback(
    async (bookId: string) => {
      setActiveBookId(bookId)
      setView('reader')
      await touchBookOpened(bookId)
    },
    [touchBookOpened],
  )

  const closeReader = useCallback((nextView: AppView = 'library') => {
    setActiveBookId(null)
    setView(nextView)
  }, [])

  const refreshProgress = useCallback((progress: ReadingProgress) => {
    setProgressById((current) => ({ ...current, [progress.bookId]: progress }))
  }, [])

  const createNote = useCallback(async () => {
    const stamp = nowIso()
    const note: PersonalNote = {
      id: crypto.randomUUID(),
      title: 'Untitled',
      content: '',
      createdAt: stamp,
      updatedAt: stamp,
    }
    await notesRepo.put(note)
    setNotes((current) => [note, ...current])
    return note
  }, [])

  const saveNote = useCallback(async (note: PersonalNote) => {
    const next = { ...note, updatedAt: nowIso() }
    await notesRepo.put(next)
    setNotes((current) =>
      [next, ...current.filter((item) => item.id !== next.id)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    )
  }, [])

  const deleteNote = useCallback(async (id: string) => {
    await notesRepo.remove(id)
    setNotes((current) => current.filter((item) => item.id !== id))
  }, [])

  const value = useMemo(
    () => ({
      ready,
      view,
      setView,
      books,
      progressById,
      coverUrlById,
      notes,
      searchQuery,
      setSearchQuery,
      hint,
      showHint,
      importError,
      importing,
      importPdf,
      openBook,
      closeReader,
      activeBookId,
      refreshProgress,
      touchBookOpened,
      createNote,
      saveNote,
      deleteNote,
    }),
    [
      ready,
      view,
      books,
      progressById,
      coverUrlById,
      notes,
      searchQuery,
      hint,
      showHint,
      importError,
      importing,
      importPdf,
      openBook,
      closeReader,
      activeBookId,
      refreshProgress,
      touchBookOpened,
      createNote,
      saveNote,
      deleteNote,
    ],
  )

  return <FolioContext.Provider value={value}>{children}</FolioContext.Provider>
}

export function useFolio() {
  const value = useContext(FolioContext)
  if (!value) throw new Error('useFolio must be used within FolioProvider')
  return value
}
