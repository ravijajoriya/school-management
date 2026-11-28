import type { LeaveRequestItem } from '@school/shared';
import { formatDate } from '@/lib/format';

/** "12 Dec 2026" or "12 Dec 2026 – 14 Dec 2026". */
export const leaveDates = (l: Pick<LeaveRequestItem, 'startDate' | 'endDate'>) =>
  l.startDate === l.endDate
    ? formatDate(l.startDate)
    : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`;

/** Compact range for cards: "9 – 13 Dec 2026", "30 Nov – 1 Dec 2026", or full dates across years. */
export function shortLeaveDates(l: Pick<LeaveRequestItem, 'startDate' | 'endDate'>): string {
  if (l.startDate === l.endDate) return formatDate(l.startDate);
  const [sy, sm] = l.startDate.split('-');
  const [ey, em] = l.endDate.split('-');
  if (sy !== ey) return leaveDates(l);
  const end = formatDate(l.endDate);
  const start = formatDate(l.startDate).replace(` ${sy}`, '');
  return `${sm === em ? start.split(' ')[0] : start} – ${end}`;
}
