/** All dates are shown in the school's time zone, whatever the viewer's device setting. */
export const SCHOOL_TIME_ZONE = 'Asia/Kolkata';

const dateTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: SCHOOL_TIME_ZONE,
});
const dateOnly = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: SCHOOL_TIME_ZONE,
});
const longDate = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: SCHOOL_TIME_ZONE,
});
const timeOnly = new Intl.DateTimeFormat('en-IN', {
  timeStyle: 'short',
  timeZone: SCHOOL_TIME_ZONE,
});
const dayNumber = new Intl.DateTimeFormat('en-IN', { day: '2-digit', timeZone: SCHOOL_TIME_ZONE });
const monthShort = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: SCHOOL_TIME_ZONE });

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '—';
export const formatDate = (iso: string | null | undefined) =>
  iso ? dateOnly.format(new Date(iso)) : '—';
export const formatLongDate = (iso: string) => longDate.format(new Date(iso));
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));
/** { day: '26', month: 'Jan' } for calendar-style date badges. */
export const dateBadge = (iso: string) => ({
  day: dayNumber.format(new Date(iso)),
  month: monthShort.format(new Date(iso)),
});

/** Today's date in the school's time zone as YYYY-MM-DD (for <input type="date"> defaults). */
export const todayIso = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: SCHOOL_TIME_ZONE });

/** ISO instant → value for <input type="datetime-local"> in the viewer's local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO instant (or null when empty). */
export const fromLocalInput = (value: string): string | null =>
  value ? new Date(value).toISOString() : null;

export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export const USER_STATUS_LABEL = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  LOCKED: 'Locked',
} as const;
export const USER_STATUS_TONE = { ACTIVE: 'green', INACTIVE: 'gray', LOCKED: 'red' } as const;
