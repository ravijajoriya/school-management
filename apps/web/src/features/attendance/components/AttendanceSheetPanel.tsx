import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_SHORT,
  ATTENDANCE_STATUSES,
  type AttendanceSheet,
  type AttendanceStatus,
} from '@school/shared';
import { History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageSpinner } from '@/components/ui';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDateTime, formatLongDate } from '@/lib/format';
import { useAttendanceSheet, useMarkAttendance } from '../attendance-api';

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'peer-checked:bg-green-600 peer-checked:text-white peer-checked:border-green-600',
  ABSENT: 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:border-red-600',
  LATE: 'peer-checked:bg-amber-500 peer-checked:text-white peer-checked:border-amber-500',
};

/** Loads the sheet for a section and date and shows the editor (or a read-only view). */
export function AttendanceSheetPanel({ sectionId, date }: { sectionId: string; date: string }) {
  const sheet = useAttendanceSheet(sectionId, date);
  const [saved, setSaved] = useState<string | null>(null);
  if (sheet.isLoading) return <PageSpinner />;
  if (sheet.isError || !sheet.data) return <Alert>{errorMessages(sheet.error)[0]}</Alert>;
  return (
    <>
      {saved && (
        <div className="mb-4">
          <Alert tone="success">{saved}</Alert>
        </div>
      )}
      {/* Remount on every refetch so the draft always starts from what is saved. */}
      <SheetEditor key={sheet.dataUpdatedAt} sheet={sheet.data} onSaved={setSaved} />
    </>
  );
}

type Draft = Record<string, { status: AttendanceStatus | null; remarks: string }>;

