import { MARK_STATUS_LABELS, type MarkStatus, type MarksSheet } from '@school/shared';
import { useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Input, PageSpinner } from '@/components/ui';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { useMarksActions, useMarksSheet } from '../exams-api';

const TONE: Record<MarkStatus, 'gray' | 'amber' | 'green' | 'navy'> = {
  DRAFT: 'gray',
  SUBMITTED: 'amber',
  APPROVED: 'green',
  FINAL: 'navy',
};

/** Marks for one exam subject/component and one section: enter, save, submit, approve/return. */
export function MarksSheetPanel({
  examSubjectId,
  sectionId,
}: {
  examSubjectId: string;
  sectionId: string;
}) {
  const sheet = useMarksSheet(examSubjectId, sectionId);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (sheet.isLoading) return <PageSpinner />;
  if (sheet.isError || !sheet.data) return <Alert>{errorMessages(sheet.error)[0]}</Alert>;
  return (
    <>
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      <SheetEditor key={sheet.dataUpdatedAt} sheet={sheet.data} onMessage={setMessage} />
    </>
  );
}

type Draft = Record<string, { marks: string; isAbsent: boolean; remarks: string }>;

function SheetEditor({
  sheet,
  onMessage,
}: {
  sheet: MarksSheet;
  onMessage: (m: { tone: 'success' | 'error'; text: string } | null) => void;
}) {
  const { save, submit, review } = useMarksActions();
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      sheet.rows.map((r) => [
        r.enrolmentId,
        {
          marks: r.marks === null ? '' : String(r.marks),
          isAbsent: r.isAbsent,
          remarks: r.remarks ?? '',
        },
      ]),
    ),
  );
  const max = sheet.subject.maxMarks;
  const editableRow = (status: MarkStatus | null) =>
    sheet.canEdit && (status === null || status === 'DRAFT');
  const changes = sheet.rows.filter((r) => {
    if (!editableRow(r.status)) return false;
    const d = draft[r.enrolmentId];
    const marks = d.isAbsent || d.marks === '' ? null : Number(d.marks);
    return (
      marks !== r.marks ||
      d.isAbsent !== r.isAbsent ||
      (d.remarks.trim() || null) !== (r.remarks ?? null)
    );
  });
  const invalid = sheet.rows.some((r) => {
    const d = draft[r.enrolmentId];
    if (d.isAbsent || d.marks === '') return false;
    const n = Number(d.marks);
    return Number.isNaN(n) || n < 0 || n > max;
  });
  const set = (id: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const ids = { examSubjectId: sheet.subject.id, sectionId: sheet.section.id };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    onMessage(null);
    try {
      await fn();
      onMessage({ tone: 'success', text: ok });
    } catch (e) {
      const { fields, general } = splitFieldErrors(e);
      onMessage({
        tone: 'error',
        text: general[0] ?? Object.values(fields)[0] ?? errorMessages(e)[0],
      });
    }
  };
  const onSave = () =>
    run(
      () =>
        save.mutateAsync({
          ...ids,
          entries: changes.map((r) => {
            const d = draft[r.enrolmentId];
            return {
              enrolmentId: r.enrolmentId,
              marks: d.isAbsent || d.marks === '' ? null : Number(d.marks),
              isAbsent: d.isAbsent,
              remarks: d.remarks.trim() || undefined,
            };
          }),
        }),
      `Saved marks for ${changes.length} student(s).`,
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="font-semibold text-brand-navy">
            {sheet.subject.label} · {sheet.section.className} – {sheet.section.sectionName}
          </h2>
          <p className="text-xs text-ink-muted">
            {sheet.exam.name} · out of {max} · pass {sheet.subject.passMarks}
            {sheet.subject.subjectType === 'OPTIONAL' &&
              ' · optional subject — leave blank for students who did not take it'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-surface px-2 py-1">
            Not entered {sheet.summary.notEntered}
          </span>
          <span className="rounded bg-surface px-2 py-1">Draft {sheet.summary.draft}</span>
          <span className="rounded bg-surface px-2 py-1">Submitted {sheet.summary.submitted}</span>
          <span className="rounded bg-surface px-2 py-1">
            Approved {sheet.summary.approved + sheet.summary.final}
          </span>
        </div>
      </div>
      {sheet.lockedReason && (
        <div className="p-4 pb-0">
          <Alert tone="info">{sheet.lockedReason}</Alert>
        </div>
      )}
      {sheet.rows.length === 0 ? (
        <EmptyState title="No students in this section" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Roll</th>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Marks (/{max})</th>
                <th className="px-4 py-2 font-medium">Absent</th>
                <th className="px-4 py-2 font-medium">Remarks</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sheet.rows.map((r) => {
                const d = draft[r.enrolmentId];
                const editable = editableRow(r.status);
                const n = Number(d.marks);
                const bad = !d.isAbsent && d.marks !== '' && (Number.isNaN(n) || n < 0 || n > max);
                return (
                  <tr key={r.enrolmentId} aria-label={r.fullName}>
                    <td className="px-4 py-2 text-ink-muted">{r.rollNumber ?? '—'}</td>
                    <td className="px-4 py-2 font-medium text-ink">{r.fullName}</td>
                    <td className="px-4 py-2">
                      {editable ? (
                        <Input
                          type="number"
                          min={0}
                          max={max}
                          step="0.5"
                          value={d.isAbsent ? '' : d.marks}
                          disabled={d.isAbsent}
                          onChange={(e) => set(r.enrolmentId, { marks: e.target.value })}
                          aria-label={`Marks for ${r.fullName}`}
                          aria-invalid={bad}
                          className={`max-w-[100px] ${bad ? 'border-red-500' : ''}`}
                        />
                      ) : (
                        <span className="font-medium">{r.isAbsent ? 'AB' : (r.marks ?? '—')}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-navy"
                        checked={d.isAbsent}
                        disabled={!editable}
                        onChange={(e) => set(r.enrolmentId, { isAbsent: e.target.checked })}
                        aria-label={`Absent: ${r.fullName}`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      {editable ? (
                        <Input
                          value={d.remarks}
                          onChange={(e) => set(r.enrolmentId, { remarks: e.target.value })}
                          aria-label={`Remarks for ${r.fullName}`}
                          className="max-w-[200px]"
                          maxLength={255}
                        />
                      ) : (
                        <span className="text-ink-muted">{r.remarks}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {r.status ? (
                        <Badge tone={TONE[r.status]}>{MARK_STATUS_LABELS[r.status]}</Badge>
                      ) : (
                        <span className="text-xs text-ink-muted">Not entered</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(sheet.canEdit || sheet.canReview) && sheet.rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 p-4">
          {invalid && (
            <span className="mr-auto text-sm text-red-600">Some marks are outside 0–{max}.</span>
          )}
          {sheet.canEdit && (
            <>
              <span className="text-sm text-ink-muted">
                {changes.length ? `${changes.length} unsaved` : 'All saved'}
              </span>
              <Button
                variant="secondary"
                onClick={onSave}
                loading={save.isPending}
                disabled={!changes.length || invalid}
              >
                Save draft
              </Button>
              <Button
                onClick={() =>
                  window.confirm(
                    'Submit these marks for approval? You will not be able to change them unless they are returned.',
                  ) && run(() => submit.mutateAsync(ids), 'Marks submitted for approval.')
                }
                loading={submit.isPending}
                disabled={!sheet.canSubmit || changes.length > 0}
                title={changes.length ? 'Save first' : undefined}
              >
                Submit for approval
              </Button>
            </>
          )}
          {sheet.canReview && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  const remarks = window.prompt('What should the teacher correct?', '');
                  if (remarks !== null)
                    void run(
                      () => review.mutateAsync({ ...ids, decision: 'RETURN', remarks }),
                      'Marks returned to the teacher.',
                    );
                }}
                loading={review.isPending}
              >
                Return to teacher
              </Button>
              <Button
                onClick={() =>
                  run(() => review.mutateAsync({ ...ids, decision: 'APPROVE' }), 'Marks approved.')
                }
                loading={review.isPending}
                disabled={!sheet.summary.submitted}
              >
                Approve
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
