import type { Paise } from '../../common/utils/money.js';

/** "2026-11" → first and last day of that month ("2026-11-01", "2026-11-30"). */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

/** "2026-11-01" → "November 2026". */
export function monthLabel(periodStart: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${periodStart}T00:00:00Z`));
}

/** The single pay rule: net = earnings − deductions (all entered amounts, nothing calculated). */
export function payTotals(lines: { componentType: string; amount: Paise }[]) {
  let gross = 0;
  let deductions = 0;
  for (const l of lines) {
    if (l.componentType === 'EARNING') gross += l.amount;
    else deductions += l.amount;
  }
  return { gross, deductions, net: gross - deductions };
}
