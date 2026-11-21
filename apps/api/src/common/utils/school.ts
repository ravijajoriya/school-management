import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface SchoolDetails {
  name: string;
  address: string;
  phone: string;
  email: string;
}

/** School name and contact details from the published "site" page (used on printed documents). */
export async function schoolDetails(prisma: PrismaService): Promise<SchoolDetails> {
  const page = await prisma.websitePage.findUnique({ where: { pageKey: 'site' } });
  const c = (page?.publishedContentJson ?? page?.contentJson ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  return {
    name: s('schoolName') || 'School',
    address: s('address'),
    phone: s('phone'),
    email: s('email'),
  };
}

/** "2026-05-14" or a Date → "14 May 2026". */
export function longDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
