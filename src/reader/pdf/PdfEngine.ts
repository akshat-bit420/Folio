import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
} from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export type PageSize = {
  width: number
  height: number
}

export class PdfEngine {
  private doc: PDFDocumentProxy | null = null
  private loadingTask: PDFDocumentLoadingTask | null = null

  async open(source: Blob | ArrayBuffer): Promise<void> {
    await this.destroy()
    const data =
      source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : new Uint8Array(source)
    this.loadingTask = getDocument({ data })
    this.doc = await this.loadingTask.promise
  }

  get pageCount(): number {
    return this.doc?.numPages ?? 0
  }

  async getTitle(): Promise<string | null> {
    if (!this.doc) return null
    try {
      const meta = await this.doc.getMetadata()
      const info = meta.info as { Title?: string } | undefined
      const title = info?.Title?.trim()
      return title || null
    } catch {
      return null
    }
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    if (!this.doc) throw new Error('PDF is not open')
    const page = await this.doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    return { width: viewport.width, height: viewport.height }
  }

  async renderPage(args: {
    pageNumber: number
    canvas: HTMLCanvasElement
    scale: number
  }): Promise<RenderTask> {
    if (!this.doc) throw new Error('PDF is not open')
    const page = await this.doc.getPage(args.pageNumber)
    const viewport = page.getViewport({ scale: args.scale })
    const outputScale = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = args.canvas
    canvas.width = Math.floor(viewport.width * outputScale)
    canvas.height = Math.floor(viewport.height * outputScale)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas is unavailable')

    const paper =
      getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#f4ecd8'
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    return page.render({
      canvasContext: ctx,
      canvas,
      viewport,
      transform: [outputScale, 0, 0, outputScale, 0, 0],
    })
  }

  async renderTextLayer(args: {
    pageNumber: number
    container: HTMLElement
    scale: number
  }): Promise<TextLayer> {
    if (!this.doc) throw new Error('PDF is not open')
    const page = await this.doc.getPage(args.pageNumber)
    const viewport = page.getViewport({ scale: args.scale })
    const textContent = await page.getTextContent()
    args.container.replaceChildren()
    args.container.style.width = `${Math.floor(viewport.width)}px`
    args.container.style.height = `${Math.floor(viewport.height)}px`
    args.container.style.setProperty('--total-scale-factor', String(args.scale))

    const layer = new TextLayer({
      textContentSource: textContent,
      container: args.container,
      viewport,
    })
    await layer.render()
    return layer
  }

  async renderCoverBlob(): Promise<Blob | null> {
    if (!this.doc) return null
    const canvas = document.createElement('canvas')
    const task = await this.renderPage({ pageNumber: 1, canvas, scale: 0.35 })
    await task.promise
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  async destroy(): Promise<void> {
    if (this.loadingTask) {
      await this.loadingTask.destroy()
      this.loadingTask = null
      this.doc = null
    }
  }
}
