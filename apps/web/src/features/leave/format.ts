import type { LeaveRequestItem } from '@school/shared';
import { formatDate } from '@/lib/format';

/** "12 Dec 2026" or "12 Dec 2026 – 14 Dec 2026". */
export const leaveDates = (l: Pick<LeaveRequestItem, 'startDate' | 'endDate'>) =>
  l.startDate === l.endDate
    ? formatDate(l.startDate)
    : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`;
