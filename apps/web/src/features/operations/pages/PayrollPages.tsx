import {
  COMPONENT_TYPES,
  PAYROLL_STATUS_LABELS,
  PERMISSIONS,
  formatRupees,
  type ComponentType,
  type PayrollRecordItem,
  type PayrollRunItem,
  type PayrollStatus,
  type SalaryComponentItem,
} from '@school/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageSpinner,
  Select,
} from '@/components/ui';
import { useEmployeeOptions } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { formatDate, formatDateTime, todayIso } from '@/lib/format';
import { Td, Th } from '../components/OpsParts';
import { monthName, tbodyClass, theadClass, useFormErrors } from '../ops-utils';
import {
  useMyPayslips,
  usePayrollAction,
  usePayrollRun,
  usePayrollRuns,
  usePayslip,
  useSalaryComponents,
  useSaveSalaryComponent,
} from '../operations-api';
import { ExportButtons } from '@/features/reports/components/ExportButtons';
import { useConfirm, usePrompt } from '@/lib/dialogs';

const STATUS_TONE: Record<PayrollStatus, 'amber' | 'navy' | 'green'> = {
  DRAFT: 'amber',
  APPROVED: 'navy',
  PAID: 'green',
};

// --- Runs ------------------------------------------------------------------------------------

