# Folio

A local-first, Kindle-inspired PDF reader built with React, TypeScript, and Vite.

Folio is a personal project exploring a minimal, distraction-free reading environment for technical textbooks and long-form PDFs. Instead of bloated cloud sync or account walls, Folio focuses on tactile visual comfort and complete offline ownership.

## Core Philosophy: 100% Offline & Zero Auth

No sign-ups, no Gmail logins, no cloud telemetry. It is just you and your PDFs:
- **Local-First Storage:** Your books, reading progress, bookmarks, highlights, and notes are stored directly inside your browser via **IndexedDB**.
- **Works Offline:** Once your PDFs are imported, everything runs locally on your machine with zero network dependency.

## Features

### Reading Themes
- **Kindle Paperwhite Theme:** Converts colorful, high-glare PDFs into a warm, matte monochrome e-ink display while preserving deep charcoal ink contrast.
- **Dark E-Ink Theme:** A pitch-dark night-study mode with warm charcoal surfaces and cream text; the theme choice persists across sessions.

### Tactile Markup & Notes
- **Honey-Gold Highlights:** Uses multiplicative blending so underlying PDF text stays sharp and pitch-black rather than washed out.
- **Editorial Annotations:** Multi-line dashed underlines with inline note popovers and smart line-merging for complex math/equation spans.
- **Floating Selection Menu:** Selecting text raises a quick-action popover — highlight or annotate in one click, no toolbar hunting.

### Reading Progression & Resume
- **Persistent Progress:** Folio remembers your exact page and reading percentage for every book, across sessions.
- **Continue-Reading Card:** The library surfaces the book you were last reading with its `Page X of Y · N%` status, so picking up where you left off is one click.
- **Bookmarks:** Bookmark any page and toggle it off just as easily; the island reflects the current page's bookmark state.
- **Jump-to-Page:** Type a page number straight into the reader and land there, clamped to the book's real page count.

### The Island (Reader Chrome)
The old auto-hiding toolbar is gone. Reader chrome is now a single **fixed island at the top center of the viewport** that never slides away with the page:
- **Idle:** a compact pill showing the book title, page total, and a progress track.
- **On hover, focus, or tap:** it morphs open into the full control row — prev/next, bookmark, highlight, annotate, notes, theme & settings, zoom, fullscreen, and the page input.
- **No slamming shut:** after the pointer leaves, the island waits a 1-second grace window, then folds closed with a slow 460ms ease (opening is quicker, 340ms) so it settles rather than snaps. Re-entering during the grace cancels the fold, and clicking anything inside pins it open.
- **Keyboard friendly:** focus keeps it open, and every control carries an accessible label.

### High-Zoom Study Mode
Crisp canvas rendering and synchronized text selection scaling up to **300% zoom** for dense equations and diagrams.

## Roadmap

- [x] Kindle Paperwhite Theme (Warm e-ink monochrome filter + multiplicative highlights)
- [x] Dark E-Ink Theme (pitch-dark night-study surfaces, persisted theme choice)
- [x] Local IndexedDB persistence for books, highlights, annotations, and bookmarks
- [x] High-zoom (300%) math & multi-span selection stability
- [x] Floating quick-action selection menu (highlight / annotate popover)
- [x] Reader island chrome: fixed morphing island replacing the scrolling toolbar

### Reading progression
- [x] Persistent reading progress with continue-reading resume card (percent + last page)
- [x] Progress track and percentage in the island, with jump-to-page input
- [x] Per-page bookmarks with one-click toggle
- [ ] Margin progress pips for quick-jumping to bookmarked/annotated pages
- [ ] Reader text tints for the dark theme (Amber, Sage, Warm Ivory) for night study sessions

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
