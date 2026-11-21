import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Money is stored as NUMERIC(12,2) and handled in code as integer paise, so sums never suffer
 * from floating-point rounding. Convert at the edges only.
 */
export type Paise = number;

/** Decimal / string / rupee number → integer paise. */
export function toPaise(value: Prisma.Decimal | string | number | null | undefined): Paise {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value.toString()) * 100);
}

/** Integer paise → "1234.50" for writing to a NUMERIC column. */
export function paiseToDb(paise: Paise): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Integer paise → rupees for API responses. */
export const rupees = (paise: Paise) => paise / 100;

export const sumPaise = (values: Paise[]) => values.reduce((a, b) => a + b, 0);