export function PayrollRunsPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.PAYROLL_MANAGE);
  const runs = usePayrollRuns();
  const action = usePayrollAction();
  const navigate = useNavigate();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setError(null);
    try {
      const run = await action.mutateAsync({ kind: 'create', month });
      if (run) navigate(`/admin/payroll/${run.id}`);
    } catch (e) {
      setError(errorMessages(e)[0].replace(/^month: /, ''));
    }
  };
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Payroll"
        description="Monthly salaries. Each month starts from the previous month's amounts; edit what changed, approve, then mark as paid."
        actions={
          <Link
            to="/admin/payroll/components"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-ink hover:bg-gray-50"
          >
            Salary components
          </Link>
        }
      />
      {manage && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Month" htmlFor="pr-month">
              <Input
                id="pr-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </Field>
            <Button onClick={create} loading={action.isPending} disabled={!month}>
              Prepare payroll
            </Button>
          </div>
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
        </Card>
      )}
      <Card>
        {runs.isLoading ? (
          <PageSpinner />
        ) : !runs.data?.length ? (
          <EmptyState title="No payroll yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Month</Th>
                <Th right>Staff</Th>
                <Th right>Net pay</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      to={`/admin/payroll/${r.id}`}
                      className="font-medium text-brand-navy hover:underline"
                    >
                      {monthName(r.month)}
                    </Link>
                  </Td>
                  <Td right>{r.employees}</Td>
                  <Td right>{formatRupees(r.net)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>{PAYROLL_STATUS_LABELS[r.status]}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export function PayrollRunPage() {
  const prompt = usePrompt();
  const confirm = useConfirm();
  const { id = '' } = useParams();
  const { can } = useAuth();
  const run = usePayrollRun(id);
  const action = usePayrollAction();
  const staff = useEmployeeOptions();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<PayrollRecordItem | null>(null);
  const [adding, setAdding] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (run.isLoading) return <PageSpinner />;
  if (!run.data) return <Alert>{errorMessages(run.error)[0]}</Alert>;
  const r = run.data;
  const draft = r.status === 'DRAFT';
  const manage = can(PERMISSIONS.PAYROLL_MANAGE) && draft;
  const approve = can(PERMISSIONS.PAYROLL_APPROVE);
  const doAction = async (a: Parameters<typeof action.mutateAsync>[0], ok: string) => {
    setMessage(null);
    try {
      await action.mutateAsync(a);
      if (a.kind === 'delete') navigate('/admin/payroll');
      else setMessage({ tone: 'success', text: ok });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessages(e)[0] });
    }
  };
  const missing = staff.data?.filter((s) => !r.records.some((x) => x.employee.id === s.id)) ?? [];
  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/admin/payroll"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Payroll
        </Link>
        <div className="flex flex-wrap gap-2">
          <ExportButtons report="payroll-register" params={{ runId: r.id }} />
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Print register
          </Button>
          {draft && can(PERMISSIONS.PAYROLL_MANAGE) && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Delete this draft payroll?',
                    confirmLabel: 'Delete',
                    tone: 'danger',
                  })
                )
                  void doAction({ kind: 'delete', runId: r.id }, '');
              }}
            >
              Delete draft
            </Button>
          )}
          {approve && draft && (
            <Button
              onClick={async () => {
                if (
                  await confirm({
                    title: `Approve payroll for ${monthName(r.month)}?`,
                    message: `It can no longer be edited unless reopened.`,
                    confirmLabel: 'Approve',
                  })
                )
                  void doAction(
                    { kind: 'approve', runId: r.id },
                    'Payroll approved. Staff can now see their payslips.',
                  );
              }}
            >
              Approve
            </Button>
          )}
          {approve && r.status === 'APPROVED' && (
            <>
              <Button
                variant="secondary"
                onClick={async () => {
                  const reason = await prompt({
                    title: 'Reopen payroll',
                    message:
                      'The month goes back to draft so entries can be corrected. Staff stop seeing these payslips until it is approved again.',
                    label: 'Reason for reopening',
                    confirmLabel: 'Reopen',
                  });
                  if (reason)
                    void doAction(
                      { kind: 'reopen', runId: r.id, reason },
                      'Payroll reopened for changes.',
                    );
                }}
              >
                Reopen
              </Button>
              <Button
                onClick={async () => {
                  if (
                    await confirm({
                      title: 'Mark as paid?',
                      message: 'A paid payroll is final.',
                      confirmLabel: 'Mark as paid',
                    })
                  )
                    void doAction({ kind: 'pay', runId: r.id }, 'Payroll marked as paid.');
                }}
              >
                Mark as paid
              </Button>
            </>
          )}
        </div>
      </div>
      <PageHeader
        title={`Payroll — ${monthName(r.month)}`}
        description={`${formatDate(r.periodStart)} to ${formatDate(r.periodEnd)} · prepared by ${r.createdBy}${r.approvedBy ? ` · approved by ${r.approvedBy}` : ''}${r.paidAt ? ` · paid ${formatDateTime(r.paidAt)}` : ''}`}
        actions={<Badge tone={STATUS_TONE[r.status]}>{PAYROLL_STATUS_LABELS[r.status]}</Badge>}
      />
      {message && (
        <div className="mb-4 print:hidden">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Staff', r.totals.employees.toString()],
          ['Gross', formatRupees(r.totals.gross)],
          ['Deductions', formatRupees(r.totals.deductions)],
          ['Net pay', formatRupees(r.totals.net)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
            <div className="text-xl font-bold text-brand-navy">{value}</div>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto print:border-0 print:shadow-none">
        <table className="min-w-full text-sm">
          <thead className={theadClass}>
            <tr>
              <Th>Staff member</Th>
              <Th right>Gross</Th>
              <Th right>Deductions</Th>
              <Th right>Net pay</Th>
              <Th />
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {r.records.map((rec) => (
              <tr key={rec.id}>
                <Td>
                  <div className="font-medium text-ink">{rec.employee.fullName}</div>
                  <div className="text-xs text-ink-muted">
                    {rec.employee.employeeCode} · {rec.employee.designation}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {rec.lines.map((l) => `${l.name} ${formatRupees(l.amount)}`).join(' · ') ||
                      'No amounts entered'}
                  </div>
                </Td>
                <Td right>{formatRupees(rec.gross)}</Td>
                <Td right>{formatRupees(rec.deductions)}</Td>
                <Td right className="font-semibold">
                  {formatRupees(rec.net)}
                </Td>
                <Td right>
                  <div className="flex justify-end gap-1 print:hidden">
                    {manage && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(rec)}>
                        Edit
                      </Button>
                    )}
                    {manage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: `Remove ${rec.employee.fullName} from this payroll?`,
                              confirmLabel: 'Remove',
                              tone: 'danger',
                            })
                          )
                            void doAction(
                              { kind: 'remove', runId: r.id, recordId: rec.id },
                              'Removed.',
                            );
                        }}
                      >
                        Remove
                      </Button>
                    )}
                    <Link
                      to={`/admin/payroll/payslips/${rec.id}`}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-brand-gold-light"
                    >
                      Payslip
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {manage && missing.length > 0 && (
        <Card className="mt-4 p-4 print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Add a staff member" htmlFor="pr-add">
              <Select id="pr-add" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose…</option>
                {missing.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.designation})
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              disabled={!adding}
              onClick={() => {
                void doAction({ kind: 'add', runId: r.id, employeeId: adding }, 'Added.');
                setAdding('');
              }}
            >
              Add
            </Button>
          </div>
        </Card>
      )}
      {editing && <RecordModal run={r} record={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RecordModal({
  run,
  record,
  onClose,
}: {
  run: PayrollRunItem;
  record: PayrollRecordItem;
  onClose: () => void;
}) {
  const components = useSalaryComponents();
  const action = usePayrollAction();
  const errs = useFormErrors();
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(record.lines.map((l) => [l.salaryComponentId, l.amount.toString()])),
  );
  const visible = (components.data ?? []).filter((c) => c.isActive || amounts[c.id]);
  const num = (id: string) => Number(amounts[id] || 0) || 0;
  const total = (t: ComponentType) =>
    visible.filter((c) => c.componentType === t).reduce((s, c) => s + num(c.id), 0);
  const submit = async () => {
    errs.reset();
    try {
      await action.mutateAsync({
        kind: 'record',
        runId: run.id,
        recordId: record.id,
        body: {
          lines: visible
            .filter((c) => amounts[c.id])
            .map((c) => ({ salaryComponentId: c.id, amount: amounts[c.id] })),
        },
      });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  const column = (t: ComponentType, title: string) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <div className="space-y-2">
        {visible
          .filter((c) => c.componentType === t)
          .map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_130px] items-center gap-2">
              <label htmlFor={`amt-${c.id}`} className="text-sm">
                {c.name}
              </label>
              <Input
                id={`amt-${c.id}`}
                inputMode="decimal"
                value={amounts[c.id] ?? ''}
                onChange={(e) => setAmounts({ ...amounts, [c.id]: e.target.value })}
              />
            </div>
          ))}
      </div>
      <p className="mt-2 text-right text-sm font-semibold">{formatRupees(total(t))}</p>
    </div>
  );
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`${record.employee.fullName} — ${monthName(run.month)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={action.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(errs.general || errs.fields.lines) && <Alert>{errs.general ?? errs.fields.lines}</Alert>}
        {components.isLoading ? (
          <PageSpinner />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {column('EARNING', 'Earnings')}
            {column('DEDUCTION', 'Deductions')}
          </div>
        )}
        <p className="rounded-md bg-surface p-3 text-right text-sm">
          Net pay: <strong>{formatRupees(total('EARNING') - total('DEDUCTION'))}</strong>
        </p>
        <p className="text-xs text-ink-muted">
          PF, ESI, professional tax and TDS are entered as amounts; nothing is calculated
          automatically.
        </p>
      </div>
    </Modal>
  );
}

// --- Components ------------------------------------------------------------------------------

export function SalaryComponentsPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.PAYROLL_MANAGE);
  const components = useSalaryComponents();
  const [editing, setEditing] = useState<SalaryComponentItem | 'new' | null>(null);
  return (
    <div className="max-w-3xl">
      <Link
        to="/admin/payroll"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Payroll
      </Link>
      <PageHeader
        title="Salary components"
        description="The earning and deduction heads used on payslips."
        actions={manage && <Button onClick={() => setEditing('new')}>New component</Button>}
      />
      <Card>
        {components.isLoading ? (
          <PageSpinner />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {components.data?.map((c) => (
                <tr key={c.id}>
                  <Td>{c.name}</Td>
                  <Td>{c.componentType === 'EARNING' ? 'Earning' : 'Deduction'}</Td>
                  <Td>
                    <Badge tone={c.isActive ? 'green' : 'gray'}>
                      {c.isActive ? 'In use' : 'Not in use'}
                    </Badge>
                  </Td>
                  <Td right>
                    {manage && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <ComponentModal
          component={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ComponentModal({
  component,
  onClose,
}: {
  component: SalaryComponentItem | null;
  onClose: () => void;
}) {
  const save = useSaveSalaryComponent();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    name: component?.name ?? '',
    componentType: component?.componentType ?? ('EARNING' as ComponentType),
    isActive: component?.isActive ?? true,
  });
  const submit = async () => {
    errs.reset();
    try {
      await save.mutateAsync({ id: component?.id, ...form });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={component ? `Edit ${component.name}` : 'New salary component'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        <Field label="Name" htmlFor="sc-name" error={errs.fields.name} required>
          <Input
            id="sc-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Type" htmlFor="sc-type">
          <Select
            id="sc-type"
            value={form.componentType}
            onChange={(e) => setForm({ ...form, componentType: e.target.value as ComponentType })}
          >
            {COMPONENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'EARNING' ? 'Earning' : 'Deduction'}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          label="In use (shown when entering pay)"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
        />
      </div>
    </Modal>
  );
}

// --- Payslips --------------------------------------------------------------------------------

function PayslipView({ recordId, mine }: { recordId: string; mine: boolean }) {
  const slip = usePayslip(recordId, mine);
  if (slip.isLoading) return <PageSpinner />;
  if (!slip.data) return <Alert>{errorMessages(slip.error)[0]}</Alert>;
  const s = slip.data;
  const rows = Math.max(s.earnings.length, s.deductions.length);
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to={mine ? '/teacher/payslips' : '/admin/payroll'}
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {mine ? 'My payslips' : 'Payroll'}
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print payslip
        </Button>
      </div>
      <Card className="relative p-8 print:border-0 print:shadow-none">
        {s.status === 'DRAFT' && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="-rotate-12 rounded border-4 border-amber-500 px-6 py-2 text-5xl font-bold uppercase text-amber-500 opacity-30">
              Draft
            </span>
          </div>
        )}
        <div className="border-b border-gray-300 pb-4 text-center">
          <h1 className="text-xl font-bold text-brand-navy">{s.school.name}</h1>
          <p className="text-xs text-ink-muted">{s.school.address}</p>
          <p className="mt-3 text-sm font-semibold uppercase tracking-wide">
            Payslip for {monthName(s.month)}
          </p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-muted">Name</dt>
          <dd className="text-right font-medium">{s.employee.fullName}</dd>
          <dt className="text-ink-muted">Employee code</dt>
          <dd className="text-right">{s.employee.employeeCode}</dd>
          <dt className="text-ink-muted">Designation</dt>
          <dd className="text-right">
            {s.employee.designation}
            {s.employee.department && `, ${s.employee.department}`}
          </dd>
          <dt className="text-ink-muted">Date of joining</dt>
          <dd className="text-right">{formatDate(s.employee.joiningDate)}</dd>
          <dt className="text-ink-muted">Pay period</dt>
          <dd className="text-right">
            {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
          </dd>
        </dl>
        <table className="mt-6 min-w-full border border-gray-300 text-sm">
          <thead className="bg-surface">
            <tr>
              <th className="border border-gray-300 px-3 py-2 text-left">Earnings</th>
              <th className="border border-gray-300 px-3 py-2 text-right">₹</th>
              <th className="border border-gray-300 px-3 py-2 text-left">Deductions</th>
              <th className="border border-gray-300 px-3 py-2 text-right">₹</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <td className="border border-gray-300 px-3 py-1.5">{s.earnings[i]?.name}</td>
                <td className="border border-gray-300 px-3 py-1.5 text-right">
                  {s.earnings[i] && formatRupees(s.earnings[i].amount)}
                </td>
                <td className="border border-gray-300 px-3 py-1.5">{s.deductions[i]?.name}</td>
                <td className="border border-gray-300 px-3 py-1.5 text-right">
                  {s.deductions[i] && formatRupees(s.deductions[i].amount)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border border-gray-300 px-3 py-2">Gross earnings</td>
              <td className="border border-gray-300 px-3 py-2 text-right">
                {formatRupees(s.gross)}
              </td>
              <td className="border border-gray-300 px-3 py-2">Total deductions</td>
              <td className="border border-gray-300 px-3 py-2 text-right">
                {formatRupees(s.totalDeductions)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-right text-lg font-bold text-brand-navy">
          Net pay: {formatRupees(s.net)}
        </p>
        <p className="text-right text-sm italic text-ink-muted">{s.netInWords}</p>
        <p className="mt-10 text-xs text-ink-muted">This is a computer-generated payslip.</p>
      </Card>
    </div>
  );
}

export function PayslipPage() {
  const { recordId = '' } = useParams();
  return <PayslipView recordId={recordId} mine={false} />;
}

export function MyPayslipPage() {
  const { recordId = '' } = useParams();
  return <PayslipView recordId={recordId} mine />;
}

export function MyPayslipsPage() {
  const slips = useMyPayslips();
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="My payslips"
        description="Your payslips once the month's payroll is approved."
      />
      <Card>
        {slips.isLoading ? (
          <PageSpinner />
        ) : slips.isError ? (
          <div className="p-4">
            <Alert tone="info">{errorMessages(slips.error)[0]}</Alert>
          </div>
        ) : !slips.data?.length ? (
          <EmptyState title="No payslips yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Month</Th>
                <Th right>Net pay</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {slips.data.map((p) => (
                <tr key={p.id}>
                  <Td>{monthName(p.month)}</Td>
                  <Td right>{formatRupees(p.net)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[p.status]}>{PAYROLL_STATUS_LABELS[p.status]}</Badge>
                  </Td>
                  <Td right>
                    <Link
                      to={`/teacher/payslips/${p.id}`}
                      className="text-sm font-medium text-brand-navy hover:underline"
                    >
                      View
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
