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
- [ ] **Dark Kindle Theme:** Pitch-dark e-ink background with customizable reader text tints (Amber, Sage, Warm Ivory) for night study sessions
- [ ] Floating quick-action selection menu
- [ ] Margin progress pips for quick-jumping to bookmarked/annotated pages

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
