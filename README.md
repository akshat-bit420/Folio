# Folio

A self-contained PDF reading app for the browser: import a PDF, read it as a
single page or as a physical two-page book, annotate it, and come back later
exactly where you left off. Everything runs client-side — the library, the
book files, the annotations and the reading progress all live in IndexedDB;
there is no backend and no network round-trip after the page loads.

Built with Vite, React 18, TypeScript and pdf.js 5.4 (worker inlined via
`?worker&inline`, so the production build is a single self-contained bundle).

## Features

- **Library** — import PDFs from disk, covers generated from the file's first
  page, reopen any book.
- **Reader** — one page at a time or **two-page spread mode**: the pages sit
  inside a physical book shell (leather hardcover, stacked sheet edges, spine
  valley, floor shadow), and the lone cover spread reads as a closed book on
  the table.
- **Real page-turn** — prev/next in spread mode lifts a 3D sheet and settles
  it on the other side (~700ms), from the island arrows or the keyboard.
  Single-page mode keeps a small slide cue.
- **Zoom** with cover-first auto-fit in spread mode (a mid-book spread targets
  ~86% of the stage width, capped at 1.35× the height fit; zooming past fit
  scrolls).
- **Outline** panel driven by the PDF's table of contents.
- **Annotations, highlights, bookmarks** anchored to pages through the real
  text layer (selection capture refuses stale layers).
- **Notes** — a personal notes view with plain text cards.
- **Themes** — Kindle (default), Paper and Dark e-ink, applied through
  `data-theme` on `<html>`; the choice, the spread setting and the reading
  position survive a reload.
- **App views** — library / notes / activity / reader (see `AppView` in
  `src/types/models.ts`).

Keyboard: `←`/`→` turn pages; Escape is handled globally (see
`src/hooks/useShortcuts.ts`). Users with `prefers-reduced-motion` get instant
navigation instead of the 3D turn.

## Getting started

```bash
npm install
npm run dev        # vite dev server
npm run build      # tsc -b && vite build  ->  dist/
npm run preview    # serve dist/ on http://localhost:4173
```

Then open the app, import a PDF (or the test file in `test/`), and toggle
**Two-page spread** in the island's Theme & settings panel.

## How it's organized

```
src/
  main.tsx, App.tsx          entry + view routing (library/notes/activity/reader)
  app/FolioContext.tsx       global state: view, books, notes, theme, settings
  pages/LibraryPage.tsx      library grid + PDF import (BookCard.tsx alongside)
  reader/
    ReaderScreen.tsx         reader layout, the book shell, turn orchestration
    ReaderScreen.module.css  book shell, faces, island, settings, outline styling
    PdfViewport.tsx          one page = canvas + text layer + annotation host
    pdf/PdfEngine.ts         pdf.js wrapper: open, renderPage, text layer, outline
    pdf/textLayer.css        text-layer selection styling
    ReaderIsland.tsx         floating control (prev/next, page number, settings)
    ReaderRail.tsx           left icon rail (outline toggle; slots for future panels)
    OutlinePanel.tsx         table-of-contents panel
    OverlayLayer.tsx         per-page markup overlay: highlight + annotation
                             boxes positioned as percentages of the page box,
                             so they survive zoom without recomputation
    AnnotationComposer.tsx   write/edit an annotation
    AnnotationPopover.tsx    popover anchored in the hosting viewport
    readingSequence.ts       flattened list of "positions" (today: PDF pages in
                             order; the seam where personal pages can later be
                             inserted without touching turn/resume/progress)
  storage/repos.ts           IndexedDB repos: books, notes, files, covers,
                             highlights, annotations, bookmarks, progress, meta
  themes/dark.css            Dark e-ink theme
  themes/kindle.css          Kindle theme
  themes/notes.css           notes view styling
  types/models.ts            Book, Annotation, Bookmark, PageSelection, AppView…
  utils/selection.ts         selection capture (page tagging, anchoring)
  hooks/useShortcuts.ts      global keyboard handling
```

## Rendering pipeline

`PdfEngine` wraps pdf.js. `renderPage` is **double-buffered**: the page draws
into an offscreen canvas and is blitted onto the live canvas in a single
operation once the render completes. The live canvas therefore keeps its
previous page's pixels while a render is in flight — a slow render costs a
late content swap, never a flash of blank paper. Turn-commit renders pass
`deferResize` to defer the canvas resize too (stale page at the old size
until the atomic swap); plain page changes and zooms keep the instant resize,
which their own cue masks. The blit is registered before the render promise
resolves, so anything gating on that promise observes the swapped pixels.

Each `PdfViewport` serializes its renders through a queue, cancels
superseded render tasks, mounts the text layer in parallel with the canvas
render, and reports its first successful paint via `onPainted`. Rendering
happens at `min(devicePixelRatio, 2)`.

## The page turn (spread mode)

The turn never rotates the live canvases. It snapshots the two sheets
involved (the live canvas for the front face, a same-pipeline offscreen
render for the landing face), bakes the theme into the pixels at capture
time (`bakeFace` in `ReaderScreen.tsx` — a CSS filter inside the
`preserve-3d` overlay would be dropped by GPU compositors past 90°), and
animates the images in a separate 3D overlay. The mechanics:

1. At the edge-on moment (animation progress ≥ 0.5, rAF +
   `getComputedTiming().progress` — never a wall-clock timeout) the flipper's
   `data-phase` flips to `landing`; the module CSS swaps both faces'
   visibility off that single attribute. Faces carry explicit transforms with
   a 1px `translateZ` depth key so the front-facing face always wins the
   depth test.
2. Mid-turn the real page change commits, which starts the async render of
   the landing pages under the still-near-opaque sheet.
3. The flip animation uses `fill: 'forwards'`, so after 700ms the sheet
   holds its landed pose (the landing image) instead of snapping back to an
   invisible identity pose.
4. The flipper unmounts only when the landing canvases have *actually*
   painted (`onPainted`, real paints only, force-released after 1s; a safety
   net at 1.6s guarantees the turn lock can never stick). The turn start also
   pre-warms the pdf.js cache for the other landing page.
5. The 2D flip-in cue in `PdfViewport` (opacity 0.5→1 on the page container)
   is suppressed during a turn via `suppressFlipCue`; plain page changes keep
   it.

In-flight turns are locked (rapid key presses are swallowed, not queued);
toggling spread or switching books mid-turn cancels the overlay and releases
the lock; if a snapshot render fails, the turn falls back to instant
navigation.

## Verification

Scripts live at the repo root (`../scripts/`), drive the built app on
`http://localhost:4173/` with Playwright, and need `playwright` available
globally.

```bash
npm run build && npm run preview &
node ../scripts/verify_folio.mjs     # 19 end-to-end checks
node ../scripts/repro_blink.mjs dark 12   # turn-end frame burst under CPU throttle
```

The suite covers: open + library, both themes, spread on the lone cover,
forward/backward turns (with two probes that freeze the flip at ~178° and
pixel-compare the sheet against the rendered landing page and its mirror),
zoom past fit, outline, island navigation, reload persistence. The repro
script captures every compositor frame of a turn end (CDP screencast) at a
given CPU throttle — the v3.3 turn-end hardening (fill hold, real-paint gate,
double-buffered swap, suppressed cue) was verified this way at 12× and 25×
throttle in both light and dark themes: zero paper-only frames, zero
half-drawn frames. 
