import { MARK_STATUS_LABELS, type MarksTaskStatus } from '@school/shared';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Alert, Badge, Card, EmptyState, PageHeader, PageSpinner } from '@/components/ui';
import { TeacherWeek } from '@/features/timetable/pages/TimetablePages';
import { useMyTimetable } from '@/features/timetable/timetable-api';
import { errorMessages } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { MarksSheetPanel } from '../components/MarksSheetPanel';
import { useMyMarksTasks } from '../exams-api';

const TASK_LABEL: Record<MarksTaskStatus, string> = {
  NOT_STARTED: 'Not started',
  MIXED: 'In progress',
  ...MARK_STATUS_LABELS,
};
const TASK_TONE: Record<MarksTaskStatus, 'gray' | 'amber' | 'green' | 'navy'> = {
  NOT_STARTED: 'amber',
  MIXED: 'amber',
  DRAFT: 'amber',
  SUBMITTED: 'navy',
  APPROVED: 'green',
  FINAL: 'green',
};

export function TeacherMarksPage() {
  const tasks = useMyMarksTasks();
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Marks entry"
        description="Your subjects in exams that are scheduled or open for marks. Save as you go, then submit for approval."
      />
      {tasks.isLoading ? (
        <PageSpinner />
      ) : tasks.isError ? (
        <Alert>{errorMessages(tasks.error)[0]}</Alert>
      ) : !tasks.data?.length ? (
        <EmptyState
          title="No marks to enter right now"
          description="Exams appear here once the office schedules them for your subjects."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100">
            {tasks.data.map((t) => (
              <li key={`${t.examSubjectId}-${t.sectionId}`}>
                <Link
                  to={`/teacher/marks/${t.examSubjectId}/${t.sectionId}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface"
                  aria-label={`${t.examName} ${t.subjectLabel} ${t.className} ${t.sectionName}`}
                >
                  <div>
                    <p className="font-medium text-ink">
                      {t.examName} · {t.subjectLabel}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {t.className} – {t.sectionName} · out of {t.maxMarks}
                      {t.examDate ? ` · ${formatDate(t.examDate)}` : ''} · {t.entered}/{t.students}{' '}
                      entered
                    </p>
                  </div>
                  <Badge tone={TASK_TONE[t.status]}>{TASK_LABEL[t.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function TeacherMarksSheetPage() {
  const { examSubjectId = '', sectionId = '' } = useParams();
  return (
    <div className="max-w-5xl">
      <Link
        to="/teacher/marks"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Marks entry
      </Link>
      <MarksSheetPanel examSubjectId={examSubjectId} sectionId={sectionId} />
    </div>
  );
}

export function MyTimetablePage() {
  const tt = useMyTimetable();
  return (
    <div>
      <PageHeader
        title="My timetable"
        icon={CalendarClock}
        description="Your week across every published class timetable. The current lesson is highlighted and updates on its own."
      />
      {tt.isLoading ? (
        <PageSpinner />
      ) : tt.isError ? (
        <Alert>{errorMessages(tt.error)[0]}</Alert>
      ) : !tt.data ? (
        <EmptyState
          title="Your login is not linked to a staff record"
          description="Ask the office to link it under Staff."
        />
      ) : (
        <TeacherWeek timetable={tt.data} live />
      )}
    </div>
  );
}
