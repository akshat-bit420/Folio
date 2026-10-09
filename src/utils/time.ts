export function nowIso(): string {
  return new Date().toISOString()
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatRelativeOpened(iso: string | null): string {
  if (!iso) return 'Not opened yet'
  const then = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const dayDiff = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000)
  if (dayDiff === 0) return 'Last opened today'
  if (dayDiff === 1) return 'Last opened yesterday'
  if (dayDiff < 7) return `Last opened ${dayDiff} days ago`
  return `Last opened ${formatShortDate(iso)}`
}

export function percentForPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((page / pageCount) * 100)))
}
