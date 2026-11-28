export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/** "2026-04-12" → "Apr 2026". */
export const admittedLabel = (day: string | null) =>
  day
    ? new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${day}T00:00:00Z`),
      )
    : '—';
