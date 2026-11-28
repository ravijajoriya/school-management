import { zodResolver } from '@hookform/resolvers/zod';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  PERMISSIONS,
  createLeaveRequestSchema,
  leaveDays,
  type CreateLeaveRequestInput,
  type LeaveRequestItem,
  type LeaveStatus,
  type LeaveType,
} from '@school/shared';
import {
  Ban,
  CalendarDays,
  Check,
  CircleCheck,
  CircleX,
  Hourglass,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FilterCard, IconSelect, SearchBox } from '@/components/common/ListParts';
import { HeroCard } from '@/components/common/HeroCard';
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
import { LeaveCard, LeaveIllustration, LeaveStatTile } from './LeaveReviewParts';
import {
  useApplyLeave,
  useCancelLeave,
  useLeaveRequests,
  useLeaveSummary,
  useMyLeave,
  useReviewLeave,
} from './leave-api';
import { usePagination } from '@/lib/use-pagination';
import { useConfirm } from '@/lib/dialogs';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const textarea =
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40';

// --- Teacher: apply & history ----------------------------------------------------------------

export function MyLeavePage() {
  const confirm = useConfirm();
  const mine = useMyLeave();
  const cancel = useCancelLeave();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const onCancel = async (l: LeaveRequestItem) => {
    if (
      !(await confirm({
        title: `Cancel your ${LEAVE_TYPE_LABELS[l.leaveType].toLowerCase()} for ${leaveDates(l)}?`,
        confirmLabel: 'Cancel leave',
        tone: 'danger',
        cancelLabel: 'Keep it',
      }))
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
  const [search, setSearch] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType | ''>('');
  const [department, setDepartment] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const list = useLeaveRequests({
    status: status || undefined,
    search: debounced || undefined,
    leaveType: leaveType || undefined,
    department: department || undefined,
    page,
    pageSize,
  });
  const summary = useLeaveSummary();
  const s = summary.data;
  const [reviewing, setReviewing] = useState<{
    item: LeaveRequestItem;
    decision: 'approve' | 'reject';
  } | null>(null);
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };
  const filtered = !!(debounced || leaveType || department);
  const all = s ? Object.values(s.byStatus).reduce((a, b) => a + b, 0) : null;
  const tabs: {
    value: LeaveStatus | '';
    label: string;
    icon?: LucideIcon;
    count: number | null;
  }[] = [
    { value: '', label: 'All Requests', count: all },
    { value: 'PENDING', label: 'Pending', icon: Hourglass, count: s?.byStatus.PENDING ?? null },
    {
      value: 'APPROVED',
      label: 'Approved',
      icon: CircleCheck,
      count: s?.byStatus.APPROVED ?? null,
    },
    { value: 'REJECTED', label: 'Rejected', icon: CircleX, count: s?.byStatus.REJECTED ?? null },
    ...(s?.byStatus.CANCELLED
      ? [
          {
            value: 'CANCELLED' as const,
            label: 'Cancelled',
            icon: Ban,
            count: s.byStatus.CANCELLED,
          },
        ]
      : []),
  ];
  const items = list.data?.items ?? [];
  const [month] = useState(() =>
    new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' }).format(
      new Date(),
    ),
  );

  return (
    <div className="mx-auto max-w-7xl">
      <HeroCard
        title="Staff Leave"
        description="Approve or reject leave requests. Teachers see the decision in their portal."
        illustration={<LeaveIllustration />}
      />

      {s && (
        <div className="mb-3 grid grid-cols-4 gap-2 sm:mb-4 sm:gap-4">
          <LeaveStatTile icon={Hourglass} tone="amber" value={s.byStatus.PENDING} label="Pending" />
          <LeaveStatTile icon={Check} tone="green" value={s.byStatus.APPROVED} label="Approved" />
          <LeaveStatTile icon={X} tone="red" value={s.byStatus.REJECTED} label="Rejected" />
          <LeaveStatTile
            icon={CalendarDays}
            tone="blue"
            value={s.thisMonth}
            label="This Month"
            title={`Requests (not cancelled) with leave days in ${month}`}
          />
        </div>
      )}

      {s && s.onLeaveToday.length > 0 && (
        <div className="mb-3 sm:mb-4">
          <Alert tone="info">
            On leave today:{' '}
            {s.onLeaveToday
              .map(
                (p) =>
                  `${p.fullName} (${LEAVE_TYPE_LABELS[p.leaveType].toLowerCase()}, until ${formatDate(p.endDate)})`,
              )
              .join('; ')}
          </Alert>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Filter by status"
        className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mb-4 sm:gap-2"
      >
        {tabs.map((t) => {
          const active = status === t.value;
          return (
            <button
              key={t.value || 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => reset(setStatus)(t.value)}
              className={`inline-flex min-w-max flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-2 text-[11px] sm:flex-none sm:gap-1.5 sm:px-3 font-semibold shadow-sm ring-1 transition-colors sm:text-sm ${
                active
                  ? 'bg-brand-navy text-white ring-brand-navy'
                  : 'bg-white text-ink ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.icon && <t.icon className="hidden h-4 w-4 min-[420px]:block" aria-hidden="true" />}
              {t.label}
              {t.count !== null && ` (${t.count})`}
            </button>
          );
        })}
      </div>

      <FilterCard id="leave-filters">
        <SearchBox
          className="col-span-2"
          placeholder="Search name, code or reason"
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
          aria-label="Search leave requests"
        />
        <IconSelect
          icon={CalendarDays}
          value={leaveType}
          onChange={(e) => reset(setLeaveType)(e.target.value as LeaveType | '')}
          aria-label="Filter by leave type"
        >
          <option value="">Leave type</option>
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {LEAVE_TYPE_LABELS[t]}
            </option>
          ))}
        </IconSelect>
        <IconSelect
          icon={Users}
          value={department}
          onChange={(e) => reset(setDepartment)(e.target.value)}
          aria-label="Filter by department"
        >
          <option value="">Department</option>
          {s?.departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </IconSelect>
      </FilterCard>

      {list.isLoading ? (
        <PageSpinner />
      ) : list.isError ? (
        <Alert>{errorMessages(list.error)[0]}</Alert>
      ) : !items.length ? (
        <Card>
          <EmptyState
            title={
              filtered
                ? 'No leave requests match these filters'
                : status === 'PENDING'
                  ? 'No pending requests'
                  : 'No leave requests'
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 lg:gap-4" aria-label="Leave requests">
          {items.map((l) => (
            <LeaveCard
              key={l.id}
              leave={l}
              canReview={canReview}
              onReview={(decision) => setReviewing({ item: l, decision })}
            />
          ))}
        </ul>
      )}

      {list.data && list.data.total > 0 && (
        <Card className="mt-3 sm:mt-4">
          <Pagination
            className="py-3.5"
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}
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
