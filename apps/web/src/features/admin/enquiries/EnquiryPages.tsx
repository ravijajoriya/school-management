import { zodResolver } from '@hookform/resolvers/zod';
import {
  CONTACT_MESSAGE_STATUSES,
  ENQUIRY_SOURCE_LABELS,
  ENQUIRY_SOURCES,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_STATUSES,
  PERMISSIONS,
  createEnquirySchema,
  type ContactMessageStatus,
  type CreateEnquiryInput,
  type EnquiryDetail,
  type EnquiryStatus,
} from '@school/shared';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
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
import { PermissionGate } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDate, formatDateTime, fromLocalInput } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  useAddFollowUp,
  useClasses,
  useContactMessages,
  useCreateEnquiry,
  useEnquiry,
  useEnquiryAssignees,
  useEnquiries,
  useUpdateContactMessage,
  useUpdateEnquiry,
} from '../cms-api';
import { ConvertEnquiryModal } from '../students/ConvertEnquiryModal';
import { usePagination } from '@/lib/use-pagination';

const textarea =
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40';

const ENQUIRY_TONE: Record<EnquiryStatus, 'gold' | 'navy' | 'amber' | 'green' | 'gray' | 'red'> = {
  NEW: 'gold',
  CONTACTED: 'navy',
  VISIT_SCHEDULED: 'amber',
  ADMISSION_CONFIRMED: 'green',
  NOT_INTERESTED: 'gray',
  CLOSED: 'gray',
};

// --- Queue ------------------------------------------------------------------------------------

