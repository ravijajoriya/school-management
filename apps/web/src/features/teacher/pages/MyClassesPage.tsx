import {
  GENDER_LABELS,
  GUARDIAN_RELATIONSHIP_LABELS,
  type Gender,
  type GuardianRelationship,
} from '@school/shared';
import {
  ArrowLeft,
  BookOpen,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Phone,
  School,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert, Badge, Card, EmptyState, PageHeader, PageSpinner } from '@/components/ui';
import { errorMessages } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { useMySections, useRoster } from '../teacher-api';

const longDay = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/**
 * Cards for each section the teacher has access to; shared by the dashboard and My Classes.
 * The server orders them: class-teacher class first, then by the teacher's periods on the
 * schedule day (today, or the next school day), and each card lists that day's periods.
 */
export function MySectionCards({ compact = false }: { compact?: boolean }) {
  const sections = useMySections();
  if (sections.isLoading) return <PageSpinner />;
  if (sections.isError) return <Alert>{errorMessages(sections.error)[0]}</Alert>;
  if (!sections.data?.length) {
    return (
      <EmptyState
        icon={School}
        title="No classes assigned yet"
        description="The office assigns class teachers and subject teachers for the current academic year."
      />
    );
  }
  const first = sections.data[0];
  // The teacher's first lesson of the day is highlighted.
  const firstStart = sections.data.flatMap((x) => x.periods.map((p) => p.startTime)).sort()[0];
  const dayLabel = first.scheduleDate
    ? first.scheduleIsToday
      ? 'today'
      : `${longDay.format(new Date(`${first.scheduleDate}T00:00:00Z`))} (next school day)`
    : null;
  return (
    <div>
      {!compact && dayLabel && (
        <p className="mb-3 text-sm text-ink-muted">
          In the order of your periods{' '}
          <strong className="font-semibold text-ink">{dayLabel}</strong>, with your class first.
        </p>
      )}
      <div className={compact ? 'space-y-3' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
        {sections.data.map((s) => (
          <Link
            key={s.sectionId}
            to={`/teacher/classes/${s.sectionId}`}
            className={`group block rounded-xl border bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-navy/10 ${
              s.isClassTeacher
                ? 'border-brand-gold/60 ring-1 ring-brand-gold/20'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-brand-navy">
                  {s.className} – {s.sectionName}
                </p>
                <p className="text-xs text-ink-muted">{s.academicYear.name}</p>
              </div>
              {s.isClassTeacher && (
                <Badge tone="gold">
                  <Star className="mr-1 h-3 w-3" aria-hidden="true" />
                  Class teacher
                </Badge>
              )}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" /> {s.studentCount} student
              {s.studentCount === 1 ? '' : 's'}
            </p>
            {s.subjects.length > 0 && (
              <p className="mt-0.5 flex items-start gap-1.5 text-sm text-ink">
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                {s.subjects.join(', ')}
              </p>
            )}
            {!compact && (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Periods">
                {s.periods.length ? (
                  s.periods.map((p) => (
                    <span
                      key={p.periodNumber}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${
                        p.startTime === firstStart
                          ? 'bg-brand-navy text-white'
                          : 'bg-brand-navy/5 text-brand-navy'
                      }`}
                    >
                      <Clock className="h-3 w-3" aria-hidden="true" />P{p.periodNumber} ·{' '}
                      {p.startTime}–{p.endTime} · {p.subjectName}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-ink-muted">
                    {s.scheduleDate
                      ? `No periods ${dayLabel === 'today' ? 'today' : 'that day'}`
                      : 'No timetable yet'}
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MyClassesPage() {
  return (
    <div>
      <PageHeader
        title="My classes"
        icon={School}
        description="Sections you are class teacher of or teach a subject in this year."
      />
      <MySectionCards />
    </div>
  );
}

export function ClassRosterPage() {
  const { sectionId = '' } = useParams();
  const sections = useMySections();
  const roster = useRoster(sectionId);
  const section = sections.data?.find((s) => s.sectionId === sectionId);

  return (
    <div className="max-w-5xl">
      <Link
        to="/teacher/classes"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My classes
      </Link>
      <PageHeader
        title={section ? `${section.className} – ${section.sectionName}` : 'Class list'}
        description={
          section
            ? [
                section.academicYear.name,
                section.isClassTeacher ? 'You are the class teacher' : null,
                section.subjects.join(', ') || null,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
      />
      {roster.isLoading ? (
        <PageSpinner />
      ) : roster.isError ? (
        <Alert>{errorMessages(roster.error)[0]}</Alert>
      ) : !roster.data?.length ? (
        <EmptyState title="No students in this section yet" />
      ) : (
        <Card className="overflow-x-auto">
          <AttendanceSummary rows={roster.data} />
          <table data-pin-second className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Roll</th>
                <th className="px-4 py-3 font-medium">Student · today</th>
                <th className="px-4 py-3 font-medium">Gender</th>
                <th className="px-4 py-3 font-medium">Date of birth</th>
                <th className="px-4 py-3 font-medium">Parent / guardian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {roster.data.map((r) => (
                <tr key={r.enrolmentId}>
                  <td className="px-4 py-3 text-ink-muted">{r.rollNumber ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <AttendanceIcon status={r.attendanceToday} />
                      <span>
                        <span className="block font-medium text-ink">{r.fullName}</span>
                        <span className="block text-xs text-ink-muted">
                          {r.monthPercent === null
                            ? 'No attendance this month yet'
                            : `${r.monthPercent}% this month`}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {r.gender ? GENDER_LABELS[r.gender as Gender] : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(r.dateOfBirth)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {r.guardian ? (
                      <>
                        {r.guardian.fullName} (
                        {GUARDIAN_RELATIONSHIP_LABELS[
                          r.guardian.relationship as GuardianRelationship
                        ] ?? r.guardian.relationship}
                        ) ·{' '}
                        <a
                          href={`tel:${r.guardian.phone}`}
                          className="inline-flex items-center gap-1 text-brand-navy hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          {r.guardian.phone}
                        </a>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-gray-200 px-4 py-3 text-xs text-ink-muted">
            {roster.data.length} students
          </p>
        </Card>
      )}
    </div>
  );
}

const STATUS: Record<
  'PRESENT' | 'LATE' | 'ABSENT' | 'NONE',
  { label: string; icon: LucideIcon; className: string }
> = {
  PRESENT: {
    label: 'Present today',
    icon: CircleCheck,
    className: 'bg-emerald-100 text-emerald-700',
  },
  LATE: { label: 'Late today', icon: Clock, className: 'bg-amber-100 text-amber-700' },
  ABSENT: { label: 'Absent today', icon: CircleX, className: 'bg-rose-100 text-rose-700' },
  NONE: {
    label: 'Not marked yet today',
    icon: CircleDashed,
    className: 'bg-gray-100 text-gray-400',
  },
};

function AttendanceIcon({ status }: { status: 'PRESENT' | 'LATE' | 'ABSENT' | null }) {
  const s = STATUS[status ?? 'NONE'];
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.className}`}
      title={s.label}
      role="img"
      aria-label={s.label}
    >
      <s.icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/** Today's counts above the class list, with a legend for the icons. */
function AttendanceSummary({
  rows,
}: {
  rows: { attendanceToday: 'PRESENT' | 'LATE' | 'ABSENT' | null }[];
}) {
  const count = (k: 'PRESENT' | 'LATE' | 'ABSENT' | null) =>
    rows.filter((r) => r.attendanceToday === k).length;
  const items: ['PRESENT' | 'LATE' | 'ABSENT' | 'NONE', number][] = [
    ['PRESENT', count('PRESENT')],
    ['LATE', count('LATE')],
    ['ABSENT', count('ABSENT')],
    ['NONE', count(null)],
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-100 px-4 py-3 text-sm"
      aria-label="Today's attendance"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Today</span>
      {items.map(([k, n]) => {
        const s = STATUS[k];
        return (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${s.className}`}
            >
              <s.icon className="h-3 w-3" aria-hidden="true" />
            </span>
            <span className="text-ink">
              <strong className="font-semibold">{n}</strong>{' '}
              {k === 'NONE' ? 'not marked' : k.toLowerCase()}
            </span>
          </span>
        );
      })}
    </div>
  );
}
