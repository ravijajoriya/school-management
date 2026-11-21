import {
  ATTENDANCE_LOW_THRESHOLD,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_SHORT,
  type AttendanceStatus,
  type SectionRegister,
} from '@school/shared';
import { Printer } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, PageSpinner } from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useSectionRegister, useStudentAttendance } from '../attendance-api';

const CELL: Record<AttendanceStatus, string> = {
  PRESENT: 'text-green-700',
  ABSENT: 'bg-red-50 font-semibold text-red-700',
  LATE: 'bg-amber-50 font-semibold text-amber-700',
};

const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'narrow', timeZone: 'UTC' });

export function PercentBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-muted">—</span>;
  return <Badge tone={value < ATTENDANCE_LOW_THRESHOLD ? 'red' : 'green'}>{value}%</Badge>;
}

/** Monthly register for a section: students × days (P / A / L) with totals. Printable. */
export function RegisterPanel({ sectionId, month }: { sectionId: string; month: string }) {
  const register = useSectionRegister(sectionId, month);
  if (!sectionId) return null;
  if (register.isLoading) return <PageSpinner />;
  if (register.isError || !register.data) return <Alert>{errorMessages(register.error)[0]}</Alert>;
  return <RegisterTable register={register.data} />;
}

function RegisterTable({ register }: { register: SectionRegister }) {
  const working = new Set(register.workingDays);
  return (
    <Card className="print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
        <div>
          <h2 className="font-semibold text-brand-navy">
            {register.section.className} – {register.section.sectionName} ·{' '}
            {new Date(`${register.month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </h2>
          <p className="text-xs text-ink-muted">
            {register.workingDays.length} day(s) marked · P = present, A = absent, L = late (counts
            as present) · below {ATTENDANCE_LOW_THRESHOLD}% highlighted
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.print()}
          className="print:hidden"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </Button>
      </div>
      {register.rows.length === 0 ? (
        <EmptyState title="No students in this section for this month" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="text-ink-muted">
                <th className="sticky left-0 bg-white px-2 py-2 text-left font-medium">Roll</th>
                <th className="sticky left-10 bg-white px-2 py-2 text-left font-medium">Student</th>
                {register.days.map((d) => (
                  <th
                    key={d}
                    className={`w-7 px-0.5 py-1 text-center font-medium ${working.has(d) ? '' : 'text-gray-300'}`}
                  >
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[10px]">{weekday.format(new Date(`${d}T00:00:00Z`))}</div>
                  </th>
                ))}
                <th className="px-2 py-2 font-medium">P</th>
                <th className="px-2 py-2 font-medium">A</th>
                <th className="px-2 py-2 font-medium">L</th>
                <th className="px-2 py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {register.rows.map((r) => (
                <tr key={r.enrolmentId} aria-label={r.fullName}>
                  <td className="sticky left-0 bg-white px-2 py-1.5 text-ink-muted">
                    {r.rollNumber ?? ''}
                  </td>
                  <td className="sticky left-10 whitespace-nowrap bg-white px-2 py-1.5 font-medium text-ink">
                    {r.fullName}
                  </td>
                  {register.days.map((d) => {
                    const s = r.days[d];
                    return (
                      <td
                        key={d}
                        className={`px-0.5 py-1.5 text-center ${s ? CELL[s] : ''}`}
                        title={s ? `${formatDate(d)}: ${ATTENDANCE_STATUS_LABELS[s]}` : undefined}
                      >
                        {s ? ATTENDANCE_STATUS_SHORT[s] : ''}
                      </td>
                    );
                  })}
                  <td className="px-2 text-center">{r.present}</td>
                  <td className="px-2 text-center">{r.absent}</td>
                  <td className="px-2 text-center">{r.late}</td>
                  <td className="px-2 text-center">
                    <PercentBadge value={r.percentage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Attendance summary on a student's page: totals, month by month, recent absences. */
export function StudentAttendanceCard({ studentId }: { studentId: string }) {
  const summary = useStudentAttendance(studentId);
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-brand-navy">Attendance</h2>
      {summary.isLoading ? (
        <PageSpinner />
      ) : summary.isError || !summary.data ? (
        <Alert>{errorMessages(summary.error)[0]}</Alert>
      ) : !summary.data.enrolment ? (
        <p className="mt-2 text-sm text-ink-muted">Not enrolled in a class yet.</p>
      ) : summary.data.totals.marked === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          No attendance marked yet for {summary.data.enrolment.academicYear.name}.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>
              {summary.data.enrolment.academicYear.name}:{' '}
              <PercentBadge value={summary.data.totals.percentage} />
            </span>
            <span className="text-ink-muted">
              Present {summary.data.totals.present} · Absent {summary.data.totals.absent} · Late{' '}
              {summary.data.totals.late} · {summary.data.totals.marked} days marked
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.data.months.map((m) => (
              <div key={m.month} className="rounded-md border border-gray-200 px-3 py-2 text-xs">
                <p className="font-medium text-ink">
                  {new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
                    month: 'short',
                    year: '2-digit',
                    timeZone: 'UTC',
                  })}
                </p>
                <PercentBadge value={m.percentage} />
              </div>
            ))}
          </div>
          {summary.data.recent.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase text-ink-muted">Absent or late</h3>
              <ul className="mt-1 divide-y divide-gray-100 text-sm">
                {summary.data.recent.map((r) => (
                  <li key={r.date} className="flex gap-3 py-1">
                    <span className="w-28 text-ink-muted">{formatDate(r.date)}</span>
                    <Badge tone={r.status === 'ABSENT' ? 'red' : 'amber'}>
                      {ATTENDANCE_STATUS_LABELS[r.status]}
                    </Badge>
                    {r.remarks && <span className="text-ink-muted">{r.remarks}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
