import {
  ATTENDANCE_LOW_THRESHOLD,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_SHORT,
  type AttendanceStatus,
  type RegisterRow,
  type SectionRegister,
} from '@school/shared';
import { CalendarDays, ChevronRight, CircleAlert, Printer, Users } from 'lucide-react';
import { SectionCard } from '@/components/common/SectionCard';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageSpinner } from '@/components/ui';
import { ExportButtons } from '@/features/reports/components/ExportButtons';
import { errorMessages } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useSectionRegister, useStudentAttendance } from '../attendance-api';

/** Day cells as small coloured tiles (P green, L amber, A red). */
const CELL: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-600',
  LATE: 'bg-amber-100 text-amber-700',
};

const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'narrow', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const firstName = (fullName: string) => fullName.split(/\s+/)[0];
const isLow = (r: RegisterRow) => r.percentage !== null && r.percentage < ATTENDANCE_LOW_THRESHOLD;

export function PercentBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-muted">—</span>;
  return <Badge tone={value < ATTENDANCE_LOW_THRESHOLD ? 'red' : 'green'}>{value}%</Badge>;
}

/** CSV / Excel (when allowed) and Print for a section's monthly register. */
export function RegisterActions({ sectionId, month }: { sectionId: string; month: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-5 sm:gap-3 print:hidden [&_button]:py-1.5 [&_button]:text-[13px] sm:[&_button]:py-2 sm:[&_button]:text-sm">
      <ExportButtons report="attendance-register" params={{ sectionId, month }} size="md" />
      <Button onClick={() => window.print()} className="min-w-[7.5rem]">
        <Printer className="h-4 w-4" aria-hidden="true" /> Print
      </Button>
    </div>
  );
}

/**
 * Monthly register for a section: a summary card, then students × days as coloured P / A / L
 * tiles (Roll and Student stay pinned while the days scroll). Phones show first names and end
 * each row with the attendance % (tap it for the student's month summary); larger screens show
 * full names and the P / A / L / % totals. Printable.
 */
export function RegisterPanel({
  sectionId,
  month,
  studentHref,
}: {
  sectionId: string;
  month: string;
  /** Link to a student's record (office); omitted for teachers. */
  studentHref?: (studentId: string) => string;
}) {
  const register = useSectionRegister(sectionId, month);
  if (!sectionId) return null;
  if (register.isLoading) return <PageSpinner />;
  if (register.isError || !register.data) return <Alert>{errorMessages(register.error)[0]}</Alert>;
  return <RegisterTable register={register.data} studentHref={studentHref} />;
}

