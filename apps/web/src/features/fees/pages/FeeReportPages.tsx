import {
  ADJUSTMENT_TYPE_LABELS,
  ADJUSTMENT_TYPES,
  CHEQUE_STATUS_LABELS,
  CHEQUE_STATUSES,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
  PERMISSIONS,
  formatRupees,
  type ChequeStatus,
  type PaymentListItem,
  type PaymentMode,
  type PaymentStatus,
} from '@school/shared';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageSpinner,
  Pagination,
  Select,
} from '@/components/ui';
import { YearPicker } from '@/features/admin/components/YearPicker';
import { useSectionOptions, useYearSelection } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { formatDate, todayIso } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  useCollectionReport,
  useConcessionReport,
  useDuesReport,
  usePaymentActions,
  usePayments,
} from '../fees-api';
import { CancelPaymentModal } from './FeeLedgerPages';
import { usePagination } from '@/lib/use-pagination';

const money = (n: number) => formatRupees(n);
const firstOfMonth = () => `${todayIso().slice(0, 7)}-01`;

// --- Payments list -------------------------------------------------------------------------

export function PaymentsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const [paymentMode, setMode] = useState<PaymentMode | ''>('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [chequeStatus, setCheque] = useState<ChequeStatus | ''>('');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const list = usePayments({
    search: useDebouncedValue(search),
    from,
    to,
    paymentMode: paymentMode || undefined,
    status: status || undefined,
    chequeStatus: chequeStatus || undefined,
    page,
    pageSize,
  });
  const actions = usePaymentActions();
  const [cancelling, setCancelling] = useState<PaymentListItem | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessages(e)[0] });
    }
  };

  return (
    <div>
      <PageHeader
        title="Payments & receipts"
        description="Every payment recorded, with its receipt. Void or reversed payments stay listed."
        actions={
          can(PERMISSIONS.FEES_COLLECT) && (
            <Link to="/admin/fees/collect">
              <Button>Collect fees</Button>
            </Link>
          )
        }
      />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 p-4">
          <Input
            type="search"
            placeholder="Student, admission no., receipt or cheque no."
            className="max-w-xs"
            value={search}
            onChange={(e) => reset(setSearch)(e.target.value)}
            aria-label="Search payments"
          />
          <Input
            type="date"
            value={from}
            onChange={(e) => reset(setFrom)(e.target.value)}
            aria-label="From"
            className="max-w-[160px]"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => reset(setTo)(e.target.value)}
            aria-label="To"
            className="max-w-[160px]"
          />
          <Select
            value={paymentMode}
            onChange={(e) => reset(setMode)(e.target.value as PaymentMode | '')}
            aria-label="Mode"
            className="max-w-[170px]"
          >
            <option value="">All modes</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => reset(setStatus)(e.target.value as PaymentStatus | '')}
            aria-label="Status"
            className="max-w-[140px]"
          >
            <option value="">Any status</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select
            value={chequeStatus}
            onChange={(e) => reset(setCheque)(e.target.value as ChequeStatus | '')}
            aria-label="Cheque status"
            className="max-w-[190px]"
          >
            <option value="">Any cheque status</option>
            {CHEQUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CHEQUE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.items.length ? (
          <EmptyState title="No payments match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.data.items.map((p) => (
                  <tr key={p.id} aria-label={p.receiptNumber ?? p.paymentNumber}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/fees/receipts/${p.id}`}
                        className="font-mono text-xs text-brand-navy hover:underline"
                      >
                        {p.receiptNumber}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {formatDate(p.paymentDate)} · {p.recordedBy}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/fees/students/${p.student.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {p.student.fullName}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {p.student.admissionNumber} · {p.student.className} –{' '}
                        {p.student.sectionName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {PAYMENT_MODE_LABELS[p.paymentMode]}
                      {p.referenceNumber && (
                        <div className="text-xs">
                          {p.referenceNumber}
                          {p.bankName ? ` · ${p.bankName}` : ''}
                        </div>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${p.status !== 'POSTED' ? 'text-ink-muted line-through' : ''}`}
                    >
                      {money(p.amountReceived)}
                    </td>
                    <td className="px-4 py-3">
                      {p.status !== 'POSTED' ? (
                        <Badge tone="red">{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                      ) : (
                        <Badge tone="green">Posted</Badge>
                      )}{' '}
                      {p.chequeStatus && (
                        <Badge
                          tone={
                            p.chequeStatus === 'CLEARED'
                              ? 'green'
                              : p.chequeStatus === 'BOUNCED'
                                ? 'red'
                                : 'amber'
                          }
                        >
                          {CHEQUE_STATUS_LABELS[p.chequeStatus]}
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {p.status === 'POSTED' &&
                        p.chequeStatus === 'PENDING' &&
                        can(PERMISSIONS.FEES_COLLECT) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              run(
                                () => actions.cleared.mutateAsync(p.id),
                                `Cheque ${p.referenceNumber} cleared.`,
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
                                  `Cheque ${p.referenceNumber} bounced — the dues are payable again.`,
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
      {cancelling && (
        <CancelPaymentModal payment={cancelling} onClose={() => setCancelling(null)} />
      )}
    </div>
  );
}

// --- Reports -------------------------------------------------------------------------------

type Tab = 'dues' | 'collection' | 'concessions';

export function FeeReportsPage() {
  const [tab, setTab] = useState<Tab>('dues');
  const tabs: [Tab, string][] = [
    ['dues', 'Outstanding dues'],
    ['collection', 'Collection'],
    ['concessions', 'Concessions & fines'],
  ];
  return (
    <div>
      <PageHeader
        title="Fee reports"
        description="Who owes what, what was collected (by day, mode and fee head), and concessions given."
        actions={
          <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
            <Printer className="h-4 w-4" aria-hidden="true" /> Print
          </Button>
        }
      />
      <div role="tablist" className="mb-4 flex gap-2 print:hidden">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === key ? 'bg-brand-navy text-white' : 'bg-white text-ink hover:bg-surface'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'dues' ? (
        <DuesReportView />
      ) : tab === 'collection' ? (
        <CollectionView />
      ) : (
        <ConcessionsView />
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'red' | 'green' }) {
  const color =
    tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : 'text-brand-navy';
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </Card>
  );
}

function DuesReportView() {
  const { years, yearId, setYearId } = useYearSelection();
  const sections = useSectionOptions(yearId);
  const [sectionId, setSectionId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(true);
  const report = useDuesReport({
    academicYearId: yearId,
    sectionId: sectionId || undefined,
    overdueOnly,
  });
  const r = report.data;
  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 print:hidden">
        <YearPicker
          yearId={yearId}
          onChange={(id) => {
            setYearId(id);
            setSectionId('');
          }}
          years={years.data}
        />
        <Select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          aria-label="Class & section"
          className="max-w-[200px]"
        >
          <option value="">All classes</option>
          {sections.options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Checkbox
          label="Only students with overdue fees"
          checked={overdueOnly}
          onChange={(e) => setOverdueOnly(e.target.checked)}
        />
      </Card>
      {report.isLoading ? (
        <PageSpinner />
      ) : !r ? null : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Tile label="Billed" value={money(r.totals.billed)} />
            <Tile label="Concessions" value={money(r.totals.reductions)} />
            <Tile label="Collected" value={money(r.totals.paid)} tone="green" />
            <Tile
              label="Outstanding"
              value={money(r.totals.balance)}
              tone={r.totals.balance > 0 ? 'red' : undefined}
            />
            <Tile
              label="Overdue"
              value={money(r.totals.overdue)}
              tone={r.totals.overdue > 0 ? 'red' : undefined}
            />
          </div>
          <Card className="overflow-x-auto">
            {r.rows.length === 0 ? (
              <EmptyState
                title={
                  overdueOnly
                    ? 'No overdue fees — everyone is up to date'
                    : 'No dues for this selection'
                }
              />
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 font-medium">Parent phone</th>
                    <th className="px-4 py-3 text-right font-medium">Billed</th>
                    <th className="px-4 py-3 text-right font-medium">Paid</th>
                    <th className="px-4 py-3 text-right font-medium">Outstanding</th>
                    <th className="px-4 py-3 text-right font-medium">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.rows.map((row) => (
                    <tr key={row.enrolmentId}>
                      <td className="px-4 py-2">
                        <Link
                          to={`/admin/fees/students/${row.studentId}`}
                          className="font-medium text-brand-navy hover:underline"
                        >
                          {row.fullName}
                        </Link>
                        <div className="text-xs text-ink-muted">{row.admissionNumber}</div>
                      </td>
                      <td className="px-4 py-2 text-ink-muted">
                        {row.className} – {row.sectionName}
                        {row.rollNumber ? ` · ${row.rollNumber}` : ''}
                      </td>
                      <td className="px-4 py-2 text-ink-muted">
                        {row.primaryPhone ? (
                          <a href={`tel:${row.primaryPhone}`} className="hover:underline">
                            {row.primaryPhone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{money(row.billed)}</td>
                      <td className="px-4 py-2 text-right">{money(row.paid)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{money(row.balance)}</td>
                      <td
                        className={`px-4 py-2 text-right ${row.overdue > 0 ? 'font-semibold text-red-700' : 'text-ink-muted'}`}
                      >
                        {money(row.overdue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function DateRange({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <Card className="mb-4 flex flex-wrap items-end gap-3 p-4 print:hidden">
      <Field label="From" htmlFor="rep-from">
        <Input id="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <Field label="To" htmlFor="rep-to">
        <Input id="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
    </Card>
  );
}

function CollectionView() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayIso());
  const report = useCollectionReport(from, to);
  const r = report.data;
  return (
    <>
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {report.isLoading ? (
        <PageSpinner />
      ) : !r ? null : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Collected" value={money(r.total)} tone="green" />
            <Tile label="Receipts" value={String(r.receipts)} />
            <Tile
              label="Cheques awaiting clearance"
              value={`${money(r.chequesPending.total)} (${r.chequesPending.count})`}
            />
            <Tile
              label="Voided / reversed"
              value={`${money(r.cancelled.total)} (${r.cancelled.count})`}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <h3 className="font-semibold text-brand-navy">By payment mode</h3>
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {r.byMode.map((m) => (
                    <tr key={m.paymentMode}>
                      <td className="py-1.5">
                        {PAYMENT_MODE_LABELS[m.paymentMode]}{' '}
                        <span className="text-ink-muted">({m.count})</span>
                      </td>
                      <td className="py-1.5 text-right font-medium">{money(m.total)}</td>
                    </tr>
                  ))}
                  {!r.byMode.length && (
                    <tr>
                      <td className="py-2 text-ink-muted">Nothing collected.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-brand-navy">By fee head</h3>
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {r.byFeeHead.map((h) => (
                    <tr key={h.feeHead}>
                      <td className="py-1.5">{h.feeHead}</td>
                      <td className="py-1.5 text-right font-medium">{money(h.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-brand-navy">By day</h3>
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {r.byDay.map((d) => (
                    <tr key={d.date}>
                      <td className="py-1.5">
                        {formatDate(d.date)} <span className="text-ink-muted">({d.count})</span>
                      </td>
                      <td className="py-1.5 text-right font-medium">{money(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function ConcessionsView() {
  const [from, setFrom] = useState(
    `${todayIso().slice(0, 4)}-04-01` <= todayIso()
      ? `${todayIso().slice(0, 4)}-04-01`
      : `${Number(todayIso().slice(0, 4)) - 1}-04-01`,
  );
  const [to, setTo] = useState(todayIso());
  const [type, setType] = useState('');
  const report = useConcessionReport(from, to, type || undefined);
  const r = report.data;
  return (
    <>
      <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {report.isLoading ? (
        <PageSpinner />
      ) : !r ? null : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ADJUSTMENT_TYPES.map((t) => (
              <Tile key={t} label={ADJUSTMENT_TYPE_LABELS[t]} value={money(r.totals[t])} />
            ))}
          </div>
          <Card className="overflow-x-auto">
            <div className="border-b border-gray-200 p-4 print:hidden">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Type"
                className="max-w-[200px]"
              >
                <option value="">All types</option>
                {ADJUSTMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ADJUSTMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            {r.rows.length === 0 ? (
              <EmptyState title="No concessions or fines in this period" />
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Due · reason</th>
                    <th className="px-4 py-3 font-medium">Approved by</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2 text-ink-muted">{formatDate(row.effectiveDate)}</td>
                      <td className="px-4 py-2">
                        <Link
                          to={`/admin/fees/students/${row.student.id}`}
                          className="font-medium text-brand-navy hover:underline"
                        >
                          {row.student.fullName}
                        </Link>
                        <div className="text-xs text-ink-muted">
                          {row.student.className} – {row.student.sectionName}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone={row.adjustmentType === 'FINE' ? 'amber' : 'navy'}>
                          {ADJUSTMENT_TYPE_LABELS[row.adjustmentType]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-ink-muted">
                        {row.due} · {row.reason}
                      </td>
                      <td className="px-4 py-2 text-ink-muted">{row.approvedBy}</td>
                      <td className="px-4 py-2 text-right font-medium">{money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