export function EnquiriesPage() {
  const navigate = useNavigate();
  const classes = useClasses();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EnquiryStatus | ''>('');
  const [classSoughtId, setClassSoughtId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const [adding, setAdding] = useState(false);
  const debounced = useDebouncedValue(search);
  const list = useEnquiries({
    search: debounced,
    status: status || undefined,
    classSoughtId,
    assignedTo: (assignedTo || undefined) as 'me' | 'unassigned' | undefined,
    page,
    pageSize,
  });
  const resetPage =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };

  return (
    <div>
      <PageHeader
        title="Admission Enquiries"
        description="Enquiries from the website form and those recorded by staff."
        actions={
          <PermissionGate permissions={[PERMISSIONS.ENQUIRIES_MANAGE]}>
            <Button onClick={() => setAdding(true)}>Record walk-in / phone enquiry</Button>
          </PermissionGate>
        }
      />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-gray-200 p-4">
          <Input
            type="search"
            placeholder="Search name, phone, reference"
            className="max-w-xs"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            aria-label="Search enquiries"
          />
          <Select
            className="max-w-[190px]"
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value as EnquiryStatus | '')}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {ENQUIRY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ENQUIRY_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select
            className="max-w-[160px]"
            value={classSoughtId}
            onChange={(e) => resetPage(setClassSoughtId)(e.target.value)}
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            className="max-w-[170px]"
            value={assignedTo}
            onChange={(e) => resetPage(setAssignedTo)(e.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </Select>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : list.isError ? (
          <div className="p-4">
            <Alert>{errorMessages(list.error)[0]}</Alert>
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState title="No enquiries found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Child / Parent</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium">Next follow-up</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.data.items.map((e) => {
                  const overdue = e.nextFollowUpAt && new Date(e.nextFollowUpAt) <= new Date();
                  return (
                    <tr
                      key={e.id}
                      className="cursor-pointer hover:bg-surface/60"
                      onClick={() => navigate(`/admin/enquiries/${e.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          to={`/admin/enquiries/${e.id}`}
                          className="text-brand-navy hover:underline"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {e.referenceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{e.studentName}</div>
                        <div className="text-xs text-ink-muted">
                          {e.guardianName} · {e.phone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{e.classSought.name}</td>
                      <td className="px-4 py-3">
                        <Badge tone={ENQUIRY_TONE[e.status]}>
                          {ENQUIRY_STATUS_LABELS[e.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{e.assignedTo?.fullName ?? '—'}</td>
                      <td
                        className={`px-4 py-3 ${overdue ? 'font-medium text-red-700' : 'text-ink-muted'}`}
                      >
                        {e.nextFollowUpAt ? formatDateTime(e.nextFollowUpAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{formatDate(e.submittedAt)}</td>
                    </tr>
                  );
                })}
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
      {adding && (
        <NewEnquiryModal
          onClose={() => setAdding(false)}
          onCreated={(id) => navigate(`/admin/enquiries/${id}`)}
        />
      )}
    </div>
  );
}

function NewEnquiryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const classes = useClasses();
  const create = useCreateEnquiry();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<CreateEnquiryInput>({
    resolver: zodResolver(createEnquirySchema),
    defaultValues: {
      guardianName: '',
      phone: '',
      email: '',
      studentName: '',
      classSoughtId: '',
      message: '',
      source: 'WALK_IN',
    },
  });
  const { errors } = formState;
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await create.mutateAsync(values);
      onCreated(res.id);
    } catch (error) {
      const { fields, general } = splitFieldErrors(error);
      Object.entries(fields).forEach(([k, message]) =>
        setError(k as keyof CreateEnquiryInput, { message }),
      );
      setServerError(general[0] ?? null);
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Record an enquiry"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={formState.isSubmitting}>
            Save enquiry
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Parent's name" htmlFor="ne-g" error={errors.guardianName?.message} required>
            <Input id="ne-g" {...register('guardianName')} invalid={!!errors.guardianName} />
          </Field>
          <Field label="Phone" htmlFor="ne-p" error={errors.phone?.message} required>
            <Input id="ne-p" type="tel" {...register('phone')} invalid={!!errors.phone} />
          </Field>
          <Field label="Child's name" htmlFor="ne-s" error={errors.studentName?.message} required>
            <Input id="ne-s" {...register('studentName')} invalid={!!errors.studentName} />
          </Field>
          <Field label="Class" htmlFor="ne-c" error={errors.classSoughtId?.message} required>
            <Select id="ne-c" {...register('classSoughtId')} invalid={!!errors.classSoughtId}>
              <option value="">Select class</option>
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Email" htmlFor="ne-e" error={errors.email?.message}>
            <Input id="ne-e" type="email" {...register('email')} invalid={!!errors.email} />
          </Field>
          <Field label="Source" htmlFor="ne-src">
            <Select id="ne-src" {...register('source')}>
              {ENQUIRY_SOURCES.filter((s) => s !== 'WEBSITE').map((s) => (
                <option key={s} value={s}>
                  {ENQUIRY_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes" htmlFor="ne-m">
          <textarea id="ne-m" rows={3} className={textarea} {...register('message')} />
        </Field>
      </form>
    </Modal>
  );
}

// --- Detail --------------------------------------------------------------------------------------

export function EnquiryDetailPage() {
  const { id = '' } = useParams();
  const enquiry = useEnquiry(id);
  if (enquiry.isLoading) return <PageSpinner />;
  if (enquiry.isError || !enquiry.data) return <Alert>{errorMessages(enquiry.error)[0]}</Alert>;
  return <EnquiryDetailView enquiry={enquiry.data} />;
}

const HISTORY_LABELS: Record<string, string> = {
  'enquiry.submitted': 'Submitted on the website',
  'enquiry.created': 'Recorded by staff',
  'enquiry.updated': 'Updated',
  'enquiry.follow_up_added': 'Follow-up added',
  'enquiry.converted': 'Converted to a student record',
};

function describeChange(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (a.status && a.status !== b.status) {
    parts.push(`status → ${ENQUIRY_STATUS_LABELS[a.status as EnquiryStatus] ?? String(a.status)}`);
  }
  if ('assignedTo' in a && a.assignedTo !== b.assignedTo)
    parts.push(`assigned → ${(a.assignedTo as string) ?? 'nobody'}`);
  return parts.join(', ');
}

function EnquiryDetailView({ enquiry }: { enquiry: EnquiryDetail }) {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.ENQUIRIES_MANAGE);
  const canConvert = canManage && can(PERMISSIONS.STUDENTS_MANAGE);
  const navigate = useNavigate();
  const [converting, setConverting] = useState(false);
  const assignees = useEnquiryAssignees();
  const update = useUpdateEnquiry(enquiry.id);
  const addFollowUp = useAddFollowUp(enquiry.id);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ notes: '', outcome: '', status: '', nextFollowUpAt: '' });

  const change = async (input: Parameters<typeof update.mutateAsync>[0]) => {
    setError(null);
    try {
      await update.mutateAsync(input);
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };

  const submitFollowUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await addFollowUp.mutateAsync({
        notes: form.notes,
        outcome: form.outcome || undefined,
        status: (form.status || undefined) as EnquiryStatus | undefined,
        nextFollowUpAt: fromLocalInput(form.nextFollowUpAt),
      });
      setForm({ notes: '', outcome: '', status: '', nextFollowUpAt: '' });
    } catch (err) {
      setError(
        errorMessages(err)
          .map((m) => m.replace(/^\w+: /, ''))
          .join(' '),
      );
    }
  };

  return (
    <div className="max-w-5xl">
      <Link
        to="/admin/enquiries"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All enquiries
      </Link>
      <PageHeader
        title={enquiry.studentName}
        description={`${enquiry.referenceNumber} · ${enquiry.classSought.name} · received ${formatDateTime(enquiry.submittedAt)} via ${ENQUIRY_SOURCE_LABELS[enquiry.source]}`}
        actions={
          !enquiry.convertedStudent &&
          canConvert && <Button onClick={() => setConverting(true)}>Convert to student</Button>
        }
      />
      {enquiry.convertedStudent && (
        <div className="mb-4">
          <Alert tone="success">
            Admitted as{' '}
            <Link
              to={`/admin/students/${enquiry.convertedStudent.id}`}
              className="font-medium underline"
            >
              {enquiry.convertedStudent.fullName} ({enquiry.convertedStudent.admissionNumber})
            </Link>
            .
          </Alert>
        </div>
      )}
      {converting && (
        <ConvertEnquiryModal
          enquiry={enquiry}
          onClose={() => setConverting(false)}
          onConverted={(studentId) => navigate(`/admin/students/${studentId}`)}
        />
      )}
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-brand-navy">Details</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Parent</dt>
                <dd className="font-medium text-ink">{enquiry.guardianName}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Contact</dt>
                <dd className="space-y-1">
                  <a
                    href={`tel:${enquiry.phone}`}
                    className="flex items-center gap-1 text-brand-navy hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {enquiry.phone}
                  </a>
                  {enquiry.email && (
                    <a
                      href={`mailto:${enquiry.email}`}
                      className="flex items-center gap-1 text-brand-navy hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                      {enquiry.email}
                    </a>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Class sought</dt>
                <dd className="text-ink">{enquiry.classSought.name}</dd>
              </div>
              {enquiry.dateOfBirth && (
                <div>
                  <dt className="text-ink-muted">Date of birth</dt>
                  <dd className="text-ink">{formatDate(enquiry.dateOfBirth)}</dd>
                </div>
              )}
            </dl>
            {enquiry.message && (
              <div className="mt-4 rounded-md bg-surface p-3 text-sm">
                <p className="text-xs font-medium uppercase text-ink-muted">Message</p>
                <p className="mt-1 whitespace-pre-line text-ink">{enquiry.message}</p>
              </div>
            )}
          </Card>

          {canManage && (
            <Card className="p-5">
              <h2 className="font-semibold text-brand-navy">Add follow-up</h2>
              <form onSubmit={submitFollowUp} className="mt-3 space-y-3">
                <Field label="What happened?" htmlFor="fu-notes" required>
                  <textarea
                    id="fu-notes"
                    rows={3}
                    className={textarea}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. Called the parent, campus visit booked for Saturday 10 AM"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Outcome" htmlFor="fu-out">
                    <Input
                      id="fu-out"
                      value={form.outcome}
                      onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
                      placeholder="Visit booked"
                    />
                  </Field>
                  <Field label="Change status to" htmlFor="fu-status">
                    <Select
                      id="fu-status"
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      <option value="">Keep “{ENQUIRY_STATUS_LABELS[enquiry.status]}”</option>
                      {ENQUIRY_STATUSES.filter((s) => s !== enquiry.status).map((s) => (
                        <option key={s} value={s}>
                          {ENQUIRY_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Next follow-up" htmlFor="fu-next">
                    <Input
                      id="fu-next"
                      type="datetime-local"
                      value={form.nextFollowUpAt}
                      onChange={(e) => setForm((f) => ({ ...f, nextFollowUpAt: e.target.value }))}
                    />
                  </Field>
                </div>
                <Button type="submit" loading={addFollowUp.isPending} disabled={!form.notes.trim()}>
                  Save follow-up
                </Button>
              </form>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-semibold text-brand-navy">Follow-ups</h2>
            {enquiry.followUps.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No follow-ups yet.</p>
            ) : (
              <ol className="mt-3 space-y-4">
                {enquiry.followUps.map((f) => (
                  <li key={f.id} className="border-l-2 border-brand-gold pl-4">
                    <p className="text-xs text-ink-muted">
                      {formatDateTime(f.followUpAt)} · {f.user.fullName}
                      {f.outcome && (
                        <>
                          {' '}
                          · <span className="font-medium text-ink">{f.outcome}</span>
                        </>
                      )}
                    </p>
                    {f.notes && (
                      <p className="mt-1 whitespace-pre-line text-sm text-ink">{f.notes}</p>
                    )}
                    {f.nextFollowUpAt && (
                      <p className="mt-1 text-xs text-brand-navy">
                        Next follow-up: {formatDateTime(f.nextFollowUpAt)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <Field label="Status" htmlFor="d-status">
              <Select
                id="d-status"
                value={enquiry.status}
                disabled={!canManage || update.isPending}
                onChange={(e) => change({ status: e.target.value as EnquiryStatus })}
              >
                {ENQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ENQUIRY_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assigned to" htmlFor="d-assignee">
              <Select
                id="d-assignee"
                value={enquiry.assignedTo?.id ?? ''}
                disabled={!canManage || update.isPending}
                onChange={(e) => change({ assignedToId: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {assignees.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-brand-navy">History</h2>
            <ol className="mt-3 space-y-3 text-sm">
              {enquiry.history.map((h, i) => (
                <li key={i}>
                  <p className="text-ink">
                    {HISTORY_LABELS[h.action] ?? h.action}
                    {describeChange(h.before, h.after) && (
                      <span className="text-ink-muted"> — {describeChange(h.before, h.after)}</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDateTime(h.at)}
                    {h.user ? ` · ${h.user.fullName}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Contact messages ------------------------------------------------------------------------------

export function ContactMessagesPage() {
  const [status, setStatus] = useState<ContactMessageStatus | ''>('NEW');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const list = useContactMessages({ status: status || undefined, page, pageSize });
  const update = useUpdateContactMessage();
  return (
    <div>
      <PageHeader title="Contact Messages" description="Messages sent through the Contact page." />
      <Card>
        <div className="flex gap-3 border-b border-gray-200 p-4">
          <Select
            className="max-w-[180px]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ContactMessageStatus | '');
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All messages</option>
            {CONTACT_MESSAGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'NEW' ? 'New' : s === 'READ' ? 'Read' : 'Archived'}
              </option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState title="No messages" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.data.items.map((m) => (
              <li key={m.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">
                      {m.fullName} {m.status === 'NEW' && <Badge tone="gold">New</Badge>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      <a href={`mailto:${m.email}`} className="hover:underline">
                        {m.email}
                      </a>{' '}
                      ·{' '}
                      <a href={`tel:${m.phone}`} className="hover:underline">
                        {m.phone}
                      </a>{' '}
                      · {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {m.status !== 'READ' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => update.mutate({ id: m.id, status: 'READ' })}
                      >
                        Mark read
                      </Button>
                    )}
                    {m.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update.mutate({ id: m.id, status: 'ARCHIVED' })}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm text-ink">{m.message}</p>
                {m.handledBy && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Handled by {m.handledBy.fullName} · {formatDateTime(m.handledAt)}
                  </p>
                )}
              </li>
            ))}
          </ul>
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
    </div>
  );
}
