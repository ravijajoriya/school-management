import { zodResolver } from '@hookform/resolvers/zod';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUSES,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  PERMISSIONS,
  createLeaveRequestSchema,
  leaveDays,
  type CreateLeaveRequestInput,
  type LeaveRequestItem,
  type LeaveStatus,
} from '@school/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageSpinner,
  Pagination,
  Select,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDate, formatDateTime, todayIso } from '@/lib/format';
import { leaveDates } from './format';
import { LeaveStatusBadge } from './LeaveHistoryCard';
import {
  useApplyLeave,
  useCancelLeave,
  useLeaveRequests,
  useLeaveSummary,
  useMyLeave,
  useReviewLeave,
} from './leave-api';
import { usePagination } from '@/lib/use-pagination';

const textarea =
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40';

// --- Teacher: apply & history ----------------------------------------------------------------

export function MyLeavePage() {
  const mine = useMyLeave();
  const cancel = useCancelLeave();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const onCancel = async (l: LeaveRequestItem) => {
    if (
      !window.confirm(
        `Cancel your ${LEAVE_TYPE_LABELS[l.leaveType].toLowerCase()} for ${leaveDates(l)}?`,
      )
    )
      return;
    setMessage(null);
    try {
      await cancel.mutateAsync(l.id);
      setMessage({ tone: 'success', text: 'Leave request cancelled.' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessages(e)[0] });
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="My leave"
        description="Apply for leave and follow its approval. The office is notified on its dashboard."
      />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <ApplyLeaveCard
          onApplied={() =>
            setMessage({ tone: 'success', text: 'Leave request sent for approval.' })
          }
        />
        <div className="space-y-4">
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Card>
            <h2 className="border-b border-gray-200 p-4 font-semibold text-brand-navy">History</h2>
            {mine.isLoading ? (
              <PageSpinner />
            ) : mine.isError ? (
              <div className="p-4">
                <Alert>{errorMessages(mine.error)[0]}</Alert>
              </div>
            ) : !mine.data?.length ? (
              <EmptyState title="No leave requests yet" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {mine.data.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-start justify-between gap-3 p-4"
                    aria-label={`${LEAVE_TYPE_LABELS[l.leaveType]}, ${leaveDates(l)}`}
                  >
                    <div className="text-sm">
                      <p className="font-medium text-ink">
                        {LEAVE_TYPE_LABELS[l.leaveType]} · {leaveDates(l)}{' '}
                        <span className="text-ink-muted">
                          ({l.days} day{l.days === 1 ? '' : 's'})
                        </span>
                      </p>
                      <p className="text-ink-muted">{l.reason}</p>
                      {l.reviewedBy && (
                        <p className="mt-1 text-xs text-ink-muted">
                          {LEAVE_STATUS_LABELS[l.status]} by {l.reviewedBy.fullName},{' '}
                          {formatDateTime(l.reviewedAt)}
                          {l.reviewRemarks && ` — “${l.reviewRemarks}”`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <LeaveStatusBadge status={l.status} />
                      {l.canCancel && (
                        <Button size="sm" variant="ghost" onClick={() => onCancel(l)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ApplyLeaveCard({ onApplied }: { onApplied: () => void }) {
  const apply = useApplyLeave();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, control, formState } =
    useForm<CreateLeaveRequestInput>({
      resolver: zodResolver(createLeaveRequestSchema),
      defaultValues: {
        leaveType: 'CASUAL',
        startDate: todayIso(),
        endDate: todayIso(),
        reason: '',
      },
    });
  const [start, end] = useWatch({ control, name: ['startDate', 'endDate'] });
  const days = start && end && end >= start ? leaveDays(start, end) : null;
  const { errors } = formState;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await apply.mutateAsync(values);
      reset({ leaveType: 'CASUAL', startDate: todayIso(), endDate: todayIso(), reason: '' });
      onApplied();
    } catch (e) {
      const { fields, general } = splitFieldErrors(e);
      Object.entries(fields).forEach(([k, message]) =>
        setError(k as keyof CreateLeaveRequestInput, { message }),
      );
      setServerError(general[0] ?? null);
    }
  });

  return (
    <Card className="h-fit p-5">
      <h2 className="font-semibold text-brand-navy">Apply for leave</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <Field label="Type of leave" htmlFor="lv-type" error={errors.leaveType?.message} required>
          <Select id="lv-type" {...register('leaveType')}>
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAVE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="lv-start" error={errors.startDate?.message} required>
            <Input id="lv-start" type="date" {...register('startDate')} />
          </Field>
          <Field label="To" htmlFor="lv-end" error={errors.endDate?.message} required>
            <Input id="lv-end" type="date" {...register('endDate')} />
          </Field>
        </div>
        {days && (
          <p className="text-sm text-ink-muted">
            {days} calendar day{days === 1 ? '' : 's'}
          </p>
        )}
        <Field label="Reason" htmlFor="lv-reason" error={errors.reason?.message} required>
          <textarea id="lv-reason" rows={3} className={textarea} {...register('reason')} />
        </Field>
        <Button type="submit" loading={formState.isSubmitting} className="w-full">
          Send for approval
        </Button>
      </form>
    </Card>
  );
}

// --- Office: review --------------------------------------------------------------------------

export function LeaveRequestsPage() {
  const { can } = useAuth();
  const canReview = can(PERMISSIONS.LEAVE_APPROVE);
  const [status, setStatus] = useState<LeaveStatus | ''>('PENDING');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const list = useLeaveRequests({ status: status || undefined, page, pageSize });
  const summary = useLeaveSummary();
  const [reviewing, setReviewing] = useState<{
    item: LeaveRequestItem;
    decision: 'approve' | 'reject';
  } | null>(null);

  return (
    <div>
      <PageHeader
        title="Staff leave"
        description="Approve or reject leave requests. Teachers see the decision in their portal."
        actions={
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as LeaveStatus | '');
              setPage(1);
            }}
            aria-label="Filter by status"
            className="max-w-[180px]"
          >
            <option value="">All requests</option>
            {LEAVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAVE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        }
      />
      {summary.data && summary.data.onLeaveToday.length > 0 && (
        <div className="mb-4">
          <Alert tone="info">
            On leave today:{' '}
            {summary.data.onLeaveToday
              .map(
                (p) =>
                  `${p.fullName} (${LEAVE_TYPE_LABELS[p.leaveType].toLowerCase()}, until ${formatDate(p.endDate)})`,
              )
              .join('; ')}
          </Alert>
        </div>
      )}
      <Card>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState title={status === 'PENDING' ? 'No pending requests' : 'No leave requests'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Staff member</th>
                  <th className="px-4 py-3 font-medium">Leave</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.data.items.map((l) => (
                  <tr key={l.id} aria-label={`${l.employee.fullName}, ${leaveDates(l)}`}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/staff/${l.employee.id}`}
                        className="font-medium text-brand-navy hover:underline"
                      >
                        {l.employee.fullName}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {l.employee.employeeCode} · {l.employee.designation}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink">{LEAVE_TYPE_LABELS[l.leaveType]}</div>
                      <div className="text-xs text-ink-muted">
                        {leaveDates(l)} · {l.days} day{l.days === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-ink-muted">{l.reason}</td>
                    <td className="px-4 py-3">
                      <LeaveStatusBadge status={l.status} />
                      {l.reviewedBy && (
                        <div className="mt-1 text-xs text-ink-muted">
                          by {l.reviewedBy.fullName}
                          {l.reviewRemarks && ` — “${l.reviewRemarks}”`}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {canReview && l.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setReviewing({ item: l, decision: 'approve' })}
                          >
                            Approve
                          </Button>{' '}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setReviewing({ item: l, decision: 'reject' })}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > 0 && (
          <Pagination
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>
      {reviewing && <ReviewModal {...reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}

function ReviewModal({
  item,
  decision,
  onClose,
}: {
  item: LeaveRequestItem;
  decision: 'approve' | 'reject';
  onClose: () => void;
}) {
  const review = useReviewLeave();
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const approve = decision === 'approve';
  const submit = async () => {
    setError(null);
    try {
      await review.mutateAsync({ id: item.id, decision, remarks: remarks.trim() || undefined });
      onClose();
    } catch (e) {
      setError(errorMessages(e).map((m) => m.replace(/^\w+: /, ''))[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${approve ? 'Approve' : 'Reject'} leave for ${item.employee.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={approve ? 'primary' : 'danger'}
            onClick={submit}
            loading={review.isPending}
            disabled={!approve && remarks.trim().length < 3}
          >
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-ink">
          {LEAVE_TYPE_LABELS[item.leaveType]} · {leaveDates(item)} ({item.days} day
          {item.days === 1 ? '' : 's'})
          <br />
          <span className="text-ink-muted">“{item.reason}”</span>
        </p>
        <Field
          label={approve ? 'Remarks (optional)' : 'Reason for rejecting'}
          htmlFor="rv-remarks"
          required={!approve}
        >
          <textarea
            id="rv-remarks"
            rows={3}
            className={textarea}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
