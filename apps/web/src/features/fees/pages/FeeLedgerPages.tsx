import {
  ADJUSTMENT_TYPE_LABELS,
  ADJUSTMENT_TYPES,
  CHEQUE_STATUS_LABELS,
  DUE_STATUS_LABELS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  PAYMENT_STATUS_LABELS,
  PERMISSIONS,
  formatRupees,
  type AdjustmentType,
  type DueItem,
  type DueStatus,
  type PaymentListItem,
  type PaymentMode,
  type StudentLedger,
} from '@school/shared';
import { ArrowLeft, Printer, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
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
  Select,
} from '@/components/ui';
import { useStudents } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDate, formatDateTime, todayIso } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  useAddAdjustment,
  useAddCharge,
  useDeleteDue,
  useFeeHeads,
  useGenerateDues,
  usePaymentActions,
  useReceipt,
  useRecordPayment,
  useStudentLedger,
} from '../fees-api';

const DUE_TONE: Record<DueStatus, 'gray' | 'amber' | 'green' | 'navy'> = {
  OPEN: 'gray',
  PARTIAL: 'amber',
  PAID: 'green',
  WAIVED: 'navy',
};
const textarea =
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-gold/40';
const money = (n: number) => formatRupees(n);

function Totals({ ledger }: { ledger: StudentLedger }) {
  const t = ledger.totals;
  const cells: [string, number, string?][] = [
    ['Billed', t.billed],
    ['Fines', t.fines],
    ['Concessions', -t.reductions],
    ['Paid', t.paid],
    ['Balance', t.balance, t.balance > 0 ? 'text-red-700' : 'text-green-700'],
    ['Overdue', t.overdue, t.overdue > 0 ? 'text-red-700' : undefined],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map(([label, value, color]) => (
        <Card key={label} className="p-3">
          <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
          <p className={`mt-1 text-lg font-bold ${color ?? 'text-brand-navy'}`}>{money(value)}</p>
        </Card>
      ))}
    </div>
  );
}

function PaymentStatusBadges({ p }: { p: PaymentListItem }) {
  return (
    <>
      {p.status !== 'POSTED' && <Badge tone="red">{PAYMENT_STATUS_LABELS[p.status]}</Badge>}{' '}
      {p.chequeStatus && (
        <Badge
          tone={
            p.chequeStatus === 'CLEARED' ? 'green' : p.chequeStatus === 'BOUNCED' ? 'red' : 'amber'
          }
        >
          {CHEQUE_STATUS_LABELS[p.chequeStatus]}
        </Badge>
      )}
    </>
  );
}

// --- Student fee ledger --------------------------------------------------------------------

