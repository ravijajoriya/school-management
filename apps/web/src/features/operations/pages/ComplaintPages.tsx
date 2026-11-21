import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  PERMISSIONS,
  type ComplaintCategory,
  type ComplaintStatus,
} from '@school/shared';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
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
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { Td, Th } from '../components/OpsParts';
import { tbodyClass, theadClass, useFormErrors } from '../ops-utils';
import {
  useComplaint,
  useComplaintAssignees,
  useComplaints,
  useComplaintSummary,
  useCreateComplaint,
  useUpdateComplaint,
} from '../operations-api';
import { ExportButtons } from '@/features/reports/components/ExportButtons';
import { usePagination } from '@/lib/use-pagination';

const STATUS_TONE: Record<ComplaintStatus, 'amber' | 'navy' | 'green' | 'gray'> = {
  OPEN: 'amber',
  IN_PROGRESS: 'navy',
  RESOLVED: 'green',
  CLOSED: 'gray',
};

export function ComplaintsPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.COMPLAINTS_MANAGE);
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [search, setSearch] = useState('');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const debounced = useDebouncedValue(search);
  const list = useComplaints({
    status: status || undefined,
    category: category || undefined,
    search: debounced,
    page,
    pageSize,
  });
  const summary = useComplaintSummary();
  const [creating, setCreating] = useState(false);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Complaints"
        description="Complaints and grievances from parents, students or staff, with who is handling them and how they were resolved."
        actions={
          <>
            <ExportButtons report="complaints" params={{ status: status || undefined }} />
            {manage && <Button onClick={() => setCreating(true)}>Log complaint</Button>}
          </>
        }
      />
      {summary.data && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COMPLAINT_STATUSES.map((s) => (
            <Card key={s} className="p-4">
              <div className="text-xs uppercase tracking-wide text-ink-muted">
                {COMPLAINT_STATUS_LABELS[s]}
              </div>
              <div className="text-2xl font-bold text-brand-navy">
                {summary.data.byStatus[s] ?? 0}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <div className="grid gap-3 border-b border-gray-100 p-4 sm:grid-cols-3">
          <Field label="Search" htmlFor="cm-search">
            <Input
              id="cm-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Reference, subject or name"
            />
          </Field>
          <Field label="Status" htmlFor="cm-status">
            <Select
              id="cm-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ComplaintStatus | '');
                setPage(1);
              }}
            >
              <option value="">All</option>
              {COMPLAINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMPLAINT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="cm-category">
            <Select
              id="cm-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as ComplaintCategory | '');
                setPage(1);
              }}
            >
              <option value="">All</option>
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COMPLAINT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState title="No complaints" />
        ) : (
          <>
            <table className="min-w-full text-sm">
              <thead className={theadClass}>
                <tr>
                  <Th>Reference</Th>
                  <Th>Subject</Th>
                  <Th>Category</Th>
                  <Th>Assigned to</Th>
                  <Th>Status</Th>
                  <Th>Logged</Th>
                </tr>
              </thead>
              <tbody className={tbodyClass}>
                {list.data.items.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-xs">
                      <Link
                        to={`/admin/complaints/${c.id}`}
                        className="text-brand-navy hover:underline"
                      >
                        {c.referenceNumber}
                      </Link>
                    </Td>
                    <Td>
                      <div className="font-medium text-ink">{c.subject}</div>
                      {c.submittedByName && (
                        <div className="text-xs text-ink-muted">From {c.submittedByName}</div>
                      )}
                    </Td>
                    <Td>{COMPLAINT_CATEGORY_LABELS[c.category]}</Td>
                    <Td>{c.assignedTo?.fullName ?? '—'}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[c.status]}>
                        {COMPLAINT_STATUS_LABELS[c.status]}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-ink-muted">{formatDateTime(c.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              onChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>
      {creating && <NewComplaintModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewComplaintModal({ onClose }: { onClose: () => void }) {
  const create = useCreateComplaint();
  const assignees = useComplaintAssignees(true);
  const navigate = useNavigate();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    category: 'OTHER' as ComplaintCategory,
    subject: '',
    description: '',
    submittedByName: '',
    contactPhone: '',
    assignedTo: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  const submit = async () => {
    errs.reset();
    try {
      const c = await create.mutateAsync(form);
      navigate(`/admin/complaints/${c.id}`);
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Log complaint"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Log complaint
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label="Category" htmlFor="nc-category" required>
            <Select id="nc-category" value={form.category} onChange={set('category')}>
              {COMPLAINT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {COMPLAINT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" htmlFor="nc-subject" error={errs.fields.subject} required>
            <Input id="nc-subject" value={form.subject} onChange={set('subject')} />
          </Field>
        </div>
        <Field label="Details" htmlFor="nc-desc" error={errs.fields.description} required>
          <textarea
            id="nc-desc"
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.description}
            onChange={set('description')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Raised by" htmlFor="nc-name" hint="Parent, student or staff name">
            <Input id="nc-name" value={form.submittedByName} onChange={set('submittedByName')} />
          </Field>
          <Field label="Contact phone" htmlFor="nc-phone" error={errs.fields.contactPhone}>
            <Input id="nc-phone" value={form.contactPhone} onChange={set('contactPhone')} />
          </Field>
        </div>
        <Field label="Assign to" htmlFor="nc-assign" error={errs.fields.assignedTo}>
          <Select id="nc-assign" value={form.assignedTo} onChange={set('assignedTo')}>
            <option value="">Not yet</option>
            {assignees.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

export function ComplaintDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const manage = can(PERMISSIONS.COMPLAINTS_MANAGE);
  const complaint = useComplaint(id);
  const assignees = useComplaintAssignees(manage);
  if (complaint.isLoading) return <PageSpinner />;
  if (!complaint.data) return <Alert>{errorMessages(complaint.error)[0]}</Alert>;
  const c = complaint.data;
  return (
    <div className="max-w-4xl">
      <Link
        to="/admin/complaints"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Complaints
      </Link>
      <PageHeader
        title={c.subject}
        description={`${c.referenceNumber} · ${COMPLAINT_CATEGORY_LABELS[c.category]} · logged ${formatDateTime(c.createdAt)} by ${c.createdBy}`}
      />
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-5">
            <p className="whitespace-pre-wrap text-sm text-ink">{c.description}</p>
            {(c.submittedByName || c.contactPhone) && (
              <p className="mt-3 text-xs text-ink-muted">
                Raised by {c.submittedByName ?? '—'}
                {c.contactPhone && ` · ${c.contactPhone}`}
              </p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">History</h2>
            <ol className="space-y-2 text-sm">
              {c.history.map((h, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    <strong>{h.action}</strong>
                    {h.detail && ` — ${h.detail}`}
                    {h.user && <span className="text-ink-muted"> by {h.user}</span>}
                  </span>
                  <span className="whitespace-nowrap text-xs text-ink-muted">
                    {formatDateTime(h.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        {manage ? (
          <ComplaintUpdateCard complaint={c} assignees={assignees.data ?? []} />
        ) : (
          <Card className="space-y-2 p-5 text-sm">
            <Badge tone={STATUS_TONE[c.status]}>{COMPLAINT_STATUS_LABELS[c.status]}</Badge>
            <p>Assigned to: {c.assignedTo?.fullName ?? '—'}</p>
            {c.resolutionNotes && <p className="whitespace-pre-wrap">{c.resolutionNotes}</p>}
          </Card>
        )}
      </div>
    </div>
  );
}

function ComplaintUpdateCard({
  complaint: c,
  assignees,
}: {
  complaint: NonNullable<ReturnType<typeof useComplaint>['data']>;
  assignees: { id: string; fullName: string }[];
}) {
  const update = useUpdateComplaint(c.id);
  const errs = useFormErrors();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    status: c.status,
    assignedTo: c.assignedTo?.id ?? '',
    resolutionNotes: c.resolutionNotes ?? '',
  });
  const submit = async () => {
    errs.reset();
    setSaved(false);
    try {
      await update.mutateAsync({
        status: form.status,
        assignedTo: form.assignedTo || null,
        resolutionNotes: form.resolutionNotes || null,
      });
      setSaved(true);
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Card className="space-y-4 p-5">
      {errs.general && <Alert>{errs.general}</Alert>}
      {saved && <Alert tone="success">Saved.</Alert>}
      <Field label="Status" htmlFor="cu-status">
        <Select
          id="cu-status"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value as ComplaintStatus })}
        >
          {COMPLAINT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {COMPLAINT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assigned to" htmlFor="cu-assign" error={errs.fields.assignedTo}>
        <Select
          id="cu-assign"
          value={form.assignedTo}
          onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
        >
          <option value="">Nobody</option>
          {assignees.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Resolution notes"
        htmlFor="cu-notes"
        error={errs.fields.resolutionNotes}
        hint="Required to resolve or close"
      >
        <textarea
          id="cu-notes"
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.resolutionNotes}
          onChange={(e) => setForm({ ...form, resolutionNotes: e.target.value })}
        />
      </Field>
      <Button onClick={submit} loading={update.isPending}>
        Save changes
      </Button>
    </Card>
  );
}
