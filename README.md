# Folio

A local-first, Kindle-inspired PDF reader built with React, TypeScript, and Vite.

Folio is a personal project exploring a minimal, distraction-free reading environment for technical textbooks and long-form PDFs. Instead of bloated cloud sync or account walls, Folio focuses on tactile visual comfort and complete offline ownership.

## Core Philosophy: 100% Offline & Zero Auth

No sign-ups, no Gmail logins, no cloud telemetry. It is just you and your PDFs:
- **Local-First Storage:** Your books, reading progress, bookmarks, highlights, and notes are stored directly inside your browser via **IndexedDB**.
- **Works Offline:** Once your PDFs are imported, everything runs locally on your machine with zero network dependency.

## Features (Current & In Progress)

- **Kindle E-Ink Visual Engine:** Converts colorful, high-glare PDFs into a warm, matte monochrome e-ink display while preserving deep charcoal ink contrast.
- **Tactile Markup & Notes:**
  - **Honey-Gold Highlights:** Uses multiplicative blending so underlying PDF text stays sharp and pitch-black rather than washed out.
  - **Editorial Annotations:** Multi-line dashed underlines with inline note popovers and smart line-merging for complex math/equation spans.
  - **Bookmarks & Progress Tracking:** Automatically remembers your exact page and reading percentage across sessions.
- **High-Zoom Study Mode:** Crisp canvas rendering and synchronized text selection scaling up to **300% zoom** for dense equations and diagrams.
- **Idle-Hide Chrome:** The toolbar automatically fades out while you read and reappears on mouse movement.

## Roadmap

- [x] Kindle Paperwhite Theme (Warm e-ink monochrome filter + multiplicative highlights)
- [x] Local IndexedDB persistence for books, highlights, annotations, and bookmarks
- [x] High-zoom (300%) math & multi-span selection stability
- [x] **Reliable markup at any page depth:** highlights & annotations no longer break past page ~50-60 (render-pipeline race fixes, November 2026 — see the Fix Log below)
- [ ] **Dark Kindle Theme:** Pitch-dark e-ink background with customizable reader text tints (Amber, Sage, Warm Ivory) for night study sessions
- [ ] Floating quick-action selection menu
- [ ] Margin progress pips for quick-jumping to bookmarked/annotated pages

## Fix Log — Highlights & Annotations on Deep Pages (November 2026)

This is exactly the class of bug the "Why I'm Building This" section below anticipated: a `pdf.js` canvas lifecycle race that only shows up at scale. Documented here so the reasoning survives longer than the commit messages.

### The symptom

Armed Highlight or Annotate, then dragged to select text. On pages 1-20 both worked. From roughly page 50-60 upward (page 100, page 400...), both silently did nothing — no highlight, no composer, no console error. The boundary moved a little from session to session, which was the first hint that it was a timing problem, not a logic problem.

### The root cause

The markup logic itself was never broken. Three compounding issues in the page-render pipeline starved it of the thing it depends on — the invisible text layer (the transparent spans you drag over):

1. **Sequential pipeline.** The text layer was mounted strictly *after* the canvas finished rasterizing the page image. Early pages paint in milliseconds, so the window where "the page looks ready but has no selectable text" was imperceptible. Deep pages take far longer to paint, so that window stretched into seconds. Selecting inside it produced an empty or stale browser selection, `capturePageSelection()` returned `null`, and `onSelection(null)` did nothing. There was no page-number check anywhere in the code — the ~50-60 boundary was emergent: it's where render latency crosses "faster than a human can click a button and drag".

2. **Unserialized render lifecycle.** The effect cleanup called `renderTask?.cancel()`, but `renderTask` was only assigned after `renderPage()` resolved — which itself awaits `pdf.getPage()` first, slower the deeper you go. Changing pages during that await cancelled nothing; the old render kept going and overlapped with the new page's render on the same canvas. pdf.js throws *"Cannot use the same canvas during multiple render() operations"*, the run aborted, and — because a text mount failure had no retry — the page stayed permanently text-less until another render succeeded. React StrictMode's dev double-mount widened the same window.

3. **Blind capture.** The capture trusted whatever spans happened to be in the DOM, so it could anchor a highlight to the *previous* page's text mid-transition, a mid-drag wipe could destroy the selection being made, and a leftover hidden selection could instantly "consume" the next click on the Highlight button (saving garbage and disarming the tool, so the following drag did nothing). Every failure path was silent.

### What changed, file by file