export function StudentFeesPage() {
  const { studentId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const yearId = params.get('year') ?? undefined;
  const ledger = useStudentLedger(studentId, yearId);
  const { can } = useAuth();
  const [adjusting, setAdjusting] = useState<DueItem | null>(null);
  const [charging, setCharging] = useState(false);
  const [cancelling, setCancelling] = useState<PaymentListItem | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const del = useDeleteDue();
  const generate = useGenerateDues();
  const actions = usePaymentActions();

  if (ledger.isLoading) return <PageSpinner />;
  if (ledger.isError || !ledger.data) return <Alert>{errorMessages(ledger.error)[0]}</Alert>;
  const l = ledger.data;
  const e = l.enrolment;
  const closed = e?.academicYear.status === 'CLOSED';

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessages(err)[0] });
    }
  };

  return (
    <div className="max-w-6xl">
      <Link
        to={`/admin/students/${l.student.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Student record
      </Link>
      <PageHeader
        title={`Fees · ${l.student.fullName}`}
        description={
          e
            ? `${l.student.admissionNumber} · ${e.className} – ${e.sectionName}${e.rollNumber ? ` · Roll ${e.rollNumber}` : ''} · ${e.academicYear.name}`
            : `${l.student.admissionNumber} · not enrolled`
        }
        actions={
          <>
            {l.years.length > 1 && (
              <Select
                value={e?.academicYear.id ?? ''}
                onChange={(ev) => setParams({ year: ev.target.value })}
                aria-label="Academic year"
                className="max-w-[160px]"
              >
                {l.years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </Select>
            )}
            {e && can(PERMISSIONS.FEES_COLLECT) && l.totals.balance > 0 && (
              <Link
                to={`/admin/fees/collect?studentId=${l.student.id}${yearId ? `&year=${yearId}` : ''}`}
              >
                <Button>Collect payment</Button>
              </Link>
            )}
          </>
        }
      />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {!e ? (
        <EmptyState
          title="Not enrolled in a class"
          description="Enrol the student first; fees belong to a class and year."
        />
      ) : (
        <div className="space-y-6">
          <Totals ledger={l} />

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4">
              <h2 className="font-semibold text-brand-navy">Dues</h2>
              {can(PERMISSIONS.FEES_CONFIGURE) && !closed && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={generate.isPending}
                    onClick={async () => {
                      setMessage(null);
                      try {
                        const r = await generate.mutateAsync({ enrolmentId: e.id });
                        setMessage({
                          tone: r.duesCreated ? 'success' : 'error',
                          text: r.duesCreated
                            ? `${r.duesCreated} due(s) added from the class fee plan.`
                            : 'Already billed from every active fee plan of the class.',
                        });
                      } catch (err) {
                        setMessage({ tone: 'error', text: errorMessages(err)[0] });
                      }
                    }}
                  >
                    Bill from class plan
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setCharging(true)}>
                    Add one-off charge
                  </Button>
                </div>
              )}
            </div>
            {l.dues.length === 0 ? (
              <EmptyState
                title="No dues yet"
                description="Generate dues from the class fee plan, or add a one-off charge."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Fee</th>
                      <th className="px-4 py-2 font-medium">Due date</th>
                      <th className="px-4 py-2 text-right font-medium">Billed</th>
                      <th className="px-4 py-2 text-right font-medium">Adjusted</th>
                      <th className="px-4 py-2 text-right font-medium">Paid</th>
                      <th className="px-4 py-2 text-right font-medium">Balance</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {l.dues.map((d) => (
                      <tr key={d.id} aria-label={d.description} className="align-top">
                        <td className="px-4 py-2">
                          <div className="font-medium text-ink">{d.description}</div>
                          {d.adjustments.map((a) => (
                            <div key={a.id} className="text-xs text-ink-muted">
                              {ADJUSTMENT_TYPE_LABELS[a.adjustmentType]}{' '}
                              {a.adjustmentType === 'FINE' ? '+' : '−'}
                              {money(a.amount)} · {a.reason} · {a.approvedBy},{' '}
                              {formatDate(a.effectiveDate)}
                            </div>
                          ))}
                        </td>
                        <td
                          className={`px-4 py-2 ${d.overdue ? 'font-medium text-red-700' : 'text-ink-muted'}`}
                        >
                          {d.dueDate ? formatDate(d.dueDate) : '—'}
                          {d.overdue && <div className="text-xs">overdue</div>}
                        </td>
                        <td className="px-4 py-2 text-right">{money(d.amountDue)}</td>
                        <td className="px-4 py-2 text-right text-ink-muted">
                          {d.fines || d.reductions ? money(d.fines - d.reductions) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">{d.paid ? money(d.paid) : '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold">{money(d.balance)}</td>
                        <td className="px-4 py-2">
                          <Badge tone={DUE_TONE[d.status]}>{DUE_STATUS_LABELS[d.status]}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">
                          {can(PERMISSIONS.FEES_ADJUST) && (
                            <Button size="sm" variant="ghost" onClick={() => setAdjusting(d)}>
                              Adjust
                            </Button>
                          )}
                          {can(PERMISSIONS.FEES_CONFIGURE) && d.canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                window.confirm(`Delete "${d.description}"?`) &&
                                run(() => del.mutateAsync(d.id), 'Due deleted.')
                              }
                            >
                              Delete
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="border-b border-gray-200 p-4 font-semibold text-brand-navy">Payments</h2>
            {l.payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {l.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-start justify-between gap-3 p-4"
                    aria-label={`Payment ${p.receiptNumber ?? p.paymentNumber}`}
                  >
                    <div className="text-sm">
                      <p
                        className={`font-medium ${p.status !== 'POSTED' ? 'text-ink-muted line-through' : 'text-ink'}`}
                      >
                        {money(p.amountReceived)} · {PAYMENT_MODE_LABELS[p.paymentMode]} ·{' '}
                        {formatDate(p.paymentDate)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {p.receiptNumber} {p.referenceNumber && `· Ref ${p.referenceNumber}`} · by{' '}
                        {p.recordedBy}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {p.allocations
                          .map((a) => `${a.description} ${money(a.amount)}`)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <PaymentStatusBadges p={p} />
                      <Link
                        to={`/admin/fees/receipts/${p.id}`}
                        className="text-sm text-brand-navy hover:underline"
                      >
                        Receipt
                      </Link>
                      {p.status === 'POSTED' &&
                        p.chequeStatus === 'PENDING' &&
                        can(PERMISSIONS.FEES_COLLECT) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              run(
                                () => actions.cleared.mutateAsync(p.id),
                                'Cheque marked as cleared.',
                              )
                            }
                          >
                            Cleared
                          </Button>
                        )}
                      {p.status === 'POSTED' &&
                        p.chequeStatus === 'PENDING' &&
                        can(PERMISSIONS.FEES_VOID) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const reason = window.prompt(
                                'Why did the cheque bounce?',
                                'Insufficient funds',
                              );
                              if (reason !== null)
                                void run(
                                  () => actions.bounced.mutateAsync({ id: p.id, reason }),
                                  'Cheque marked as bounced; the dues are payable again.',
                                );
                            }}
                          >
                            Bounced
                          </Button>
                        )}
                      {p.status === 'POSTED' && can(PERMISSIONS.FEES_VOID) && (
                        <Button size="sm" variant="ghost" onClick={() => setCancelling(p)}>
                          Void / reverse
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {adjusting && (
        <AdjustModal
          due={adjusting}
          onClose={() => setAdjusting(null)}
          onDone={(t) => setMessage({ tone: 'success', text: t })}
        />
      )}
      {charging && e && <ChargeModal enrolmentId={e.id} onClose={() => setCharging(false)} />}
      {cancelling && (
        <CancelPaymentModal payment={cancelling} onClose={() => setCancelling(null)} />
      )}
    </div>
  );
}

function AdjustModal({
  due,
  onClose,
  onDone,
}: {
  due: DueItem;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const add = useAddAdjustment();
  const [form, setForm] = useState({
    adjustmentType: 'CONCESSION' as AdjustmentType,
    amount: '',
    reason: '',
    effectiveDate: todayIso(),
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setErrs({});
    setError(null);
    try {
      await add.mutateAsync({ dueId: due.id, ...form });
      onDone(
        `${ADJUSTMENT_TYPE_LABELS[form.adjustmentType]} of ${money(Number(form.amount))} applied to ${due.description}.`,
      );
      onClose();
    } catch (e) {
      const r = splitFieldErrors(e);
      setErrs(r.fields);
      setError(r.general[0] ?? null);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust: ${due.description}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={add.isPending}>
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-ink-muted">
          Outstanding now: {money(due.balance)}. You are recorded as the approver; adjustments
          cannot be edited or deleted later.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="adj-type">
            <Select
              id="adj-type"
              value={form.adjustmentType}
              onChange={(e) =>
                setForm((f) => ({ ...f, adjustmentType: e.target.value as AdjustmentType }))
              }
            >
              {ADJUSTMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ADJUSTMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)" htmlFor="adj-amount" error={errs.amount} required>
            <Input
              id="adj-amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </Field>
          <Field label="Effective date" htmlFor="adj-date" error={errs.effectiveDate}>
            <Input
              id="adj-date"
              type="date"
              value={form.effectiveDate}
              onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
            />
          </Field>
        </div>
        {form.adjustmentType === 'WAIVER' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setForm((f) => ({ ...f, amount: String(due.balance) }))}
          >
            Waive the full balance ({money(due.balance)})
          </Button>
        )}
        <Field label="Reason" htmlFor="adj-reason" error={errs.reason} required>
          <textarea
            id="adj-reason"
            rows={2}
            className={textarea}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="e.g. Sibling concession as per school policy"
          />
        </Field>
      </div>
    </Modal>
  );
}

function ChargeModal({ enrolmentId, onClose }: { enrolmentId: string; onClose: () => void }) {
  const heads = useFeeHeads();
  const add = useAddCharge();
  const [form, setForm] = useState({ feeHeadId: '', description: '', amount: '', dueDate: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setErrs({});
    setError(null);
    try {
      await add.mutateAsync({ enrolmentId, ...form });
      onClose();
    } catch (e) {
      const r = splitFieldErrors(e);
      setErrs(r.fields);
      setError(r.general[0] ?? null);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a one-off charge"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={add.isPending}>
            Add charge
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fee head" htmlFor="ch-head" error={errs.feeHeadId} required>
            <Select
              id="ch-head"
              value={form.feeHeadId}
              onChange={(e) => setForm((f) => ({ ...f, feeHeadId: e.target.value }))}
            >
              <option value="">Select</option>
              {(heads.data ?? [])
                .filter((h) => h.isActive)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor="ch-desc" error={errs.description} required>
            <Input
              id="ch-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Educational trip to Amber Fort"
            />
          </Field>
          <Field label="Amount (₹)" htmlFor="ch-amount" error={errs.amount} required>
            <Input
              id="ch-amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </Field>
          <Field label="Due date" htmlFor="ch-date" error={errs.dueDate}>
            <Input
              id="ch-date"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function CancelPaymentModal({
  payment,
  onClose,
}: {
  payment: PaymentListItem;
  onClose: () => void;
}) {
  const { cancel } = usePaymentActions();
  const [action, setAction] = useState<'VOID' | 'REVERSED'>('VOID');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await cancel.mutateAsync({ id: payment.id, action, reason });
      onClose();
    } catch (e) {
      setError(errorMessages(e).map((m) => m.replace(/^\w+: /, ''))[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Void or reverse ${payment.receiptNumber ?? payment.paymentNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep payment
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={cancel.isPending}
            disabled={reason.trim().length < 5}
          >
            {action === 'VOID' ? 'Void payment' : 'Reverse payment'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert tone="warning">
          {money(payment.amountReceived)} from {payment.student.fullName}. The receipt will be
          marked cancelled and the dues become payable again. The payment stays on record — nothing
          is deleted.
        </Alert>
        <Field label="What happened?" htmlFor="cp-action">
          <Select
            id="cp-action"
            value={action}
            onChange={(e) => setAction(e.target.value as 'VOID' | 'REVERSED')}
          >
            <option value="VOID">Void — entered by mistake</option>
            <option value="REVERSED">Reverse — money returned / not received</option>
          </Select>
        </Field>
        <Field label="Reason" htmlFor="cp-reason" required>
          <textarea
            id="cp-reason"
            rows={2}
            className={textarea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// --- Collect fees --------------------------------------------------------------------------

export function CollectFeesPage() {
  const [params, setParams] = useSearchParams();
  const studentId = params.get('studentId') ?? '';
  const yearId = params.get('year') ?? undefined;
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const results = useStudents({ search: debounced, pageSize: 8 });
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Collect fees"
        description="Find the student, choose what is being paid, and issue the receipt."
      />
      {!studentId ? (
        <Card className="p-5">
          <Field label="Find student" htmlFor="cf-search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-muted"
                aria-hidden="true"
              />
              <Input
                id="cf-search"
                type="search"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, admission number or parent phone"
                autoFocus
              />
            </div>
          </Field>
          {debounced && (
            <ul className="mt-3 divide-y divide-gray-100">
              {results.data?.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-surface"
                    onClick={() => setParams({ studentId: s.id })}
                  >
                    <span>
                      <span className="font-medium text-ink">{s.fullName}</span>{' '}
                      <span className="text-sm text-ink-muted">· {s.admissionNumber}</span>
                    </span>
                    <span className="text-sm text-ink-muted">
                      {s.enrolment
                        ? `${s.enrolment.className} – ${s.enrolment.sectionName}`
                        : 'Not enrolled'}
                    </span>
                  </button>
                </li>
              ))}
              {results.data && !results.data.items.length && (
                <li className="py-2 text-sm text-ink-muted">No students found.</li>
              )}
            </ul>
          )}
        </Card>
      ) : (
        <CollectForStudent studentId={studentId} yearId={yearId} onChange={() => setParams({})} />
      )}
    </div>
  );
}

function CollectForStudent({
  studentId,
  yearId,
  onChange,
}: {
  studentId: string;
  yearId?: string;
  onChange: () => void;
}) {
  const ledger = useStudentLedger(studentId, yearId);
  if (ledger.isLoading) return <PageSpinner />;
  if (ledger.isError || !ledger.data) return <Alert>{errorMessages(ledger.error)[0]}</Alert>;
  return <PaymentForm key={ledger.dataUpdatedAt} ledger={ledger.data} onChange={onChange} />;
}

function PaymentForm({ ledger, onChange }: { ledger: StudentLedger; onChange: () => void }) {
  const navigate = useNavigate();
  const record = useRecordPayment();
  const open = useMemo(() => ledger.dues.filter((d) => d.balance > 0), [ledger.dues]);
  const [alloc, setAlloc] = useState<Record<string, string>>(() =>
    Object.fromEntries(open.filter((d) => d.overdue).map((d) => [d.id, String(d.balance)])),
  );
  const [form, setForm] = useState({
    paymentDate: todayIso(),
    paymentMode: 'CASH' as PaymentMode,
    referenceNumber: '',
    bankName: '',
    chequeDate: todayIso(),
    notes: '',
  });
  const [quick, setQuick] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const e = ledger.enrolment;
  const total = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);

  /** Spread an amount over dues, oldest first (the usual counter practice). */
  const autoAllocate = () => {
    let left = Math.round((Number(quick) || 0) * 100);
    const next: Record<string, string> = {};
    for (const d of open) {
      if (left <= 0) break;
      const take = Math.min(left, Math.round(d.balance * 100));
      next[d.id] = String(take / 100);
      left -= take;
    }
    setAlloc(next);
  };

  const submit = async () => {
    setErrs({});
    setError(null);
    const allocations = Object.entries(alloc)
      .filter(([, v]) => Number(v) > 0)
      .map(([dueId, v]) => ({ dueId, amount: Number(v) }));
    try {
      const res = await record.mutateAsync({
        enrolmentId: e!.id,
        paymentDate: form.paymentDate,
        amountReceived: Math.round(total * 100) / 100,
        paymentMode: form.paymentMode,
        referenceNumber: form.referenceNumber,
        bankName: form.bankName,
        chequeDate: form.paymentMode === 'CHEQUE' ? form.chequeDate : '',
        notes: form.notes,
        allocations,
      });
      navigate(`/admin/fees/receipts/${res.paymentId}?new=1`);
    } catch (err) {
      const r = splitFieldErrors(err);
      setErrs(r.fields);
      setError(r.general[0] ?? r.fields.allocations ?? null);
    }
  };

  if (!e) return <Alert>{ledger.student.fullName} is not enrolled in a class.</Alert>;
  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="font-semibold text-brand-navy">{ledger.student.fullName}</p>
          <p className="text-sm text-ink-muted">
            {ledger.student.admissionNumber} · {e.className} – {e.sectionName} ·{' '}
            {e.academicYear.name} · Balance{' '}
            <strong className="text-ink">{money(ledger.totals.balance)}</strong>
            {ledger.totals.overdue > 0 && (
              <span className="text-red-700"> ({money(ledger.totals.overdue)} overdue)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/admin/fees/students/${ledger.student.id}`}
            className="text-sm text-brand-navy hover:underline"
          >
            Full ledger
          </Link>
          <Button size="sm" variant="ghost" onClick={onChange}>
            Change student
          </Button>
        </div>
      </Card>

      {open.length === 0 ? (
        <Alert tone="success">Nothing is outstanding for {e.academicYear.name}.</Alert>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 p-4">
              <h2 className="font-semibold text-brand-navy">What is being paid</h2>
              <div className="flex items-end gap-2">
                <Field label="Amount received (₹)" htmlFor="cf-quick">
                  <Input
                    id="cf-quick"
                    type="number"
                    min={0}
                    step="0.01"
                    value={quick}
                    onChange={(ev) => setQuick(ev.target.value)}
                    className="max-w-[150px]"
                  />
                </Field>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={autoAllocate}
                  disabled={!Number(quick)}
                >
                  Allocate oldest first
                </Button>
              </div>
            </div>
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Fee</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-2 text-right font-medium">Paying now (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {open.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 text-ink">{d.description}</td>
                    <td className={`px-4 py-2 ${d.overdue ? 'text-red-700' : 'text-ink-muted'}`}>
                      {d.dueDate ? formatDate(d.dueDate) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">{money(d.balance)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAlloc((a) => ({ ...a, [d.id]: String(d.balance) }))}
                        >
                          Full
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          max={d.balance}
                          value={alloc[d.id] ?? ''}
                          onChange={(ev) => setAlloc((a) => ({ ...a, [d.id]: ev.target.value }))}
                          className="max-w-[120px] text-right"
                          aria-label={`Paying now for ${d.description}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td className="px-4 py-3 font-semibold" colSpan={3}>
                    Total received
                  </td>
                  <td className="px-4 py-3 text-right text-lg font-bold text-brand-navy">
                    {money(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <Card className="space-y-4 p-5">
            {error && <Alert>{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Payment date" htmlFor="cf-date" error={errs.paymentDate} required>
                <Input
                  id="cf-date"
                  type="date"
                  max={todayIso()}
                  value={form.paymentDate}
                  onChange={(ev) => setForm((f) => ({ ...f, paymentDate: ev.target.value }))}
                />
              </Field>
              <Field label="Mode" htmlFor="cf-mode">
                <Select
                  id="cf-mode"
                  value={form.paymentMode}
                  onChange={(ev) =>
                    setForm((f) => ({ ...f, paymentMode: ev.target.value as PaymentMode }))
                  }
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_MODE_LABELS[m]}
                    </option>
                  ))}
                </Select>
              </Field>
              {form.paymentMode !== 'CASH' && (
                <Field
                  label={
                    form.paymentMode === 'CHEQUE' ? 'Cheque number' : 'Transaction / UTR number'
                  }
                  htmlFor="cf-ref"
                  error={errs.referenceNumber}
                  required
                >
                  <Input
                    id="cf-ref"
                    value={form.referenceNumber}
                    onChange={(ev) => setForm((f) => ({ ...f, referenceNumber: ev.target.value }))}
                  />
                </Field>
              )}
              {form.paymentMode === 'CHEQUE' && (
                <>
                  <Field label="Bank" htmlFor="cf-bank" error={errs.bankName} required>
                    <Input
                      id="cf-bank"
                      value={form.bankName}
                      onChange={(ev) => setForm((f) => ({ ...f, bankName: ev.target.value }))}
                    />
                  </Field>
                  <Field label="Cheque date" htmlFor="cf-cdate" error={errs.chequeDate} required>
                    <Input
                      id="cf-cdate"
                      type="date"
                      value={form.chequeDate}
                      onChange={(ev) => setForm((f) => ({ ...f, chequeDate: ev.target.value }))}
                    />
                  </Field>
                </>
              )}
            </div>
            <Field label="Notes" htmlFor="cf-notes">
              <Input
                id="cf-notes"
                value={form.notes}
                onChange={(ev) => setForm((f) => ({ ...f, notes: ev.target.value }))}
              />
            </Field>
            {errs.amountReceived && <p className="text-sm text-red-600">{errs.amountReceived}</p>}
            <div className="flex items-center justify-end gap-3">
              {form.paymentMode === 'CHEQUE' && (
                <span className="text-xs text-ink-muted">
                  The receipt is issued now, subject to the cheque clearing.
                </span>
              )}
              <Button onClick={submit} loading={record.isPending} disabled={total <= 0}>
                Record {money(total)} & print receipt
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// --- Receipt -------------------------------------------------------------------------------

export function ReceiptPage() {
  const { paymentId = '' } = useParams();
  const [params] = useSearchParams();
  const receipt = useReceipt(paymentId);
  if (receipt.isLoading) return <PageSpinner />;
  if (receipt.isError || !receipt.data) return <Alert>{errorMessages(receipt.error)[0]}</Alert>;
  const r = receipt.data;
  const s = r.snapshot;
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={`/admin/fees/payments`}
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Payments
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print receipt
        </Button>
      </div>
      {params.get('new') && !r.isCancelled && (
        <div className="mb-4 print:hidden">
          <Alert tone="success">Payment recorded — receipt {r.receiptNumber}.</Alert>
        </div>
      )}
      <Card className="relative overflow-hidden p-8 print:border-0 print:shadow-none">
        {r.isCancelled && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="-rotate-12 rounded border-4 border-red-500 px-6 py-2 text-5xl font-bold uppercase text-red-500 opacity-30">
              Cancelled
            </span>
          </div>
        )}
        <div className="border-b border-gray-300 pb-4 text-center">
          <h1 className="text-xl font-bold text-brand-navy">{s.school.name}</h1>
          <p className="text-xs text-ink-muted">{s.school.address}</p>
          <p className="text-xs text-ink-muted">
            {[s.school.phone, s.school.email].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide">Fee receipt</p>
        </div>
        {r.isCancelled && (
          <p className="mt-3 rounded bg-red-50 p-2 text-center text-sm text-red-700" role="status">
            This receipt is cancelled: {r.cancellationReason}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-muted">Receipt no.</dt>
          <dd className="text-right font-mono font-semibold">{s.receiptNumber}</dd>
          <dt className="text-ink-muted">Date</dt>
          <dd className="text-right">{formatDate(s.payment.date)}</dd>
          <dt className="text-ink-muted">Student</dt>
          <dd className="text-right font-medium">{s.student.name}</dd>
          <dt className="text-ink-muted">Admission no.</dt>
          <dd className="text-right">{s.student.admissionNumber}</dd>
          <dt className="text-ink-muted">Class</dt>
          <dd className="text-right">
            {s.student.className} – {s.student.sectionName}
            {s.student.rollNumber ? ` (Roll ${s.student.rollNumber})` : ''} · {s.academicYear}
          </dd>
          {s.guardianName && (
            <>
              <dt className="text-ink-muted">Parent / guardian</dt>
              <dd className="text-right">{s.guardianName}</dd>
            </>
          )}
        </dl>
        <table className="mt-5 w-full text-sm">
          <thead className="border-y border-gray-300 text-left text-xs uppercase text-ink-muted">
            <tr>
              <th className="py-2 font-medium">Particulars</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1.5">{l.description}</td>
                <td className="py-1.5 text-right">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-300">
            <tr>
              <td className="py-2 font-semibold">Total</td>
              <td className="py-2 text-right text-lg font-bold">{money(s.total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-1 text-sm italic">{s.totalInWords}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <p>
            <span className="text-ink-muted">Paid by:</span> {PAYMENT_MODE_LABELS[s.payment.mode]}
            {s.payment.referenceNumber &&
              ` · ${s.payment.mode === 'CHEQUE' ? 'Cheque' : 'Ref'} ${s.payment.referenceNumber}`}
            {s.payment.bankName && ` · ${s.payment.bankName}`}
            {s.payment.chequeDate && ` · dated ${formatDate(s.payment.chequeDate)}`}
          </p>
          <p className="text-right">
            <span className="text-ink-muted">Balance after this payment:</span>{' '}
            {money(s.balanceAfter)}
          </p>
        </div>
        {s.payment.mode === 'CHEQUE' && (
          <p className="mt-2 text-xs text-ink-muted">Subject to realisation of the cheque.</p>
        )}
        <div className="mt-10 flex items-end justify-between text-xs text-ink-muted">
          <span>
            Issued {formatDateTime(s.issuedAt)} · {s.paymentNumber}
          </span>
          <span className="border-t border-gray-400 px-6 pt-1">Received by {s.issuedBy}</span>
        </div>
      </Card>
    </div>
  );
}
