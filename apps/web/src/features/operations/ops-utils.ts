import { useState } from 'react';
import { splitFieldErrors } from '@/lib/api-client';

export const theadClass = 'bg-surface text-left text-xs uppercase tracking-wide text-ink-muted';
export const tbodyClass = 'divide-y divide-gray-100';

/** "2026-11" → "November 2026". */
export const monthName = (month: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

/** Field errors + a general error from an API failure, with a reset. */
export function useFormErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  return {
    fields,
    general,
    reset: () => {
      setFields({});
      setGeneral(null);
    },
    capture: (e: unknown) => {
      const r = splitFieldErrors(e);
      setFields(r.fields);
      setGeneral(r.general[0] ?? (Object.keys(r.fields).length ? null : 'Something went wrong'));
    },
  };
}
