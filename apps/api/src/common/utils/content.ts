import type { Paginated } from '@school/shared';
import { randomBytes } from 'node:crypto';

/** School time zone: used for "today", date filters and reference-number years. */
export const SCHOOL_TIME_ZONE = 'Asia/Kolkata';

/** "Annual Sports Day 2026!" → "annual-sports-day-2026" */
export function slugify(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 180) || 'item'
  );
}

/** Returns a slug that `isTaken` reports as free, adding a short random suffix if needed. */
export async function uniqueSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(title);
  if (!(await isTaken(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomBytes(3).toString('hex')}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('Could not generate a unique slug');
}

/** True when a published item is inside its visibility window at `now`. */
export function isWithinWindow(
  publishAt: Date | null,
  expiresAt: Date | null,
  now = new Date(),
): boolean {
  return (!publishAt || publishAt <= now) && (!expiresAt || expiresAt > now);
}

export function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

/** YYYY-MM-DD for `date` in the school's time zone. */
export function schoolDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIME_ZONE }).format(date);
}

/** Start of a school-local calendar day (YYYY-MM-DD) as an absolute instant. */
export function startOfSchoolDay(day: string): Date {
  return new Date(`${day}T00:00:00+05:30`);
}

/** Inclusive [from, to] school-local dates → { gte, lt } instants for a Prisma filter. */
export function dayRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    gte: from ? startOfSchoolDay(from) : undefined,
    lt: to ? new Date(startOfSchoolDay(to).getTime() + 86_400_000) : undefined,
  };
}

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Deterministic JSON (sorted keys) for comparing content versions. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Collects every `imageId` value inside structured page content. */
export function collectImageIds(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectImageIds(v, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'imageId' && typeof v === 'string') found.add(v);
      else collectImageIds(v, found);
    }
  }
  return found;
}
