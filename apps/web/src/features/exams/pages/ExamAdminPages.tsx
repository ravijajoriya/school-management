import {
  DEFAULT_GRADE_BANDS,
  EXAM_COMPONENTS,
  EXAM_STATUS_LABELS,
  EXAM_TYPE_LABELS,
  EXAM_TYPES,
  PERMISSIONS,
  type ExamStatus,
  type ExamType,
  type ExaminationItem,
  type GradingScaleItem,
} from '@school/shared';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
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
import { useStructure, useYearSelection } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { MarksSheetPanel } from '../components/MarksSheetPanel';
import {
  useExamActions,
  useExamination,
  useExaminations,
  useExamProgress,
  useGradingScales,
  useSaveGradingScale,
} from '../exams-api';
import { useConfirm } from '@/lib/dialogs';

const EXAM_TONE: Record<ExamStatus, 'gray' | 'navy' | 'amber' | 'green'> = {
  DRAFT: 'gray',
  SCHEDULED: 'navy',
  MARKS_ENTRY: 'amber',
  FINALIZED: 'green',
};

const dates = (e: { startDate: string | null; endDate: string | null }) =>
  e.startDate
    ? `${formatDate(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}`
    : 'Dates not set';

// --- List ----------------------------------------------------------------------------------

export function ExamsPage() {
  const { can } = useAuth();
  const { years, yearId, setYearId, year } = useYearSelection();
  const exams = useExaminations(yearId);
  const [creating, setCreating] = useState(false);
  const byClass = new Map<string, ExaminationItem[]>();
  (exams.data ?? []).forEach((e) =>
    byClass.set(e.class.name, [...(byClass.get(e.class.name) ?? []), e]),
  );
  return (
    <div>
      <PageHeader
        title="Examinations"
        description="Set up exams per class, open marks entry for teachers, approve marks and publish results."
        actions={
          <>
            <YearPicker yearId={yearId} onChange={setYearId} years={years.data} />
            {can(PERMISSIONS.EXAMS_MANAGE) && year?.status !== 'CLOSED' && (
              <Button onClick={() => setCreating(true)}>New exam</Button>
            )}
          </>
        }
      />
      {exams.isLoading ? (
        <PageSpinner />
      ) : !exams.data?.length ? (
        <EmptyState title="No exams for this year yet" />
      ) : (
        <div className="space-y-4">
          {[...byClass.entries()].map(([className, list]) => (
            <Card key={className}>
              <h2 className="border-b border-gray-200 px-4 py-3 font-semibold text-brand-navy">
                {className}
              </h2>
              <ul className="divide-y divide-gray-100">
                {list.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/admin/exams/${e.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface"
                    >
                      <div>
                        <p className="font-medium text-ink">{e.name}</p>
                        <p className="text-xs text-ink-muted">
                          {EXAM_TYPE_LABELS[e.examType]} · {dates(e)} · {e.subjects.length} paper(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-ink-muted">
                        {e.status === 'MARKS_ENTRY' && (
                          <span>
                            {e.progress.approved}/{e.progress.expected} marks approved
                          </span>
                        )}
                        <Badge tone={EXAM_TONE[e.status]}>{EXAM_STATUS_LABELS[e.status]}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      {creating && <CreateExamModal yearId={yearId} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateExamModal({ yearId, onClose }: { yearId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const structure = useStructure(yearId);
  const scales = useGradingScales();
  const { create } = useExamActions();
  const [form, setForm] = useState({
    classId: '',
    name: '',
    examType: 'UNIT_TEST' as ExamType,
    startDate: '',
    endDate: '',
    gradingScaleId: '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setErrs({});
    setError(null);
    try {
      const exam = await create.mutateAsync({ academicYearId: yearId, ...form });
      navigate(`/admin/exams/${exam.id}`);
    } catch (e) {
      const r = splitFieldErrors(e);
      setErrs(r.fields);
      setError(r.general[0] ?? null);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="New exam"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Class" htmlFor="ex-class" error={errs.classId} required>
            <Select
              id="ex-class"
              value={form.classId}
              onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}
            >
              <option value="">Select class</option>
              {(structure.data ?? [])
                .filter((c) => c.sections.length > 0)
                .map((c) => (
                  <option key={c.class.id} value={c.class.id}>
                    {c.class.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="ex-type">
            <Select
              id="ex-type"
              value={form.examType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  examType: e.target.value as ExamType,
                  name: f.name || EXAM_TYPE_LABELS[e.target.value as ExamType],
                }))
              }
            >
              {EXAM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EXAM_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name" htmlFor="ex-name" error={errs.name} required>
            <Input
              id="ex-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Unit Test 1"
            />
          </Field>
          <Field
            label="Grading scale"
            htmlFor="ex-scale"
            hint="Empty = the most specific active scale"
          >
            <Select
              id="ex-scale"
              value={form.gradingScaleId}
              onChange={(e) => setForm((f) => ({ ...f, gradingScaleId: e.target.value }))}
            >
              <option value="">Automatic</option>
              {(scales.data ?? [])
                .filter((s) => s.isActive)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Starts" htmlFor="ex-start" error={errs.startDate}>
            <Input
              id="ex-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </Field>
          <Field label="Ends" htmlFor="ex-end" error={errs.endDate}>
            <Input
              id="ex-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// --- Detail ----------------------------------------------------------------------------------

export function ExamDetailPage() {
  const confirm = useConfirm();
  const { id = '' } = useParams();
  const exam = useExamination(id);
  const progress = useExamProgress(id, !!exam.data && exam.data.status !== 'DRAFT');
  const { setStatus, finalize } = useExamActions();
  const { can } = useAuth();
  const manage = can(PERMISSIONS.EXAMS_MANAGE);
  const [editingSubjects, setEditingSubjects] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (exam.isLoading) return <PageSpinner />;
  if (exam.isError || !exam.data) return <Alert>{errorMessages(exam.error)[0]}</Alert>;
  const e = exam.data;
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessages(err).join(' · ') });
    }
  };
  const sections = [
    ...new Map((progress.data ?? []).map((r) => [r.sectionId, r.sectionLabel])).entries(),
  ];

  return (
    <div className="max-w-6xl">
      <Link
        to="/admin/exams"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Examinations
      </Link>
      <PageHeader
        title={`${e.name} · ${e.class.name}`}
        description={`${EXAM_TYPE_LABELS[e.examType]} · ${dates(e)} · ${e.academicYear.name}${e.gradingScale ? ` · grading: ${e.gradingScale.name}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={EXAM_TONE[e.status]}>{EXAM_STATUS_LABELS[e.status]}</Badge>
            {manage && e.status === 'DRAFT' && (
              <Button
                onClick={() =>
                  run(
                    () => setStatus.mutateAsync({ id, status: 'SCHEDULED' }),
                    'Exam scheduled — teachers can see it.',
                  )
                }
              >
                Schedule
              </Button>
            )}
            {manage && e.status === 'SCHEDULED' && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    run(() => setStatus.mutateAsync({ id, status: 'DRAFT' }), 'Back to draft.')
                  }
                >
                  Back to draft
                </Button>
                <Button
                  onClick={() =>
                    run(
                      () => setStatus.mutateAsync({ id, status: 'MARKS_ENTRY' }),
                      'Marks entry is open for teachers.',
                    )
                  }
                >
                  Open marks entry
                </Button>
              </>
            )}
            {manage && e.status === 'MARKS_ENTRY' && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    run(
                      () => setStatus.mutateAsync({ id, status: 'SCHEDULED' }),
                      'Marks entry paused.',
                    )
                  }
                >
                  Pause marks entry
                </Button>
                <Button
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Finalise results?',
                        message: 'Marks and grades are locked permanently after this.',
                        confirmLabel: 'Finalise',
                      })
                    )
                      void run(() => finalize.mutateAsync(id), 'Results finalised and locked.');
                  }}
                  loading={finalize.isPending}
                >
                  Finalise results
                </Button>
              </>
            )}
          </div>
        }
      />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <h2 className="font-semibold text-brand-navy">Papers</h2>
            {manage && (e.status === 'DRAFT' || e.status === 'SCHEDULED') && (
              <Button size="sm" variant="secondary" onClick={() => setEditingSubjects(true)}>
                Edit papers
              </Button>
            )}
          </div>
          {e.subjects.length === 0 ? (
            <EmptyState
              title="No papers yet"
              description="Add the subjects (and components such as Theory/Practical) with maximum marks."
            />
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Paper</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Max</th>
                  <th className="px-4 py-2 text-right font-medium">Pass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {e.subjects.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2">
                      {s.label}
                      {s.subjectType === 'OPTIONAL' && (
                        <span className="text-xs text-ink-muted"> (optional)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-muted">
                      {s.examDate ? formatDate(s.examDate) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">{s.maxMarks}</td>
                    <td className="px-4 py-2 text-right">{s.passMarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {e.status !== 'DRAFT' && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4">
              <h2 className="font-semibold text-brand-navy">Marks progress</h2>
              <div className="flex flex-wrap gap-2">
                {sections.map(([sid, label]) => (
                  <Link
                    key={sid}
                    to={`/admin/exams/${id}/results?sectionId=${sid}`}
                    className="text-sm text-brand-navy hover:underline"
                  >
                    Results {label.split('– ')[1] ? `· ${label.split('– ')[1]}` : label}
                  </Link>
                ))}
              </div>
            </div>
            {progress.isLoading ? (
              <PageSpinner />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Paper</th>
                      <th className="px-4 py-2 font-medium">Section</th>
                      <th className="px-4 py-2 font-medium">Teacher</th>
                      <th className="px-4 py-2 text-right font-medium">Not entered</th>
                      <th className="px-4 py-2 text-right font-medium">Draft</th>
                      <th className="px-4 py-2 text-right font-medium">Submitted</th>
                      <th className="px-4 py-2 text-right font-medium">Approved</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(progress.data ?? []).map((r) => (
                      <tr
                        key={`${r.examSubjectId}-${r.sectionId}`}
                        aria-label={`${r.subjectLabel} ${r.sectionLabel}`}
                      >
                        <td className="px-4 py-2">{r.subjectLabel}</td>
                        <td className="px-4 py-2 text-ink-muted">{r.sectionLabel}</td>
                        <td className="px-4 py-2 text-ink-muted">{r.teachers.join(', ') || '—'}</td>
                        <td
                          className={`px-4 py-2 text-right ${r.notEntered ? 'text-amber-700' : ''}`}
                        >
                          {r.notEntered}
                        </td>
                        <td className="px-4 py-2 text-right">{r.draft}</td>
                        <td
                          className={`px-4 py-2 text-right ${r.submitted ? 'font-semibold text-amber-700' : ''}`}
                        >
                          {r.submitted}
                        </td>
                        <td className="px-4 py-2 text-right">{r.approved + r.final}</td>
                        <td className="px-4 py-2 text-right">
                          <Link
                            to={`/admin/exams/${id}/marks?subject=${r.examSubjectId}&section=${r.sectionId}`}
                            className="text-sm text-brand-navy hover:underline"
                          >
                            {r.submitted ? 'Review' : 'Open'}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
      {editingSubjects && <PapersModal exam={e} onClose={() => setEditingSubjects(false)} />}
    </div>
  );
}

interface PaperDraft {
  classSubjectId: string;
  componentName: string;
  maxMarks: string;
  passMarks: string;
  examDate: string;
}

function PapersModal({ exam, onClose }: { exam: ExaminationItem; onClose: () => void }) {
  const structure = useStructure(exam.academicYear.id);
  const { setSubjects } = useExamActions();
  const subjects = structure.data?.find((c) => c.class.id === exam.class.id)?.subjects ?? [];
  const [rows, setRows] = useState<PaperDraft[]>(() =>
    exam.subjects.length
      ? exam.subjects.map((s) => ({
          classSubjectId: s.classSubjectId,
          componentName: s.componentName ?? '',
          maxMarks: String(s.maxMarks),
          passMarks: String(s.passMarks),
          examDate: s.examDate ?? '',
        }))
      : [],
  );
  const [error, setError] = useState<string | null>(null);
  const setRow = (i: number, patch: Partial<PaperDraft>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addAll = () =>
    setRows(
      subjects.map((s) => ({
        classSubjectId: s.id,
        componentName: '',
        maxMarks: '100',
        passMarks: '',
        examDate: '',
      })),
    );
  const submit = async () => {
    setError(null);
    try {
      await setSubjects.mutateAsync({
        id: exam.id,
        subjects: rows.map((r) => ({
          classSubjectId: r.classSubjectId,
          componentName: r.componentName,
          maxMarks: r.maxMarks,
          passMarks: r.passMarks === '' ? undefined : r.passMarks,
          examDate: r.examDate,
        })) as never,
      });
      onClose();
    } catch (e) {
      setError(
        errorMessages(e)
          .map((m) => m.replace(/^[\w.]+: /, ''))
          .join(' · '),
      );
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Papers · ${exam.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={setSubjects.isPending} disabled={!rows.length}>
            Save papers
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-ink-muted">
          Add a row per paper. Split a subject into components (Theory / Practical) by adding it
          twice. Pass marks default to 33% of the maximum.
        </p>
        {!rows.length && subjects.length > 0 && (
          <Button size="sm" variant="secondary" onClick={addAll}>
            Add all {subjects.length} subjects of {exam.class.name}
          </Button>
        )}
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_90px_90px_140px_auto]"
          >
            <Field label={i === 0 ? 'Subject' : ''} htmlFor={`pp-s-${i}`}>
              <Select
                id={`pp-s-${i}`}
                value={r.classSubjectId}
                onChange={(e) => setRow(i, { classSubjectId: e.target.value })}
                aria-label={`Subject ${i + 1}`}
              >
                <option value="">Select</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject.name}
                    {s.subjectType === 'OPTIONAL' ? ' (optional)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={i === 0 ? 'Component' : ''} htmlFor={`pp-c-${i}`}>
              <Input
                id={`pp-c-${i}`}
                list="exam-components"
                value={r.componentName}
                onChange={(e) => setRow(i, { componentName: e.target.value })}
                placeholder="(whole subject)"
                aria-label={`Component ${i + 1}`}
              />
            </Field>
            <Field label={i === 0 ? 'Max' : ''} htmlFor={`pp-m-${i}`}>
              <Input
                id={`pp-m-${i}`}
                type="number"
                min={1}
                value={r.maxMarks}
                onChange={(e) => setRow(i, { maxMarks: e.target.value })}
                aria-label={`Max marks ${i + 1}`}
              />
            </Field>
            <Field label={i === 0 ? 'Pass' : ''} htmlFor={`pp-p-${i}`}>
              <Input
                id={`pp-p-${i}`}
                type="number"
                min={0}
                value={r.passMarks}
                onChange={(e) => setRow(i, { passMarks: e.target.value })}
                placeholder="33%"
                aria-label={`Pass marks ${i + 1}`}
              />
            </Field>
            <Field label={i === 0 ? 'Date' : ''} htmlFor={`pp-d-${i}`}>
              <Input
                id={`pp-d-${i}`}
                type="date"
                value={r.examDate}
                onChange={(e) => setRow(i, { examDate: e.target.value })}
                aria-label={`Exam date ${i + 1}`}
              />
            </Field>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
              aria-label={`Remove paper ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <datalist id="exam-components">
          {EXAM_COMPONENTS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setRows((x) => [
              ...x,
              {
                classSubjectId: '',
                componentName: '',
                maxMarks: '100',
                passMarks: '',
                examDate: '',
              },
            ])
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add paper
        </Button>
      </div>
    </Modal>
  );
}

// --- Marks (office) ------------------------------------------------------------------------

export function ExamMarksPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <div className="max-w-5xl">
      <Link
        to={`/admin/exams/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to exam
      </Link>
      <MarksSheetPanel
        examSubjectId={params.get('subject') ?? ''}
        sectionId={params.get('section') ?? ''}
      />
    </div>
  );
}

// --- Grading scales --------------------------------------------------------------------------

export function GradingScalesPage() {
  const { can } = useAuth();
  const scales = useGradingScales();
  const [editing, setEditing] = useState<GradingScaleItem | 'new' | null>(null);
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Grading scales"
        description="Percentage bands that turn marks into grades. A scale used by a finalised exam is locked so published results never change."
        actions={
          can(PERMISSIONS.EXAMS_MANAGE) && (
            <Button onClick={() => setEditing('new')}>New scale</Button>
          )
        }
      />
      {scales.isLoading ? (
        <PageSpinner />
      ) : !scales.data?.length ? (
        <EmptyState
          title="No grading scale yet"
          description="Create one before finalising any exam — a standard 8-point scale is suggested."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {scales.data.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-brand-navy">{s.name}</h2>
                  <p className="text-xs text-ink-muted">
                    {[s.academicYear?.name ?? 'Any year', s.class?.name ?? 'all classes'].join(
                      ' · ',
                    )}{' '}
                    {!s.isActive && '· inactive'}
                  </p>
                </div>
                {s.locked ? (
                  <Badge tone="navy">Locked</Badge>
                ) : (
                  can(PERMISSIONS.EXAMS_MANAGE) && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                  )
                )}
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {s.bands.map((b) => (
                    <tr key={b.gradeLabel}>
                      <td className="py-1 font-semibold">{b.gradeLabel}</td>
                      <td className="py-1 text-ink-muted">
                        {b.minPercentage}–{b.maxPercentage}%
                      </td>
                      <td className="py-1 text-ink-muted">{b.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <ScaleModal scale={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ScaleModal({ scale, onClose }: { scale: GradingScaleItem | null; onClose: () => void }) {
  const save = useSaveGradingScale();
  const [name, setName] = useState(scale?.name ?? 'Standard 8-point');
  const [isActive, setActive] = useState(scale?.isActive ?? true);
  const [bands, setBands] = useState(() =>
    (scale?.bands ?? DEFAULT_GRADE_BANDS).map((b) => ({
      minPercentage: String(b.minPercentage),
      maxPercentage: String(b.maxPercentage),
      gradeLabel: b.gradeLabel,
      remark: b.remark ?? '',
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const setBand = (i: number, patch: Partial<(typeof bands)[number]>) =>
    setBands((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync({ id: scale?.id, name, isActive, bands: bands as never });
      onClose();
    } catch (e) {
      setError(
        errorMessages(e)
          .map((m) => m.replace(/^[\w.]+: /, ''))
          .join(' · '),
      );
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={scale ? `Edit ${scale.name}` : 'New grading scale'}
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
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Field label="Name" htmlFor="gs-name" required>
          <Input id="gs-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-muted">
          Bands must cover 0–100% without gaps, e.g. 81–90.99 then 91–100.
        </p>
        {bands.map((b, i) => (
          <div key={i} className="grid grid-cols-[70px_90px_90px_1fr_auto] items-center gap-2">
            <Input
              value={b.gradeLabel}
              onChange={(e) => setBand(i, { gradeLabel: e.target.value })}
              aria-label={`Grade ${i + 1}`}
            />
            <Input
              type="number"
              value={b.minPercentage}
              onChange={(e) => setBand(i, { minPercentage: e.target.value })}
              aria-label={`From % ${i + 1}`}
            />
            <Input
              type="number"
              value={b.maxPercentage}
              onChange={(e) => setBand(i, { maxPercentage: e.target.value })}
              aria-label={`To % ${i + 1}`}
            />
            <Input
              value={b.remark}
              onChange={(e) => setBand(i, { remark: e.target.value })}
              aria-label={`Remark ${i + 1}`}
              placeholder="Remark"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBands((x) => x.filter((_, j) => j !== i))}
              aria-label={`Remove band ${i + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            setBands((x) => [
              ...x,
              { minPercentage: '', maxPercentage: '', gradeLabel: '', remark: '' },
            ])
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add band
        </Button>
        <Checkbox label="Active" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
      </div>
    </Modal>
  );
}
