import { CERTIFICATE_PLACEHOLDERS } from '@school/shared';

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Placeholder names used in a template, e.g. ["student_name", "class_name"]. */
export function placeholdersIn(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** Names a template uses that the system does not know. */
export function unknownPlaceholders(template: string): string[] {
  return placeholdersIn(template).filter((p) => !(p in CERTIFICATE_PLACEHOLDERS));
}

/**
 * Fills a plain-text template and splits it into paragraphs (blank-line separated). Missing values
 * print as "—". The first letter of every sentence is capitalised, so "{{gender_pronoun}} was…"
 * at the start of a sentence prints "She was…". The output is text, never HTML.
 */
export function renderCertificate(
  template: string,
  values: Record<string, string | null | undefined>,
): string[] {
  const filled = template.replace(PLACEHOLDER, (_, name: string) => values[name]?.trim() || '—');
  return filled
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((p) =>
      p.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase()),
    );
}

/** he/she/they and his/her/their from the stored gender. */
export function pronouns(gender: string | null): {
  subject: string;
  possessive: string;
  child: string;
} {
  if (gender === 'MALE') return { subject: 'he', possessive: 'his', child: 'son' };
  if (gender === 'FEMALE') return { subject: 'she', possessive: 'her', child: 'daughter' };
  return { subject: 'they', possessive: 'their', child: 'child' };
}
