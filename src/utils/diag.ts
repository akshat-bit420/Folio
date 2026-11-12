/**
 * Rolling diagnostic log for the reader pipeline.
 *
 * If highlight/annotate ever silently fail again, open the browser console
 * and run `__folioDiag()` — it returns the last 40 pipeline events
 * (renders, text-layer mounts, capture decisions). Paste that output into
 * a bug report; each entry says exactly why a capture was dropped.
 */
export type DiagEntry = { t: number; event: string; detail?: string }

const log: DiagEntry[] = []

export function diag(event: string, detail?: string): void {
  log.push({ t: Math.round(performance.now()), event, detail })
  if (log.length > 40) log.shift()
}

declare global {
  interface Window {
    __folioDiag?: () => DiagEntry[]
  }
}

if (typeof window !== 'undefined') {
  window.__folioDiag = () => [...log]
} 