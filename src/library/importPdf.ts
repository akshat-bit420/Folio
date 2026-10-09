import { PdfEngine } from '../reader/pdf/PdfEngine'
import { booksRepo, coversRepo, filesRepo, progressRepo } from '../storage/repos'
import type { Book } from '../types/models'
import { nowIso, percentForPage } from '../utils/time'

export async function importPdfFile(file: File): Promise<Book> {
  const pdfBlob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' })
  const engine = new PdfEngine()

  try {
    await engine.open(pdfBlob)
    const pageCount = engine.pageCount
    if (pageCount < 1) throw new Error('This PDF has no pages')

    const metaTitle = await engine.getTitle()
    const title = metaTitle || file.name.replace(/\.pdf$/i, '')
    const cover = await engine.renderCoverBlob()

    const book: Book = {
      id: crypto.randomUUID(),
      title,
      fileName: file.name,
      pageCount,
      importedAt: nowIso(),
      lastOpenedAt: null,
    }

    await booksRepo.put(book)
    await filesRepo.put(book.id, pdfBlob)
    if (cover) await coversRepo.put(book.id, cover)
    await progressRepo.put({
      bookId: book.id,
      lastPdfPage: 1,
      sequenceIndex: 0,
      percent: percentForPage(1, pageCount),
      updatedAt: nowIso(),
    })

    return book
  } finally {
    await engine.destroy()
  }
}
