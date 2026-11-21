import { PERMISSIONS, REPORT_EXPORTS, type ReportExportKey } from '@school/shared';
import { useState, type ReactNode } from 'react';
import { Card, EmptyState, Field, Input, PageHeader, PageSpinner } from '@/components/ui';
import { YearPicker } from '@/features/admin/components/YearPicker';
import { useYearSelection } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { todayIso } from '@/lib/format';
import { ExportButtons } from '../components/ExportButtons';
import { useStrength } from '../reports-api';

const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={`px-4 py-3 font-medium ${right ? 'text-right' : ''}`}>{children}</th>
);
const Td = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <td className={`px-4 py-2 ${right ? 'text-right tabular-nums' : ''}`}>{children}</td>
);

/** Reports hub: class strength on screen, and every approved download in one place. */
export function ReportsPage() {
  const { can } = useAuth();
  const { years, yearId, setYearId } = useYearSelection();
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const strength = useStrength(yearId, can(PERMISSIONS.STUDENTS_READ) && !!yearId);

  const rows: {
    key: ReportExportKey;
    note?: string;
    params?: Record<string, string>;
    inputs?: ReactNode;
  }[] = [
    {
      key: 'students',
      note: 'All students with class, guardian and phone',
      params: { academicYearId: yearId },
    },
    {
      key: 'strength',
      note: 'Boys, girls, joiners, leavers and transport per section',
      params: { academicYearId: yearId },
    },
    { key: 'staff', note: 'Every staff record with contact details' },
    {
      key: 'attendance-daily',
      params: { date },
      inputs: (
        <Field label="Date" htmlFor="rp-date">
          <Input id="rp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      ),
    },
    {
      key: 'attendance-monthly',
      params: { month },
      inputs: (
        <Field label="Month" htmlFor="rp-month">
          <Input
            id="rp-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
      ),
    },
    {
      key: 'fee-dues',
      note: 'Billed, concessions, paid and balance per student',
      params: { academicYearId: yearId },
    },
    { key: 'payments', note: 'Receipts in the period (below)', params: { from, to } },
    {
      key: 'fee-concessions',
      note: 'Concessions, discounts, waivers and fines in the period (below)',
      params: { from, to },
    },
    { key: 'inventory', note: 'Asset register' },
    { key: 'transport-riders', note: 'Students on each route today' },
    { key: 'complaints', note: 'Complaint register' },
    { key: 'enquiries', note: 'Admission enquiries' },
  ];
  const visible = rows.filter((r) => can(REPORT_EXPORTS[r.key].permission));
  const s = strength.data;

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Reports & exports"
        description="Download reports as CSV or Excel. Every download is recorded in the audit log. Printable documents (receipts, report cards, payslips, certificates) can be saved as PDF from their print buttons."
        actions={<YearPicker yearId={yearId} onChange={setYearId} years={years.data} />}
      />

      {can(PERMISSIONS.STUDENTS_READ) && (
        <Card className="mb-6 overflow-x-auto">
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <h2 className="font-semibold text-brand-navy">
              Class strength {s?.academicYear ? `— ${s.academicYear.name}` : ''}
            </h2>
            <ExportButtons report="strength" params={{ academicYearId: yearId }} />
          </div>
          {strength.isLoading ? (
            <PageSpinner />
          ) : !s?.rows.length ? (
            <EmptyState title="No sections in this year" />
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <Th>Class</Th>
                  <Th>Class teacher</Th>
                  <Th right>Boys</Th>
                  <Th right>Girls</Th>
                  <Th right>Other</Th>
                  <Th right>Total</Th>
                  <Th right>Capacity</Th>
                  <Th right>Joined</Th>
                  <Th right>Left</Th>
                  <Th right>Transport</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {s.rows.map((r) => (
                  <tr key={r.sectionId}>
                    <Td>
                      {r.className} – {r.sectionName}
                    </Td>
                    <Td>{r.classTeacher ?? '—'}</Td>
                    <Td right>{r.boys}</Td>
                    <Td right>{r.girls}</Td>
                    <Td right>{r.other}</Td>
                    <Td right>
                      <strong>{r.total}</strong>
                    </Td>
                    <Td right>{r.capacity ?? '—'}</Td>
                    <Td right>{r.newAdmissions}</Td>
                    <Td right>{r.left}</Td>
                    <Td right>{r.transport}</Td>
                  </tr>
                ))}
                <tr className="bg-surface font-semibold">
                  <Td>Total</Td>
                  <Td />
                  <Td right>{s.totals.boys}</Td>
                  <Td right>{s.totals.girls}</Td>
                  <Td right>{s.totals.other}</Td>
                  <Td right>{s.totals.total}</Td>
                  <Td right />
                  <Td right>{s.totals.newAdmissions}</Td>
                  <Td right>{s.totals.left}</Td>
                  <Td right>{s.totals.transport}</Td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-100 p-4">
          <h2 className="font-semibold text-brand-navy">Downloads</h2>
          <div className="flex flex-wrap gap-3">
            <Field label="Period from" htmlFor="rp-from">
              <Input
                id="rp-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="to" htmlFor="rp-to">
              <Input id="rp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        </div>
        {!visible.length ? (
          <EmptyState
            title="No reports available"
            description="Your role does not include any report permissions."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((r) => (
              <li key={r.key} className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
                <div>
                  <div className="font-medium text-ink">{REPORT_EXPORTS[r.key].label}</div>
                  {r.note && <div className="text-xs text-ink-muted">{r.note}</div>}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  {r.inputs}
                  <ExportButtons report={r.key} params={r.params} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-gray-100 p-4 text-xs text-ink-muted">
          Exam results, the payroll register and the class attendance register are downloaded from
          their own screens (Examinations → results, Payroll → month, Attendance → Class Register).
        </p>
      </Card>
    </div>
  );
}
