import type { StudentListItem } from '@school/shared';
import { Search, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button, Field, Input } from '@/components/ui';
import { useStudents } from '@/features/admin/people-api';
import { useDebouncedValue } from '@/lib/use-debounced-value';

export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={`px-4 py-3 font-medium ${right ? 'text-right' : ''}`}>{children}</th>
);

export const Td = ({
  children,
  right,
  className = '',
}: {
  children?: ReactNode;
  right?: boolean;
  className?: string;
}) => (
  <td className={`px-4 py-3 align-top ${right ? 'text-right' : ''} ${className}`}>{children}</td>
);

/** Search by name, admission number or parent phone; shows the current class. */
export function StudentFinder({
  id,
  label = 'Student',
  value,
  onChange,
  error,
  includeLeft = false,
}: {
  id: string;
  label?: string;
  value: StudentListItem | null;
  onChange: (s: StudentListItem | null) => void;
  error?: string;
  /** Also list students who have left (for TCs and character certificates). */
  includeLeft?: boolean;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const results = useStudents({
    search: debounced,
    pageSize: 8,
    ...(includeLeft ? {} : { status: 'ACTIVE' }),
  });
  if (value)
    return (
      <Field label={label} htmlFor={id} error={error}>
        <div className="flex items-center justify-between gap-3 rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm">
          <div>
            <div className="font-medium text-ink">{value.fullName}</div>
            <div className="text-xs text-ink-muted">
              {value.admissionNumber}
              {value.enrolment &&
                ` · ${value.enrolment.className} – ${value.enrolment.sectionName}`}
            </div>
          </div>
          <Button
            id={id}
            size="sm"
            variant="ghost"
            onClick={() => onChange(null)}
            aria-label="Change student"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </Field>
    );
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted"
          aria-hidden="true"
        />
        <Input
          id={id}
          type="search"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, admission number or parent phone"
        />
      </div>
      {debounced && (
        <ul className="mt-2 max-h-56 divide-y divide-gray-100 overflow-auto rounded-md border border-gray-200">
          {results.data?.items.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">No students found</li>
          )}
          {results.data?.items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
                onClick={() => {
                  onChange(s);
                  setSearch('');
                }}
              >
                <span className="font-medium text-ink">{s.fullName}</span>
                <span className="text-xs text-ink-muted">
                  {s.admissionNumber}
                  {s.enrolment && ` · ${s.enrolment.className} – ${s.enrolment.sectionName}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