function SheetEditor({ sheet, onSaved }: { sheet: AttendanceSheet; onSaved: (m: string) => void }) {
  const mark = useMarkAttendance();
  const editable = sheet.canEdit;
  // Unmarked students start as Present on an editable sheet: the teacher only taps the exceptions.
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      sheet.rows.map((r) => [
        r.enrolmentId,
        { status: r.status ?? (editable ? 'PRESENT' : null), remarks: r.remarks ?? '' },
      ]),
    ),
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>();

  const changes = useMemo(
    () =>
      sheet.rows.filter((r) => {
        const d = draft[r.enrolmentId];
        return (
          d.status && (d.status !== r.status || (d.remarks.trim() || null) !== (r.remarks ?? null))
        );
      }),
    [draft, sheet.rows],
  );
  const counts = ATTENDANCE_STATUSES.map(
    (s) => [s, Object.values(draft).filter((d) => d.status === s).length] as const,
  );
  const neverMarked = sheet.summary.marked === 0;

  const set = (id: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async () => {
    setError(null);
    setReasonError(undefined);
    try {
      const res = await mark.mutateAsync({
        sectionId: sheet.section.id,
        date: sheet.date,
        entries: changes.map((r) => ({
          enrolmentId: r.enrolmentId,
          status: draft[r.enrolmentId].status!,
          remarks: draft[r.enrolmentId].remarks.trim() || undefined,
        })),
        correctionReason: sheet.requiresReason ? reason : undefined,
      });
      onSaved(
        [res.created && `${res.created} marked`, res.updated && `${res.updated} changed`]
          .filter(Boolean)
          .join(', ') +
          ` — ${sheet.section.className} ${sheet.section.sectionName}, ${formatLongDate(sheet.date)}.`,
      );
    } catch (e) {
      const { fields, general } = splitFieldErrors(e);
      setReasonError(fields.correctionReason);
      setError(
        general[0] ?? fields.entries ?? (fields.correctionReason ? null : errorMessages(e)[0]),
      );
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="font-semibold text-brand-navy">
            {sheet.section.className} – {sheet.section.sectionName}
            <span className="font-normal text-ink-muted"> · {formatLongDate(sheet.date)}</span>
          </h2>
          <p className="text-xs text-ink-muted">
            Class teacher: {sheet.section.classTeacher?.fullName ?? 'not assigned'} ·{' '}
            {neverMarked ? (
              <Badge tone="amber">Not marked yet</Badge>
            ) : (
              <Badge tone={sheet.summary.marked === sheet.summary.total ? 'green' : 'amber'}>
                Marked {sheet.summary.marked}/{sheet.summary.total}
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          {counts.map(([s, n]) => (
            <span key={s} className="rounded-md bg-surface px-2 py-1">
              {ATTENDANCE_STATUS_LABELS[s]}: <strong>{n}</strong>
            </span>
          ))}
          {editable && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setDraft((d) =>
                  Object.fromEntries(
                    Object.entries(d).map(([k, v]) => [k, { ...v, status: 'PRESENT' }]),
                  ),
                )
              }
            >
              Mark all present
            </Button>
          )}
        </div>
      </div>

      {sheet.lockedReason && (
        <div className="p-4 pb-0">
          <Alert tone="info">{sheet.lockedReason}</Alert>
        </div>
      )}
      {editable && neverMarked && (
        <p className="px-4 pt-3 text-xs text-ink-muted">
          Everyone starts as Present — choose A or L for students who are absent or late, then
          submit.
        </p>
      )}

      {sheet.rows.length === 0 ? (
        <EmptyState title="No students in this section on this date" />
      ) : (
        <div className="overflow-x-auto">
          <table data-pin-second className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Roll</th>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Attendance</th>
                <th className="px-4 py-2 font-medium">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sheet.rows.map((r) => {
                const d = draft[r.enrolmentId];
                return (
                  <tr key={r.enrolmentId} aria-label={r.fullName}>
                    <td className="px-4 py-2 text-ink-muted">{r.rollNumber ?? '—'}</td>
                    <td className="px-4 py-2">
                      <span className="font-medium text-ink">{r.fullName}</span>
                      {(r.updatedBy || r.markedBy) && (
                        <p className="flex items-center gap-1 text-xs text-ink-muted">
                          <History className="h-3 w-3" aria-hidden="true" />
                          {r.updatedBy
                            ? `Changed by ${r.updatedBy}, ${formatDateTime(r.updatedAt)}`
                            : `Marked by ${r.markedBy}, ${formatDateTime(r.markedAt)}`}
                          {r.correctionReason && ` — “${r.correctionReason}”`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div
                        role="radiogroup"
                        aria-label={`Attendance for ${r.fullName}`}
                        className="flex gap-1"
                      >
                        {ATTENDANCE_STATUSES.map((s) => (
                          <label key={s} className="relative cursor-pointer">
                            <input
                              type="radio"
                              className="peer sr-only"
                              name={`att-${r.enrolmentId}`}
                              value={s}
                              checked={d.status === s}
                              disabled={!editable}
                              onChange={() => set(r.enrolmentId, { status: s })}
                              aria-label={ATTENDANCE_STATUS_LABELS[s]}
                            />
                            <span
                              className={`inline-flex h-8 w-9 items-center justify-center rounded-md border border-gray-300 text-xs font-semibold text-ink-muted peer-focus-visible:ring-2 peer-focus-visible:ring-brand-gold peer-disabled:cursor-default ${STATUS_STYLE[s]}`}
                              aria-hidden="true"
                            >
                              {ATTENDANCE_STATUS_SHORT[s]}
                            </span>
                          </label>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {editable ? (
                        <Input
                          value={d.remarks}
                          onChange={(e) => set(r.enrolmentId, { remarks: e.target.value })}
                          aria-label={`Remarks for ${r.fullName}`}
                          placeholder="Optional"
                          maxLength={255}
                          className="max-w-[220px]"
                        />
                      ) : (
                        <span className="text-ink-muted">{r.remarks ?? ''}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editable && sheet.rows.length > 0 && (
        <div className="space-y-3 border-t border-gray-200 p-4">
          {error && <Alert>{error}</Alert>}
          {sheet.requiresReason && (
            <Field
              label="Reason for changing past attendance"
              htmlFor="att-reason"
              error={reasonError}
              hint="Saved with the change and in the audit log."
              required
            >
              <Input
                id="att-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Class teacher was on leave; entered from the paper register"
              />
            </Field>
          )}
          <div className="flex items-center justify-end gap-3">
            <span className="text-sm text-ink-muted">
              {changes.length ? `${changes.length} to save` : 'No unsaved changes'}
            </span>
            <Button onClick={save} loading={mark.isPending} disabled={!changes.length}>
              {neverMarked ? 'Submit attendance' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
