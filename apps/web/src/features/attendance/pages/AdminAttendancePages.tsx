import { ATTENDANCE_LOW_THRESHOLD } from '@school/shared';
import { Link, useSearchParams } from 'react-router';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageSpinner,
  Select,
} from '@/components/ui';
import { YearPicker } from '@/features/admin/components/YearPicker';
import { useSectionOptions, useYearSelection } from '@/features/admin/people-api';
import { errorMessages } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { useDailyReport, useMonthlyReport } from '../attendance-api';
import { AttendanceSheetPanel } from '../components/AttendanceSheetPanel';
import { PercentBadge, RegisterPanel } from '../components/AttendanceReports';
import { ExportButtons } from '@/features/reports/components/ExportButtons';

/** Reads/writes query-string filters so report rows can link straight to a sheet or register. */
function useParam(key: string, fallback = '') {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = (v: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v) next.set(key, v);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  return [value, set] as const;
}

function SectionSelect({
  yearId,
  value,
  onChange,
}: {
  yearId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const sections = useSectionOptions(yearId);
  return (
    <Select
      id="att-section"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[220px]"
    >
      <option value="">Select class & section</option>
      {sections.options.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </Select>
  );
}

// --- Mark / correct --------------------------------------------------------------------------

export function MarkAttendancePage() {
  const { years, yearId, setYearId, year } = useYearSelection();
  const [sectionId, setSectionId] = useParam('sectionId');
  const [date, setDate] = useParam('date', todayIso());
  const today = todayIso();
  const max = year && year.endDate < today ? year.endDate : today;
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Mark & correct attendance"
        description="Class teachers mark their own class each day. Here the office can mark any class, or correct a past day with a reason."
      />
      <Card className="mb-6 flex flex-wrap items-end gap-4 p-4">
        <Field label="Academic year" htmlFor="att-year">
          <YearPicker
            id="att-year"
            yearId={yearId}
            onChange={(id) => {
              setYearId(id);
              setSectionId('');
            }}
            years={years.data}
          />
        </Field>
        <Field label="Class & section" htmlFor="att-section">
          <SectionSelect yearId={yearId} value={sectionId} onChange={setSectionId} />
        </Field>
        <Field label="Date" htmlFor="att-date">
          <Input
            id="att-date"
            type="date"
            value={date}
            min={year?.startDate}
            max={max}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </Card>
      {!sectionId ? (
        <EmptyState
          title="Choose a class and a date"
          description="The sheet for that day appears here."
        />
      ) : (
        <AttendanceSheetPanel sectionId={sectionId} date={date} />
      )}
    </div>
  );
}

// --- Daily report ----------------------------------------------------------------------------

export function DailyAttendancePage() {
  const [date, setDate] = useParam('date', todayIso());
  const report = useDailyReport(date);
  const r = report.data;
  return (
    <div>
      <PageHeader
        title="Daily attendance"
        description="Every class for one day: who was present, absent or late, and which classes are not marked yet."
        actions={
          <Input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
            className="max-w-[180px]"
          />
        }
      />
      {report.isLoading ? (
        <PageSpinner />
      ) : report.isError || !r ? (
        <Alert>{errorMessages(report.error)[0]}</Alert>
      ) : !r.academicYear ? (
        <EmptyState title="No academic year covers this date" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Tile
              label="Attendance"
              value={r.totals.percentage === null ? '—' : `${r.totals.percentage}%`}
            />
            <Tile label="Present" value={r.totals.present} />
            <Tile
              label="Absent"
              value={r.totals.absent}
              tone={r.totals.absent ? 'red' : undefined}
            />
            <Tile label="Late" value={r.totals.late} />
            <Tile
              label="Classes not marked"
              value={r.sectionsNotMarked}
              tone={r.sectionsNotMarked ? 'amber' : undefined}
            />
          </div>
          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Class teacher</th>
                  <th className="px-4 py-3 font-medium">Marked</th>
                  <th className="px-4 py-3 font-medium">Present</th>
                  <th className="px-4 py-3 font-medium">Absent</th>
                  <th className="px-4 py-3 font-medium">Late</th>
                  <th className="px-4 py-3 font-medium">%</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {r.rows.map((row) => (
                  <tr key={row.sectionId}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {row.className} – {row.sectionName}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {row.classTeacher ?? '—'}{' '}
                      {row.classTeacherOnLeave && <Badge tone="amber">On leave</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {row.total === 0 ? (
                        <span className="text-ink-muted">No students</span>
                      ) : row.marked === 0 ? (
                        <Badge tone="amber">Not marked</Badge>
                      ) : (
                        <span className="text-ink-muted">
                          {row.marked}/{row.total}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{row.present}</td>
                    <td className="px-4 py-3">{row.absent}</td>
                    <td className="px-4 py-3">{row.late}</td>
                    <td className="px-4 py-3">
                      <PercentBadge value={row.percentage} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        to={`/admin/attendance?sectionId=${row.sectionId}&date=${date}`}
                        className="text-sm text-brand-navy hover:underline"
                      >
                        Open sheet
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'red' | 'amber';
}) {
  const color =
    tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-brand-navy';
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </Card>
  );
}

// --- Monthly report & register ---------------------------------------------------------------

export function MonthlyAttendancePage() {
  const [month, setMonth] = useParam('month', todayIso().slice(0, 7));
  const report = useMonthlyReport(month);
  return (
    <div>
      <PageHeader
        title="Monthly attendance"
        description={`Average attendance per class for the month, and how many students are below ${ATTENDANCE_LOW_THRESHOLD}%.`}
        actions={
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Month"
            className="max-w-[180px]"
          />
        }
      />
      {report.isLoading ? (
        <PageSpinner />
      ) : report.isError || !report.data ? (
        <Alert>{errorMessages(report.error)[0]}</Alert>
      ) : !report.data.academicYear ? (
        <EmptyState title="No academic year covers this month" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Students</th>
                <th className="px-4 py-3 font-medium">Days marked</th>
                <th className="px-4 py-3 font-medium">Average</th>
                <th className="px-4 py-3 font-medium">Below {ATTENDANCE_LOW_THRESHOLD}%</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.data.rows.map((row) => (
                <tr key={row.sectionId}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {row.className} – {row.sectionName}
                  </td>
                  <td className="px-4 py-3">{row.students}</td>
                  <td className="px-4 py-3">{row.workingDays}</td>
                  <td className="px-4 py-3">
                    <PercentBadge value={row.averagePercentage} />
                  </td>
                  <td className="px-4 py-3">
                    {row.lowAttendance ? <Badge tone="red">{row.lowAttendance}</Badge> : '0'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/admin/attendance/register?sectionId=${row.sectionId}&month=${month}`}
                      className="text-sm text-brand-navy hover:underline"
                    >
                      Register
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function AttendanceRegisterPage() {
  const { years, yearId, setYearId } = useYearSelection();
  const [sectionId, setSectionId] = useParam('sectionId');
  const [month, setMonth] = useParam('month', todayIso().slice(0, 7));
  return (
    <div>
      <PageHeader
        title="Class attendance register"
        description="One class, one month: every student's day-by-day attendance."
        actions={
          sectionId ? (
            <ExportButtons report="attendance-register" params={{ sectionId, month }} />
          ) : undefined
        }
      />
      <Card className="mb-6 flex flex-wrap items-end gap-4 p-4 print:hidden">
        <Field label="Academic year" htmlFor="reg-year">
          <YearPicker id="reg-year" yearId={yearId} onChange={setYearId} years={years.data} />
        </Field>
        <Field label="Class & section" htmlFor="att-section">
          <SectionSelect yearId={yearId} value={sectionId} onChange={setSectionId} />
        </Field>
        <Field label="Month" htmlFor="reg-month">
          <Input
            id="reg-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
      </Card>
      {sectionId ? (
        <RegisterPanel sectionId={sectionId} month={month} />
      ) : (
        <EmptyState title="Choose a class" />
      )}
    </div>
  );
}