| File | Change |
| --- | --- |
| `src/reader/PdfViewport.tsx` | Core fix: text layer and canvas render in parallel; renders serialized through a promise queue with a sequence counter; tasks stored in refs and cancelled the moment they exist; text-layer wipe waits for an active drag; one retry on text-mount failure; `.endOfContent` marker + `.selecting` class restored (pdf.js #19526 / #22259); mouseup capture filtered to the page target; pointer path tracked per drag |
| `src/reader/pdf/PdfEngine.ts` | `renderTextLayer()` awaits `getTextContent()` before touching the container, tags it with `dataset.page` / `dataset.items`, and returns the real item count |
| `src/utils/selection.ts` | `getTextLayerState()` classifies the layer as ready/stale/empty/missing and capture refuses anything but "ready"; drag reconstruction from the pointer path (caret at start/end, clamped to the nearest text row); row-tolerance rect filter; dead commented-out predecessor removed |
| `src/reader/ReaderScreen.tsx` | "Page text is still loading" hint when a tool is armed and a capture comes back null; stored selection only reused when the browser still holds a live, non-empty selection |
| `src/utils/diag.ts` (new) | Rolling 40-entry diagnostic ring buffer, exposed as `window.__folioDiag()` |
| `src/app/FolioContext.tsx` | Reader hints also written to the diagnostic log |
| `src/themes/kindle.css` | Highlight wash 0.36 → 0.48, annotation wash 0.22 → 0.28 (visual only) |

### Why this matters in the long run

- **A correctness invariant instead of luck.** A highlight can now only anchor to text that provably belongs to the page on screen (`dataset.page` guard). Saved markup is the user's most valuable data in a reading app; this bug class would have silently corrupted or dropped it more often as the library and page counts grew. It is now structurally impossible, not rare.
- **The render lifecycle is now infrastructure.** Serialized, cancellable page renders are a prerequisite for everything on the roadmap — the floating quick-action menu, thumbnails, dual-page or virtualized page windows, full-text search. Each of those needs to cancel stale renders and must never let two renders interleave. That bug class (pdf.js canvas lifecycle locks) is now handled once, in one place, instead of being rediscovered per feature.
- **No silent failures.** Every refusal has a recorded reason and, where the user is affected, a visible hint. In a project that is deliberately used as a training ground for orchestrating AI coding agents across a multi-file codebase, fast unambiguous feedback loops are what keep generated code debuggable — "it didn't work" is now a diagnosable event, not a vibe.
- **Perceived performance.** Selectable text is ready roughly 100× sooner on deep pages (~20 ms measured on page 400 of a 734-page book, versus "after the entire image finishes" before) — a difference that grows on slower machines and bigger books.
- **Post-mortem debugging.** `__folioDiag()` turns any future "highlight is broken" report into a 40-event trace where each dropped capture says exactly why.

### How it's tested

- Synthetic 150-page PDF plus a realistic 734-page book with embedded fonts and justified paragraphs.
- Pages 1, 5, 60, 100, 120, 150, 200, 230, 300, 400: highlight saves and renders; annotate opens the composer and saves.
- Fast page-flipping 30× then selecting: no garbage highlights, no stuck states.
- High-DPI (3×) and small-window (fit-to-width) configurations.
- Toolbar clicks no longer trigger captures from stale selections.

### If markup ever fails again

1. Reproduce the failure, press `F12`, open the Console tab.
2. Type `__folioDiag()` and press Enter.
3. Paste the 40-entry output into the bug report. Each entry names the pipeline step and the reason a capture was accepted or dropped (e.g. `capture-skip layerState=stale` = the text layer still belonged to the previous page).

## Why I'm Building This

Folio is also a learning ground before my next major project: a **TUI (Terminal User Interface) application written in Go**.

I'm using this project to get comfortable orchestrating AI coding agents across a multi-file codebase—learning how to review diffs, debug race conditions (like `pdf.js` canvas lifecycle locks and DOM stacking contexts), and maintain architecture rather than blindly accepting generated code. The goal isn't just to ship an app, but to understand its internals and carry those engineering habits into Go.

## Tech Stack

- **Frontend:** React, TypeScript, Vite
- **PDF Pipeline:** `pdfjs-dist` (Canvas + synchronized TextLayer)
- **Styling:** CSS Modules & Custom Theme Tokens
- **Storage:** IndexedDB (100% client-side persistence)

## Running Locally

```bash
npm install
npm run dev
```
