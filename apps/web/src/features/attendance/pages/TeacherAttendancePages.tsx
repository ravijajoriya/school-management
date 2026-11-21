import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, Badge, EmptyState, Field, Input, PageHeader, PageSpinner } from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { useMyAttendanceSections } from '../attendance-api';
import { AttendanceSheetPanel } from '../components/AttendanceSheetPanel';
import { RegisterPanel } from '../components/AttendanceReports';

/** Today's attendance status for each class the teacher is class teacher of. */
export function TodayAttendanceCards({ compact = false }: { compact?: boolean }) {
  const sections = useMyAttendanceSections();
  if (sections.isLoading) return <PageSpinner />;
  if (sections.isError) return <Alert>{errorMessages(sections.error)[0]}</Alert>;
  if (!sections.data?.length) {
    return (
      <EmptyState
        title="You are not a class teacher this year"
        description="Daily attendance is marked by each class's class teacher."
      />
    );
  }
  return (
    <div className={compact ? 'space-y-3' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
      {sections.data.map((s) => {
        const done = s.total > 0 && s.markedToday >= s.total;
        return (
          <Link
            key={s.sectionId}
            to={`/teacher/attendance/${s.sectionId}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 transition hover:border-brand-gold hover:shadow-sm"
          >
            <div>
              <p className="font-semibold text-brand-navy">
                {s.className} – {s.sectionName}
              </p>
              <p className="text-xs text-ink-muted">
                {s.total} student{s.total === 1 ? '' : 's'}
              </p>
            </div>
            {done ? (
              <Badge tone="green">Marked today</Badge>
            ) : s.markedToday > 0 ? (
              <Badge tone="amber">
                {s.markedToday}/{s.total} marked
              </Badge>
            ) : (
              <Badge tone="amber">Mark today</Badge>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function TeacherAttendancePage() {
  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Mark today's attendance for your class. You can fix mistakes until the end of the day; after that, ask the office."
      />
      <TodayAttendanceCards />
    </div>
  );
}

export function TeacherSheetPage() {
  const { sectionId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const date = params.get('date') ?? today;
  return (
    <div className="max-w-5xl">
      <Link
        to="/teacher/attendance"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Attendance
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <Field label="Date" htmlFor="t-att-date">
          <Input
            id="t-att-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) =>
              setParams(e.target.value === today ? {} : { date: e.target.value }, { replace: true })
            }
          />
        </Field>
        <Link
          to={`/teacher/attendance/${sectionId}/register`}
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <CalendarCheck className="h-4 w-4" aria-hidden="true" /> Monthly register
        </Link>
      </div>
      <AttendanceSheetPanel sectionId={sectionId} date={date} />
    </div>
  );
}

export function TeacherRegisterPage() {
  const { sectionId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const month = params.get('month') ?? todayIso().slice(0, 7);
  return (
    <div>
      <Link
        to={`/teacher/attendance/${sectionId}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline print:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to today's sheet
      </Link>
      <div className="mb-4 print:hidden">
        <Field label="Month" htmlFor="t-reg-month">
          <Input
            id="t-reg-month"
            type="month"
            value={month}
            onChange={(e) => setParams({ month: e.target.value }, { replace: true })}
            className="max-w-[180px]"
          />
        </Field>
      </div>
      <RegisterPanel sectionId={sectionId} month={month} />
    </div>
  );
}
