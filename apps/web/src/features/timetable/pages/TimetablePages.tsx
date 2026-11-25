import {
  DAY_LABELS,
  DAY_SHORT,
  PERMISSIONS,
  SCHOOL_DAYS,
  TIMETABLE_STATUS_LABELS,
  type TeacherTimetable,
  type TimetableItem,
  type TimetableStatus,
} from '@school/shared';
import {
  ArrowLeft,
  CalendarHeart,
  CircleCheck,
  Clock,
  Plus,
  Printer,
  Radio,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
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
import { YearPicker } from '@/features/admin/components/YearPicker';
import {
  useEmployeeOptions,
  useSectionOptions,
  useStructure,
  useTeacherAssignments,
  useYearSelection,
} from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import {
  useTeacherTimetable,
  useTimetable,
  useTimetableActions,
  useTimetableClashes,
  useTimetables,
} from '../timetable-api';
import { useHolidays } from '@/features/holidays/holidays-api';
import { useConfirm } from '@/lib/dialogs';
import {
  addDays,
  isoWeekday,
  lessonStatus,
  useSchoolNow,
  weekStart,
  type LessonStatus,
} from '../week-status';

const STATUS_TONE: Record<TimetableStatus, 'gray' | 'green' | 'navy'> = {
  DRAFT: 'gray',
  PUBLISHED: 'green',
  ARCHIVED: 'navy',
};

// --- Read-only week grid (teacher view) -----------------------------------------------------

const dateLabel = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const CELL: Record<LessonStatus, string> = {
  done: 'bg-gray-50 text-ink-muted ring-1 ring-gray-200 opacity-80',
  current: 'bg-emerald-50 ring-2 ring-emerald-500 shadow-md shadow-emerald-500/20',
  next: 'bg-brand-gold-light ring-1 ring-brand-gold',
  upcoming: 'bg-sky-50 ring-1 ring-sky-200',
  holiday: 'bg-gray-100/70 text-gray-400 opacity-60',
};

const LEGEND: [LessonStatus, string][] = [
  ['current', 'Now'],
  ['next', 'Next'],
  ['upcoming', 'Upcoming'],
  ['done', 'Done'],
  ['holiday', 'Holiday'],
];

/**
 * A teacher's week. With `live`, it shows the current week (or the coming week on a Sunday) with
 * dates, colours each lesson as done / now / next / upcoming, and fades holidays.
 */
export function TeacherWeek({
  timetable,
  live = false,
}: {
  timetable: TeacherTimetable;
  live?: boolean;
}) {
  const now = useSchoolNow();
  const monday = weekStart(now.date);
  const saturday = addDays(monday, 5);
  const holidays = useHolidays({ from: monday, to: addDays(monday, 6) }, live);
  if (!timetable.entries.length) return <EmptyState title="No published lessons yet" />;
  const slots = [
    ...new Map(
      timetable.entries.map((e) => [
        `${e.startTime}-${e.endTime}`,
        { start: e.startTime, end: e.endTime },
      ]),
    ).values(),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const days = SCHOOL_DAYS.filter(
    (d) => d <= 6 || timetable.entries.some((e) => e.dayOfWeek === d),
  );
  const dateOf = (d: number) => addDays(monday, d - 1);
  const holidayOn = (date: string) =>
    holidays.data?.find((h) => h.startDate <= date && date <= h.endDate) ?? null;

  // Status per lesson, and the next lesson still to come today.
  const statusOf = (e: TeacherTimetable['entries'][number]) =>
    lessonStatus({ date: dateOf(e.dayOfWeek), ...e }, now, !!holidayOn(dateOf(e.dayOfWeek)));
  const todayLessons = live
    ? timetable.entries
        .filter((e) => dateOf(e.dayOfWeek) === now.date && !holidayOn(now.date))
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];
  const current = todayLessons.find((e) => statusOf(e) === 'current');
  const next = todayLessons.find((e) => statusOf(e) === 'upcoming');
  const todayHoliday = live ? holidayOn(now.date) : null;

  return (
    <div className="space-y-4">
      {live && (
        <div className="grid gap-3 md:grid-cols-2" aria-live="polite">
          {todayHoliday ? (
            <div className="flex items-center gap-3 rounded-xl border border-brand-gold/40 bg-brand-gold-light p-4 md:col-span-2">
              <CalendarHeart className="h-6 w-6 text-brand-gold-dark" aria-hidden="true" />
              <p className="text-sm text-ink">
                Today is a holiday: <strong>{todayHoliday.name}</strong>. Enjoy the day!
              </p>
            </div>
          ) : (
            <>
              <NowCard
                tone="current"
                label="Now"
                lesson={current}
                empty={
                  isoWeekday(now.date) === 7
                    ? 'Sunday — no school today'
                    : todayLessons.length
                      ? 'No lesson right now'
                      : 'No lessons today'
                }
              />
              <NowCard
                tone="next"
                label="Next"
                lesson={next}
                empty={todayLessons.length ? 'No more lessons today' : '—'}
              />
            </>
          )}
        </div>
      )}
      <Card className="overflow-x-auto">
        {live && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-4 py-3 text-xs text-ink-muted">
            <span className="font-semibold uppercase tracking-wide">
              Week of {dateLabel.format(new Date(`${monday}T00:00:00Z`))} –{' '}
              {dateLabel.format(new Date(`${saturday}T00:00:00Z`))}
            </span>
            {LEGEND.map(([k, label]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`h-3 w-3 rounded ${CELL[k]}`} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        )}
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs uppercase text-ink-muted">
              <th className="px-3 py-2 text-left font-medium">Time</th>
              {days.map((d) => {
                const date = dateOf(d);
                const isToday = live && date === now.date;
                const holiday = live ? holidayOn(date) : null;
                return (
                  <th key={d} className="px-3 py-2 text-left align-bottom font-medium">
                    <span
                      className={`inline-flex flex-col rounded-lg px-2 py-1 ${
                        isToday ? 'bg-brand-navy text-white shadow-md shadow-brand-navy/20' : ''
                      }`}
                    >
                      <span>{DAY_SHORT[d]}</span>
                      {live && (
                        <span
                          className={`text-[11px] normal-case ${isToday ? 'text-brand-gold' : 'text-ink-muted/80'}`}
                        >
                          {isToday ? 'Today' : dateLabel.format(new Date(`${date}T00:00:00Z`))}
                        </span>
                      )}
                    </span>
                    {holiday && (
                      <span
                        className="mt-1 block max-w-[9rem] truncate text-[11px] font-semibold normal-case text-brand-gold-dark"
                        title={holiday.name}
                      >
                        {holiday.name}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {slots.map((slot) => (
              <tr key={slot.start}>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-muted">
                  {slot.start}–{slot.end}
                </td>
                {days.map((d) => {
                  const e = timetable.entries.find(
                    (x) => x.dayOfWeek === d && x.startTime === slot.start,
                  );
                  if (!e) return <td key={d} className="px-3 py-2" />;
                  const base = live ? statusOf(e) : 'upcoming';
                  const status: LessonStatus = live && e === next ? 'next' : base;
                  return (
                    <td key={d} className="px-3 py-2 align-top">
                      <div
                        className={`relative rounded-lg px-2.5 py-1.5 transition-all ${live ? CELL[status] : 'bg-brand-navy/5'}`}
                        data-status={live ? status : undefined}
                      >
                        {live && status === 'current' && (
                          <span className="absolute -right-1.5 -top-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                            </span>
                            Now
                          </span>
                        )}
                        {live && status === 'next' && (
                          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-brand-gold px-1.5 py-0.5 text-[10px] font-semibold text-brand-navy-dark shadow">
                            Next
                          </span>
                        )}
                        <p
                          className={`flex items-center gap-1 font-medium ${status === 'done' || status === 'holiday' ? '' : 'text-ink'}`}
                        >
                          {live && status === 'done' && (
                            <CircleCheck
                              className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                              aria-label="Done"
                            />
                          )}
                          {e.subjectName}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {e.className} – {e.sectionName}
                          {e.roomLabel ? ` · ${e.roomLabel}` : ''}
                        </p>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function NowCard({
  tone,
  label,
  lesson,
  empty,
}: {
  tone: 'current' | 'next';
  label: string;
  lesson: TeacherTimetable['entries'][number] | undefined;
  empty: string;
}) {
  const Icon = tone === 'current' ? Radio : Clock;
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-4 ${
        lesson
          ? tone === 'current'
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-brand-gold/40 bg-brand-gold-light/60'
          : 'border-gray-200 bg-white'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          tone === 'current' ? 'bg-emerald-600 text-white' : 'bg-brand-gold text-brand-navy-dark'
        } ${lesson ? '' : 'opacity-40'}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        {lesson ? (
          <p className="truncate text-sm text-ink">
            <strong className="font-semibold">{lesson.subjectName}</strong> · {lesson.className} –{' '}
            {lesson.sectionName}
            <span className="text-ink-muted">
              {' '}
              · {tone === 'current' ? `until ${lesson.endTime}` : `at ${lesson.startTime}`}
              {lesson.roomLabel ? ` · ${lesson.roomLabel}` : ''}
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">{empty}</p>
        )}
      </div>
    </div>
  );
}

// --- List ------------------------------------------------------------------------------------

export function TimetablesPage() {
  const { can } = useAuth();
  const { years, yearId, setYearId } = useYearSelection();
  const list = useTimetables(yearId);
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <PageHeader
        title="Timetables"
        description="One published timetable per section. Publishing checks that no teacher is in two places at once."
        actions={
          <>
            <YearPicker yearId={yearId} onChange={setYearId} years={years.data} />
            <Link to="/admin/timetables/teachers">
              <Button variant="secondary">Teacher timetables</Button>
            </Link>
            {can(PERMISSIONS.TIMETABLE_MANAGE) && (
              <Button onClick={() => setCreating(true)}>New timetable</Button>
            )}
          </>
        }
      />
      <Card>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.length ? (
          <EmptyState title="No timetables yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Section</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Periods / lessons</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.data.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {t.section.className} – {t.section.sectionName}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/timetables/${t.id}`}
                      className="text-brand-navy hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {t.periods} periods · {t.lessons} lessons/week
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[t.status]}>{TIMETABLE_STATUS_LABELS[t.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {creating && (
        <CreateTimetableModal
          yearId={yearId}
          existing={list.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CreateTimetableModal({
  yearId,
  existing,
  onClose,
}: {
  yearId: string;
  existing: { id: string; name: string; section: { className: string; sectionName: string } }[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const sections = useSectionOptions(yearId);
  const { create } = useTimetableActions();
  const [form, setForm] = useState({ sectionId: '', name: 'Regular timetable', copyFromId: '' });
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      const t = await create.mutateAsync(form);
      navigate(`/admin/timetables/${t.id}`);
    } catch (e) {
      setError(errorMessages(e).map((m) => m.replace(/^\w+: /, ''))[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="New timetable"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!form.sectionId}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Class & section" htmlFor="tt-sec" required>
          <Select
            id="tt-sec"
            value={form.sectionId}
            onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}
          >
            <option value="">Select</option>
            {sections.options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="tt-name" required>
          <Input
            id="tt-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field
          label="Start from a copy of (optional)"
          htmlFor="tt-copy"
          hint="Periods are copied; subjects and teachers too when it is the same class"
        >
          <Select
            id="tt-copy"
            value={form.copyFromId}
            onChange={(e) => setForm((f) => ({ ...f, copyFromId: e.target.value }))}
          >
            <option value="">Blank</option>
            {existing.map((t) => (
              <option key={t.id} value={t.id}>
                {t.section.className} – {t.section.sectionName} · {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

// --- Editor ----------------------------------------------------------------------------------

interface Period {
  periodNumber: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}
interface Cell {
  classSubjectId: string;
  teacherEmployeeId: string;
  roomLabel: string;
}
const DEFAULT_PERIODS: Period[] = [
  { periodNumber: 1, startTime: '08:00', endTime: '08:40', isBreak: false },
  { periodNumber: 2, startTime: '08:40', endTime: '09:20', isBreak: false },
  { periodNumber: 3, startTime: '09:20', endTime: '10:00', isBreak: false },
  { periodNumber: 4, startTime: '10:00', endTime: '10:40', isBreak: false },
  { periodNumber: 5, startTime: '10:40', endTime: '11:00', isBreak: true },
  { periodNumber: 6, startTime: '11:00', endTime: '11:40', isBreak: false },
  { periodNumber: 7, startTime: '11:40', endTime: '12:20', isBreak: false },
];

export function TimetableEditorPage() {
  const { id = '' } = useParams();
  const tt = useTimetable(id);
  // Kept here: the editor remounts after every save (fresh data), the message must survive that.
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (tt.isLoading) return <PageSpinner />;
  if (tt.isError || !tt.data) return <Alert>{errorMessages(tt.error)[0]}</Alert>;
  return (
    <Editor key={tt.dataUpdatedAt} timetable={tt.data} message={message} setMessage={setMessage} />
  );
}

type Message = { tone: 'success' | 'error'; text: string } | null;

function Editor({
  timetable,
  message,
  setMessage,
}: {
  timetable: TimetableItem;
  message: Message;
  setMessage: (m: Message) => void;
}) {
  const confirm = useConfirm();
  const { can } = useAuth();
  const editable = timetable.status === 'DRAFT' && can(PERMISSIONS.TIMETABLE_MANAGE);
  const structure = useStructure(timetable.section.academicYear.id);
  const assignments = useTeacherAssignments(timetable.section.academicYear.id);
  const staff = useEmployeeOptions();
  const clashes = useTimetableClashes(timetable.id, timetable.status === 'DRAFT');
  const { saveEntries, publish, archive } = useTimetableActions();
  const navigate = useNavigate();
  const subjects =
    structure.data?.find((c) => c.class.name === timetable.section.className)?.subjects ?? [];
  const [periods, setPeriods] = useState<Period[]>(() => {
    const fromEntries = [
      ...new Map(
        timetable.entries.map((e) => [
          e.periodNumber,
          {
            periodNumber: e.periodNumber,
            startTime: e.startTime,
            endTime: e.endTime,
            isBreak: e.isBreak,
          },
        ]),
      ).values(),
    ].sort((a, b) => a.periodNumber - b.periodNumber);
    return fromEntries.length ? fromEntries : DEFAULT_PERIODS;
  });
  const [cells, setCells] = useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      timetable.entries
        .filter((e) => !e.isBreak)
        .map((e) => [
          `${e.dayOfWeek}-${e.periodNumber}`,
          {
            classSubjectId: e.classSubject?.id ?? '',
            teacherEmployeeId: e.teacher?.id ?? '',
            roomLabel: e.roomLabel ?? '',
          },
        ]),
    ),
  );
  const [dirty, setDirty] = useState(false);

  /** Default teacher for a subject = the one assigned to this section. */
  const teacherFor = (classSubjectId: string) =>
    assignments.data?.find(
      (a) => a.section.id === timetable.section.id && a.classSubjectId === classSubjectId,
    )?.employee.id ?? '';
  const setCell = (key: string, patch: Partial<Cell>) => {
    setDirty(true);
    setCells((c) => {
      const prev = c[key] ?? { classSubjectId: '', teacherEmployeeId: '', roomLabel: '' };
      const next = { ...prev, ...patch };
      if (patch.classSubjectId !== undefined && patch.teacherEmployeeId === undefined)
        next.teacherEmployeeId = patch.classSubjectId
          ? teacherFor(patch.classSubjectId) || prev.teacherEmployeeId
          : '';
      return { ...c, [key]: next };
    });
  };
  const setPeriod = (i: number, patch: Partial<Period>) => {
    setDirty(true);
    setPeriods((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
    } catch (e) {
      const { fields, general } = splitFieldErrors(e);
      setMessage({
        tone: 'error',
        text: [...general, ...Object.values(fields)].join(' · ') || errorMessages(e)[0],
      });
    }
  };
  const save = () =>
    run(async () => {
      const entries = SCHOOL_DAYS.flatMap((d) =>
        periods.map((p) => {
          const c = cells[`${d}-${p.periodNumber}`];
          return {
            dayOfWeek: d,
            periodNumber: p.periodNumber,
            startTime: p.startTime,
            endTime: p.endTime,
            isBreak: p.isBreak,
            classSubjectId: p.isBreak ? null : c?.classSubjectId || null,
            teacherEmployeeId:
              p.isBreak || !c?.classSubjectId
                ? null
                : c.teacherEmployeeId || teacherFor(c.classSubjectId) || null,
            roomLabel: p.isBreak ? undefined : c?.roomLabel || undefined,
          };
        }),
      );
      await saveEntries.mutateAsync({ id: timetable.id, entries });
      setDirty(false);
    }, 'Timetable saved.');

  return (
    <div>
      <Link
        to="/admin/timetables"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline print:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Timetables
      </Link>
      <PageHeader
        title={`${timetable.section.className} – ${timetable.section.sectionName} · ${timetable.name}`}
        description={`${timetable.section.academicYear.name} · created by ${timetable.createdBy}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Badge tone={STATUS_TONE[timetable.status]}>
              {TIMETABLE_STATUS_LABELS[timetable.status]}
            </Badge>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" /> Print
            </Button>
            {editable && (
              <Button
                variant="secondary"
                onClick={save}
                loading={saveEntries.isPending}
                disabled={!dirty}
              >
                Save
              </Button>
            )}
            {editable && (
              <Button
                onClick={() =>
                  run(
                    () => publish.mutateAsync(timetable.id),
                    'Published. The previous timetable of this section was archived.',
                  )
                }
                loading={publish.isPending}
                disabled={dirty}
                title={dirty ? 'Save first' : undefined}
              >
                Publish
              </Button>
            )}
            {can(PERMISSIONS.TIMETABLE_MANAGE) && timetable.status === 'PUBLISHED' && (
              <Button variant="secondary" onClick={() => navigate('/admin/timetables')}>
                Make a new version from the list
              </Button>
            )}
            {can(PERMISSIONS.TIMETABLE_MANAGE) && timetable.status !== 'ARCHIVED' && (
              <Button
                variant="ghost"
                onClick={async () => {
                  if (
                    await confirm({
                      title: 'Archive this timetable?',
                      confirmLabel: 'Archive',
                      tone: 'danger',
                    })
                  )
                    void run(() => archive.mutateAsync(timetable.id), 'Archived.');
                }}
              >
                Archive
              </Button>
            )}
          </div>
        }
      />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {timetable.status === 'DRAFT' && clashes.data && clashes.data.length > 0 && !dirty && (
        <div className="mb-4">
          <Alert tone="warning">
            Teacher clashes — fix these before publishing:{' '}
            {clashes.data.map((c) => c.message).join(' · ')}
          </Alert>
        </div>
      )}
      <Card className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="uppercase text-ink-muted">
              <th className="px-2 py-2 text-left font-medium">Period</th>
              {SCHOOL_DAYS.map((d) => (
                <th key={d} className="px-2 py-2 text-left font-medium">
                  {DAY_LABELS[d]}
                </th>
              ))}
              {editable && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {periods.map((p, i) => (
              <tr key={i} className={p.isBreak ? 'bg-surface' : ''}>
                <td className="whitespace-nowrap px-2 py-2 align-top">
                  {editable ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <span className="w-5 font-semibold">{p.periodNumber}</span>
                        <Input
                          type="time"
                          value={p.startTime}
                          onChange={(e) => setPeriod(i, { startTime: e.target.value })}
                          className="w-[100px] text-xs"
                          aria-label={`Period ${p.periodNumber} start`}
                        />
                        <Input
                          type="time"
                          value={p.endTime}
                          onChange={(e) => setPeriod(i, { endTime: e.target.value })}
                          className="w-[100px] text-xs"
                          aria-label={`Period ${p.periodNumber} end`}
                        />
                      </div>
                      <Checkbox
                        label="Break"
                        checked={p.isBreak}
                        onChange={(e) => setPeriod(i, { isBreak: e.target.checked })}
                      />
                    </div>
                  ) : (
                    <span>
                      <strong>{p.periodNumber}</strong> · {p.startTime}–{p.endTime}
                    </span>
                  )}
                </td>
                {SCHOOL_DAYS.map((d) => {
                  const key = `${d}-${p.periodNumber}`;
                  const c = cells[key];
                  if (p.isBreak)
                    return (
                      <td key={d} className="px-2 py-2 text-center text-ink-muted">
                        Break
                      </td>
                    );
                  const clash =
                    clashes.data?.some(
                      (x) => x.dayOfWeek === d && x.periodNumber === p.periodNumber,
                    ) && !dirty;
                  return (
                    <td key={d} className={`px-1 py-1 align-top ${clash ? 'bg-red-50' : ''}`}>
                      {editable ? (
                        <div className="space-y-1">
                          <Select
                            value={c?.classSubjectId ?? ''}
                            onChange={(e) => setCell(key, { classSubjectId: e.target.value })}
                            className="text-xs"
                            aria-label={`${DAY_LABELS[d]} period ${p.periodNumber} subject`}
                          >
                            <option value="">—</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.subject.name}
                              </option>
                            ))}
                          </Select>
                          {c?.classSubjectId && (
                            <Select
                              value={c.teacherEmployeeId || teacherFor(c.classSubjectId)}
                              onChange={(e) => setCell(key, { teacherEmployeeId: e.target.value })}
                              className="text-xs"
                              aria-label={`${DAY_LABELS[d]} period ${p.periodNumber} teacher`}
                            >
                              <option value="">No teacher</option>
                              {(staff.data ?? []).map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.fullName}
                                </option>
                              ))}
                            </Select>
                          )}
                        </div>
                      ) : c?.classSubjectId ? (
                        <div>
                          <p className="font-medium text-ink">
                            {subjects.find((s) => s.id === c.classSubjectId)?.subject.name ??
                              timetable.entries.find(
                                (e) => e.dayOfWeek === d && e.periodNumber === p.periodNumber,
                              )?.classSubject?.subjectName}
                          </p>
                          <p className="text-ink-muted">
                            {
                              timetable.entries.find(
                                (e) => e.dayOfWeek === d && e.periodNumber === p.periodNumber,
                              )?.teacher?.fullName
                            }
                          </p>
                        </div>
                      ) : (
                        <span className="text-ink-muted">Free</span>
                      )}
                    </td>
                  );
                })}
                {editable && (
                  <td className="px-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDirty(true);
                        setPeriods((x) => x.filter((_, j) => j !== i));
                      }}
                      aria-label={`Remove period ${p.periodNumber}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="border-t border-gray-200 p-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setDirty(true);
                setPeriods((x) => {
                  const last = x.at(-1);
                  return [
                    ...x,
                    {
                      periodNumber: (last?.periodNumber ?? 0) + 1,
                      startTime: last?.endTime ?? '08:00',
                      endTime: last?.endTime ?? '08:40',
                      isBreak: false,
                    },
                  ];
                });
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add period
            </Button>
          </div>
        )}
      </Card>
      {!editable && timetable.status === 'PUBLISHED' && (
        <p className="mt-3 text-xs text-ink-muted print:hidden">
          Published timetables are fixed. To change it, create a new timetable for this section
          copying this one, edit and publish it — this one is then archived.
        </p>
      )}
    </div>
  );
}

// --- Teacher timetables (office) -------------------------------------------------------------

export function TeacherTimetablesPage() {
  const staff = useEmployeeOptions();
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employeeId') ?? '';
  const tt = useTeacherTimetable(employeeId);
  return (
    <div>
      <Link
        to="/admin/timetables"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline print:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Timetables
      </Link>
      <PageHeader
        title={tt.data ? `Timetable · ${tt.data.teacher.fullName}` : 'Teacher timetables'}
        description="A teacher's week across every published class timetable."
        actions={
          <Select
            value={employeeId}
            onChange={(e) => setParams({ employeeId: e.target.value })}
            aria-label="Teacher"
            className="max-w-[240px] print:hidden"
          >
            <option value="">Choose a teacher</option>
            {(staff.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </Select>
        }
      />
      {!employeeId ? (
        <EmptyState title="Choose a teacher" />
      ) : tt.isLoading ? (
        <PageSpinner />
      ) : tt.data ? (
        <TeacherWeek timetable={tt.data} />
      ) : (
        <Alert>{errorMessages(tt.error)[0]}</Alert>
      )}
    </div>
  );
}