function RegisterTable({
  register,
  studentHref,
}: {
  register: SectionRegister;
  studentHref?: (studentId: string) => string;
}) {
  const working = new Set(register.workingDays);
  const [onlyLow, setOnlyLow] = useState(false);
  const [open, setOpen] = useState<RegisterRow | null>(null);
  const low = register.rows.filter(isLow);
  const rows = onlyLow ? low : register.rows;
  const title = `${register.section.className} – ${register.section.sectionName} · ${monthLabel(register.month)}`;
  return (
    <div className="space-y-3 sm:space-y-4">
      <Card className="flex items-center gap-2.5 p-3 sm:items-start sm:gap-4 sm:p-5 print:border-0 print:p-0 print:shadow-none">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100 sm:h-12 sm:w-12 sm:rounded-xl print:hidden">
          <Users className="h-[18px] w-[18px] sm:h-6 sm:w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-snug text-brand-navy sm:text-lg">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted sm:mt-1 sm:text-sm sm:leading-relaxed">
            <span className="hidden sm:inline">{register.workingDays.length} day(s) marked · </span>
            P = present, A = absent, L = late (counts as present) · Below {ATTENDANCE_LOW_THRESHOLD}
            % highlighted
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-center rounded-lg bg-blue-50 px-2 py-0.5 text-blue-700 ring-1 ring-blue-100 sm:rounded-xl sm:px-3 sm:py-1.5">
          <strong className="text-[15px] leading-tight sm:text-lg">
            {register.workingDays.length}
          </strong>
          <span className="text-[10px] font-medium sm:text-[11px]">Days</span>
        </span>
      </Card>

      {register.rows.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No students in this section for this month" />
        </Card>
      ) : (
        <Card className="overflow-hidden print:border-0 print:shadow-none">
          <div className="overflow-x-auto">
            <table
              data-grid
              className="min-w-full border-collapse whitespace-nowrap text-[13px] md:text-sm"
            >
              <thead className="bg-surface">
                <tr className="text-ink">
                  <th className="sticky left-0 z-[2] w-8 min-w-8 max-w-8 bg-surface px-1 py-2.5 text-left text-xs font-semibold md:w-14 md:min-w-14 md:max-w-none md:px-3 md:py-3 md:text-sm">
                    Roll
                  </th>
                  <th className="sticky left-8 z-[2] w-[5.75rem] min-w-[5.75rem] max-w-[5.75rem] shadow-[inset_-1px_0_0_rgb(229,231,235)] bg-surface px-1.5 py-2.5 text-left font-semibold md:left-14 md:w-auto md:max-w-none md:px-3 md:py-3">
                    Student
                  </th>
                  {register.days.map((d) => (
                    <th
                      key={d}
                      className={`w-[1.3125rem] min-w-[1.3125rem] px-0 py-1.5 text-center font-semibold md:w-auto md:px-1 md:py-2 ${working.has(d) ? '' : 'text-gray-300'}`}
                    >
                      <div className="text-xs leading-tight md:text-sm">{Number(d.slice(8))}</div>
                      <div
                        className={`text-[10px] font-medium md:text-[11px] ${working.has(d) ? 'text-ink-muted' : ''}`}
                      >
                        {weekday.format(new Date(`${d}T00:00:00Z`))}
                      </div>
                    </th>
                  ))}
                  <th className="hidden px-2 py-3 font-semibold md:table-cell print:table-cell">
                    P
                  </th>
                  <th className="hidden px-2 py-3 font-semibold md:table-cell print:table-cell">
                    A
                  </th>
                  <th className="hidden px-2 py-3 font-semibold md:table-cell print:table-cell">
                    L
                  </th>
                  <th className="hidden px-2 py-3 font-semibold md:table-cell print:table-cell">
                    %
                  </th>
                  <th className="px-2 py-2.5 text-center text-xs font-semibold md:hidden print:hidden">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.enrolmentId} aria-label={r.fullName}>
                    <td className="sticky left-0 z-[1] w-8 min-w-8 max-w-8 bg-white px-1.5 py-2 text-ink-muted md:w-14 md:min-w-14 md:max-w-none md:px-3 md:py-2.5">
                      {r.rollNumber ?? ''}
                    </td>
                    <td className="sticky left-8 z-[1] w-[5.75rem] min-w-[5.75rem] max-w-[5.75rem] shadow-[inset_-1px_0_0_rgb(229,231,235)] bg-white px-1.5 py-2 font-medium text-ink md:left-14 md:w-auto md:max-w-none md:px-3 md:py-2.5">
                      <span className="block truncate" title={r.fullName}>
                        <span className="md:hidden print:hidden">{firstName(r.fullName)}</span>
                        <span className="hidden md:inline print:inline">{r.fullName}</span>
                      </span>
                    </td>
                    {register.days.map((d) => {
                      const st = r.days[d];
                      return (
                        <td
                          key={d}
                          className="px-0 py-1.5 text-center md:px-0.5 md:py-2 lg:px-px"
                          title={
                            st ? `${formatDate(d)}: ${ATTENDANCE_STATUS_LABELS[st]}` : undefined
                          }
                        >
                          {st && (
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-[10.5px] font-bold md:h-7 md:w-7 md:rounded-md md:text-xs lg:h-6 lg:w-6 lg:text-[11px] ${CELL[st]}`}
                            >
                              {ATTENDANCE_STATUS_SHORT[st]}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="hidden px-2 text-center md:table-cell print:table-cell">
                      {r.present}
                    </td>
                    <td className="hidden px-2 text-center md:table-cell print:table-cell">
                      {r.absent}
                    </td>
                    <td className="hidden px-2 text-center md:table-cell print:table-cell">
                      {r.late}
                    </td>
                    <td className="hidden px-2 text-center md:table-cell print:table-cell">
                      <PercentBadge value={r.percentage} />
                    </td>
                    <td className="px-1.5 text-center md:hidden print:hidden">
                      <button
                        type="button"
                        onClick={() => setOpen(r)}
                        className={`inline-flex min-w-[2.75rem] items-center justify-center rounded-md px-1.5 py-1 text-xs font-bold transition-opacity hover:opacity-80 ${
                          r.percentage === null
                            ? 'text-ink-muted'
                            : isLow(r)
                              ? 'bg-red-100 text-red-600'
                              : 'bg-green-100 text-green-700'
                        }`}
                        aria-label={`${r.fullName}: ${r.percentage === null ? 'no' : `${r.percentage}%`} attendance, month summary`}
                      >
                        {r.percentage === null ? '—' : `${r.percentage}%`}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {low.length > 0 && (
        <button
          type="button"
          onClick={() => setOnlyLow((v) => !v)}
          aria-pressed={onlyLow}
          className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-left text-[13px] font-semibold sm:px-4 sm:py-3.5 sm:text-sm text-red-700 ring-1 ring-red-100 transition-colors hover:bg-red-100/70 print:hidden"
        >
          <CircleAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {onlyLow
              ? `Showing ${low.length} student(s) below ${ATTENDANCE_LOW_THRESHOLD}% · show everyone`
              : `${low.length} student(s) below ${ATTENDANCE_LOW_THRESHOLD}% attendance`}
          </span>
          <ChevronRight
            className={`h-5 w-5 shrink-0 transition-transform ${onlyLow ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}

      {open && (
        <StudentMonthSheet
          row={open}
          register={register}
          href={studentHref?.(open.studentId)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** One student's month: totals and the days they were absent or late. */
function StudentMonthSheet({
  row,
  register,
  href,
  onClose,
}: {
  row: RegisterRow;
  register: SectionRegister;
  href?: string;
  onClose: () => void;
}) {
  const on = (status: AttendanceStatus) =>
    Object.entries(row.days)
      .filter(([, s]) => s === status)
      .map(([d]) => shortDay.format(new Date(`${d}T00:00:00Z`)))
      .join(', ');
  const tiles: [string, string | number, string][] = [
    ['Present', row.present, 'text-green-700'],
    ['Absent', row.absent, 'text-red-600'],
    ['Late', row.late, 'text-amber-700'],
    [
      'Attendance',
      row.percentage === null ? '—' : `${row.percentage}%`,
      isLow(row) ? 'text-red-600' : 'text-brand-navy',
    ],
  ];
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      icon={Users}
      title={row.fullName}
      description={[
        row.rollNumber ? `Roll ${row.rollNumber}` : null,
        `${register.section.className} – ${register.section.sectionName}`,
        monthLabel(register.month),
      ]
        .filter(Boolean)
        .join(' · ')}
      footer={
        href ? (
          <Link
            to={href}
            className="inline-flex items-center gap-1 rounded-md px-4 py-2 text-sm font-medium text-brand-navy hover:bg-brand-gold-light"
          >
            Open student record <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(([label, value, tone]) => (
          <div key={label} className="rounded-xl bg-surface p-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
            <p className={`text-xl font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        {row.marked} of {register.workingDays.length} marked day(s) · late counts as present
      </p>
      {(row.absent > 0 || row.late > 0) && (
        <dl className="mt-3 space-y-2 text-sm">
          {row.absent > 0 && (
            <div>
              <dt className="font-medium text-red-700">Absent on</dt>
              <dd className="text-ink">{on('ABSENT')}</dd>
            </div>
          )}
          {row.late > 0 && (
            <div>
              <dt className="font-medium text-amber-700">Late on</dt>
              <dd className="text-ink">{on('LATE')}</dd>
            </div>
          )}
        </dl>
      )}
    </Modal>
  );
}

/**
 * Attendance on a student's page. `summary` shows just the year's percentage and totals (with an
 * optional "more" button); otherwise the month-by-month figures and recent absences follow too.
 */
export function StudentAttendanceCard({
  studentId,
  summary: compact = false,
  onMore,
}: {
  studentId: string;
  summary?: boolean;
  onMore?: () => void;
}) {
  const summary = useStudentAttendance(studentId);
  const t = summary.data?.totals;
  return (
    <SectionCard icon={CalendarDays} title="Attendance">
      {summary.isLoading ? (
        <PageSpinner />
      ) : summary.isError || !summary.data || !t ? (
        <Alert>{errorMessages(summary.error)[0]}</Alert>
      ) : !summary.data.enrolment ? (
        <p className="text-sm text-ink-muted">Not enrolled in a class yet.</p>
      ) : t.marked === 0 ? (
        <p className="text-sm text-ink-muted">
          No attendance marked yet for {summary.data.enrolment.academicYear.name}.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div
              className={`shrink-0 rounded-lg px-3 py-2 text-center ring-1 sm:px-4 sm:py-2.5 ${
                t.percentage !== null && t.percentage < ATTENDANCE_LOW_THRESHOLD
                  ? 'bg-red-50 text-red-700 ring-red-100'
                  : 'bg-green-50 text-green-700 ring-green-100'
              }`}
            >
              <p className="text-xl font-bold leading-tight">
                {t.percentage === null ? '—' : `${t.percentage}%`}
              </p>
              <p className="text-[11px] leading-tight">
                Overall
                <br />({summary.data.enrolment.academicYear.name})
              </p>
            </div>
            <span className="h-12 w-px shrink-0 bg-gray-200" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-[13px] sm:text-sm">
              <p className="text-ink">
                Present {t.present} · Absent {t.absent} · Late {t.late}
              </p>
              <p className="text-ink-muted">{t.marked} days marked</p>
            </div>
            {onMore && (
              <button
                type="button"
                onClick={onMore}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink transition-colors hover:bg-gray-100"
                aria-label="Attendance details"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
          {!compact && (
            <>
              <div className="flex flex-wrap gap-2">
                {summary.data.months.map((m) => (
                  <div
                    key={m.month}
                    className="rounded-md border border-gray-200 px-3 py-2 text-xs"
                  >
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
                      <li key={r.date} className="flex items-start gap-3 py-1">
                        <span className="w-24 shrink-0 text-ink-muted sm:w-28">
                          {formatDate(r.date)}
                        </span>
                        <span className="shrink-0">
                          <Badge tone={r.status === 'ABSENT' ? 'red' : 'amber'}>
                            {ATTENDANCE_STATUS_LABELS[r.status]}
                          </Badge>
                        </span>
                        {r.remarks && <span className="min-w-0 text-ink-muted">{r.remarks}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
