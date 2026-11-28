import { ATTENDANCE_LOW_THRESHOLD } from '@school/shared';
import {
  CalendarDays,
  ChevronDown,
  Filter,
  GraduationCap,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
import { HeroCard } from '@/components/common/HeroCard';
import { YearPicker } from '@/features/admin/components/YearPicker';
import { useSectionOptions, useYearSelection } from '@/features/admin/people-api';
import { errorMessages } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { useDailyReport, useMonthlyReport } from '../attendance-api';
import { AttendanceSheetPanel } from '../components/AttendanceSheetPanel';
import { PercentBadge, RegisterActions, RegisterPanel } from '../components/AttendanceReports';

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
  className = 'max-w-[220px]',
}: {
  yearId: string;
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const sections = useSectionOptions(yearId);
  return (
    <Select
      id="att-section"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
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
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
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
  const [filtersOpen, setFiltersOpen] = useState(true);
  return (
    <div className="mx-auto max-w-6xl">
      <HeroCard
        title="Class attendance register"
        description={<>One class, one month: every student&rsquo;s day-by-day attendance.</>}
        illustration={<CalendarIllustration />}
      />
      {sectionId && <RegisterActions sectionId={sectionId} month={month} />}
      <Card className="mb-3 sm:mb-5 print:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="register-details"
          className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5 sm:py-4"
        >
          <Filter
            className="h-[18px] w-[18px] shrink-0 text-ink sm:h-5 sm:w-5"
            aria-hidden="true"
          />
          <span className="flex-1 text-[15px] font-semibold text-brand-navy sm:text-base">
            Select details
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-ink-muted transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        <div
          id="register-details"
          hidden={!filtersOpen}
          className="grid gap-2.5 px-4 pb-3.5 sm:grid-cols-3 sm:gap-4 sm:px-5 sm:pb-5 [&_input]:py-1.5 [&_select]:py-1.5 sm:[&_input]:py-2 sm:[&_select]:py-2"
        >
          <IconField icon={GraduationCap} label="Academic year" htmlFor="reg-year">
            <YearPicker
              id="reg-year"
              yearId={yearId}
              onChange={setYearId}
              years={years.data}
              className="w-full"
            />
          </IconField>
          <IconField icon={Users} label="Class & section" htmlFor="att-section">
            <SectionSelect
              yearId={yearId}
              value={sectionId}
              onChange={setSectionId}
              className="w-full"
            />
          </IconField>
          <IconField icon={CalendarDays} label="Month" htmlFor="reg-month">
            <Input
              id="reg-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </IconField>
        </div>
      </Card>
      {sectionId ? (
        <RegisterPanel
          sectionId={sectionId}
          month={month}
          studentHref={(id) => `/admin/students/${id}`}
        />
      ) : (
        <Card>
          <EmptyState
            icon={Users}
            title="Choose a class"
            description="Pick the class & section and month to see every student's attendance."
          />
        </Card>
      )}
    </div>
  );
}

/**
 * A filter field with an icon to its left (register filters). Larger screens show the label above
 * the field; on phones the icon and the chosen value say what it is, and the label is kept for
 * screen readers only.
 */
function IconField({
  icon: Icon,
  label,
  htmlFor,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 sm:items-end">
      <Icon className="h-5 w-5 shrink-0 text-ink sm:mb-2.5 sm:h-6 sm:w-6" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className="sr-only sm:not-sr-only sm:mb-1 sm:block sm:text-sm sm:font-medium sm:text-ink"
        >
          {label}
        </label>
        {children}
      </div>
    </div>
  );
}

function CalendarIllustration() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="reg-cal-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <filter id="reg-cal-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#1e3a8a" floodOpacity="0.22" />
        </filter>
      </defs>
      <g filter="url(#reg-cal-shadow)">
        <rect x="12" y="20" width="96" height="88" rx="16" fill="#fff" />
        <path d="M12 36a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v8H12z" fill="url(#reg-cal-top)" />
      </g>
      <rect x="34" y="10" width="9" height="22" rx="4.5" fill="#1e40af" />
      <rect x="77" y="10" width="9" height="22" rx="4.5" fill="#1e40af" />
      {[
        [28, 54, true],
        [66, 54, true],
        [28, 80, false],
        [66, 80, true],
      ].map(([x, y, done]) => (
        <g key={`${x}-${y}`}>
          <rect
            x={x as number}
            y={y as number}
            width="24"
            height="20"
            rx="5"
            fill={done ? '#e0eaff' : '#e5e7eb'}
          />
          {done && (
            <path
              d={`M${(x as number) + 6} ${(y as number) + 10.5} l4.5 4.5 l8 -9`}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      ))}
    </svg>
  );
}
