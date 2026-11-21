import {
  PERMISSIONS,
  SUBJECT_TYPE_LABELS,
  SUBJECT_TYPES,
  type AcademicYearItem,
  type ClassStructure,
  type SectionItem,
  type SubjectItem,
  type SubjectType,
} from '@school/shared';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
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
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDate, todayIso } from '@/lib/format';
import {
  useActivateYear,
  useAssignRollNumbers,
  useCopyStructure,
  useCreateAssignment,
  useDeleteAssignment,
  useDeleteSection,
  useEmployeeOptions,
  useSaveSection,
  useSaveSubject,
  useSaveYear,
  useSectionOptions,
  useSetClassSubjects,
  useStructure,
  useSubjects,
  useTeacherAssignments,
  useYearSelection,
} from '../people-api';
import { YearPicker } from '../components/YearPicker';

const YEAR_TONE = { DRAFT: 'gray', ACTIVE: 'green', CLOSED: 'navy' } as const;

function NoYears() {
  return (
    <EmptyState
      title="No academic year yet"
      description="Create the current academic year under Academic Years first."
    />
  );
}

function useFormErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  return {
    fields,
    general,
    clear: () => {
      setFields({});
      setGeneral(null);
    },
    set: (e: unknown) => {
      const r = splitFieldErrors(e);
      setFields(r.fields);
      setGeneral(r.general[0] ?? null);
    },
  };
}

// --- Academic years ----------------------------------------------------------------------------

export function AcademicYearsPage() {
  const { can } = useAuth();
  const { years } = useYearSelection();
  const activate = useActivateYear();
  const [editing, setEditing] = useState<AcademicYearItem | 'new' | null>(null);
  const [copying, setCopying] = useState<AcademicYearItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const manage = can(PERMISSIONS.ACADEMICS_MANAGE);

  const onActivate = async (y: AcademicYearItem) => {
    const current = years.data?.find((x) => x.isActive);
    const msg = current
      ? `Make ${y.name} the current year? ${current.name} will be closed and become read-only.`
      : `Make ${y.name} the current year?`;
    if (!window.confirm(msg)) return;
    setError(null);
    try {
      await activate.mutateAsync(y.id);
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };

  return (
    <div>
      <PageHeader
        title="Academic Years"
        description="One year is current at a time. Closed years stay available for history but can no longer be changed."
        actions={manage && <Button onClick={() => setEditing('new')}>New academic year</Button>}
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <Card>
        {years.isLoading ? (
          <PageSpinner />
        ) : !years.data?.length ? (
          <EmptyState
            title="No academic years"
            description="Create the current academic year to get started."
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {years.data.map((y) => (
              <li key={y.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-ink">
                    {y.name}{' '}
                    <Badge tone={YEAR_TONE[y.status]}>
                      {y.isActive ? 'Current' : y.status.toLowerCase()}
                    </Badge>
                  </p>
                  <p className="text-sm text-ink-muted">
                    {formatDate(y.startDate)} – {formatDate(y.endDate)} · {y.sectionCount} sections
                    · {y.enrolmentCount} enrolments
                  </p>
                </div>
                {manage && (
                  <div className="flex gap-2">
                    {y.status !== 'CLOSED' && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(y)}>
                        Edit
                      </Button>
                    )}
                    {y.status !== 'CLOSED' && y.sectionCount === 0 && (
                      <Button size="sm" variant="secondary" onClick={() => setCopying(y)}>
                        Copy structure…
                      </Button>
                    )}
                    {y.status === 'DRAFT' && (
                      <Button size="sm" onClick={() => onActivate(y)} loading={activate.isPending}>
                        Make current
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <YearEditor
          item={editing === 'new' ? null : editing}
          years={years.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      {copying && (
        <CopyStructureModal
          target={copying}
          years={years.data ?? []}
          onClose={() => setCopying(null)}
        />
      )}
    </div>
  );
}

/**
 * Start year for a new April–March session: the year after the latest existing one, or, when
 * there are none, the session that contains today.
 */
function nextSessionStart(years: AcademicYearItem[]): number {
  const latest = years.reduce((max, y) => Math.max(max, Number(y.startDate.slice(0, 4))), 0);
  if (latest) return latest + 1;
  const [year, month] = todayIso().split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

function YearEditor({
  item,
  years,
  onClose,
}: {
  item: AcademicYearItem | null;
  years: AcademicYearItem[];
  onClose: () => void;
}) {
  const save = useSaveYear();
  const errs = useFormErrors();
  const [form, setForm] = useState(() => {
    const y = nextSessionStart(years);
    return {
      name: item?.name ?? `${y}-${y + 1}`,
      startDate: item?.startDate ?? `${y}-04-01`,
      endDate: item?.endDate ?? `${y + 1}-03-31`,
    };
  });
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    errs.clear();
    try {
      await save.mutateAsync({ id: item?.id, ...form });
      onClose();
    } catch (err) {
      errs.set(err);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'New academic year'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errs.general && <Alert>{errs.general}</Alert>}
        <Field
          label="Name"
          htmlFor="y-name"
          error={errs.fields.name}
          hint="Format 2026-2027"
          required
        >
          <Input
            id="y-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts" htmlFor="y-start" error={errs.fields.startDate} required>
            <Input
              id="y-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </Field>
          <Field label="Ends" htmlFor="y-end" error={errs.fields.endDate} required>
            <Input
              id="y-end"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </Field>
        </div>
        {!item && (
          <p className="text-xs text-ink-muted">
            New years start as upcoming (draft). Make it current when the session begins.
          </p>
        )}
      </form>
    </Modal>
  );
}

function CopyStructureModal({
  target,
  years,
  onClose,
}: {
  target: AcademicYearItem;
  years: AcademicYearItem[];
  onClose: () => void;
}) {
  const copy = useCopyStructure();
  const sources = years.filter((y) => y.id !== target.id && y.sectionCount > 0);
  const [from, setFrom] = useState(sources[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      const res = await copy.mutateAsync({ id: target.id, fromAcademicYearId: from });
      setDone(`Copied ${res.sections} sections and ${res.classSubjects} class subjects.`);
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Copy structure into ${target.name}`}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={copy.isPending} disabled={!from}>
              Copy
            </Button>
          </>
        )
      }
    >
      {done ? (
        <Alert tone="success">{done}</Alert>
      ) : sources.length === 0 ? (
        <p className="text-sm text-ink-muted">No other year has sections to copy.</p>
      ) : (
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Copy sections and subjects from" htmlFor="copy-from">
            <Select id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {sources.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-ink-muted">
            Class teachers and teacher assignments are not copied — set them for the new year.
          </p>
        </div>
      )}
    </Modal>
  );
}

// --- Classes & sections ---------------------------------------------------------------------------

export function ClassesSectionsPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.ACADEMICS_MANAGE);
  const { years, yearId, setYearId, year } = useYearSelection();
  const structure = useStructure(yearId);
  const [editing, setEditing] = useState<{
    cls: ClassStructure;
    section: SectionItem | null;
  } | null>(null);
  const [subjectsFor, setSubjectsFor] = useState<ClassStructure | null>(null);
  const del = useDeleteSection();
  const roll = useAssignRollNumbers();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const readOnly = !manage || year?.status === 'CLOSED';

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessages(e)[0] });
    }
  };

  if (years.isLoading) return <PageSpinner />;
  if (!years.data?.length) return <NoYears />;
  return (
    <div>
      <PageHeader
        title="Classes & Sections"
        description="Sections, rooms, capacity, class teachers and subjects for each class."
        actions={<YearPicker yearId={yearId} onChange={setYearId} years={years.data} />}
      />
      {year?.status === 'CLOSED' && (
        <div className="mb-4">
          <Alert tone="info">{year.name} is closed — read only.</Alert>
        </div>
      )}
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {structure.isLoading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-4">
          {structure.data?.map((c) => (
            <Card key={c.class.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-brand-navy">{c.class.name}</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    Subjects:{' '}
                    {c.subjects.length
                      ? c.subjects.map((s) => s.subject.name).join(', ')
                      : 'none set'}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSubjectsFor(c)}
                      aria-label={`Subjects for ${c.class.name}`}
                    >
                      Subjects
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setEditing({ cls: c, section: null })}
                      aria-label={`Add section to ${c.class.name}`}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> Section
                    </Button>
                  </div>
                )}
              </div>
              {c.sections.length > 0 && (
                <table className="mt-3 w-full text-sm">
                  <thead className="text-left text-xs uppercase text-ink-muted">
                    <tr>
                      <th className="py-2 font-medium">Section</th>
                      <th className="py-2 font-medium">Class teacher</th>
                      <th className="py-2 font-medium">Room</th>
                      <th className="py-2 font-medium">Students</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {c.sections.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 font-medium text-ink">
                          {s.name} {!s.isActive && <Badge tone="gray">inactive</Badge>}
                        </td>
                        <td className="py-2 text-ink-muted">{s.classTeacher?.fullName ?? '—'}</td>
                        <td className="py-2 text-ink-muted">{s.roomLabel ?? '—'}</td>
                        <td className="py-2 text-ink-muted">
                          {s.studentCount}
                          {s.capacity ? ` / ${s.capacity}` : ''}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right">
                          {!readOnly && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!s.studentCount}
                                onClick={() =>
                                  window.confirm(
                                    `Number ${s.studentCount} students of ${c.class.name} ${s.name} alphabetically? Existing roll numbers will be replaced.`,
                                  ) &&
                                  run(
                                    () => roll.mutateAsync({ sectionId: s.id, order: 'NAME' }),
                                    `Roll numbers assigned for ${c.class.name} ${s.name}.`,
                                  )
                                }
                              >
                                Roll numbers
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing({ cls: c, section: s })}
                                aria-label={`Edit section ${s.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  window.confirm(`Delete ${c.class.name} ${s.name}?`) &&
                                  run(() => del.mutateAsync(s.id), 'Section deleted.')
                                }
                                aria-label={`Delete section ${s.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <SectionEditor
          yearId={yearId}
          cls={editing.cls}
          section={editing.section}
          onClose={() => setEditing(null)}
        />
      )}
      {subjectsFor && (
        <ClassSubjectsEditor
          yearId={yearId}
          cls={subjectsFor}
          onClose={() => setSubjectsFor(null)}
        />
      )}
    </div>
  );
}

function SectionEditor({
  yearId,
  cls,
  section,
  onClose,
}: {
  yearId: string;
  cls: ClassStructure;
  section: SectionItem | null;
  onClose: () => void;
}) {
  const save = useSaveSection();
  const staff = useEmployeeOptions();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    name: section?.name ?? String.fromCharCode(65 + cls.sections.length),
    roomLabel: section?.roomLabel ?? '',
    capacity: section?.capacity ? String(section.capacity) : '',
    classTeacherId: section?.classTeacher?.id ?? '',
    isActive: section?.isActive ?? true,
  });
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    errs.clear();
    try {
      const common = {
        name: form.name,
        roomLabel: form.roomLabel || (section ? null : undefined),
        capacity: form.capacity ? Number(form.capacity) : section ? null : undefined,
        classTeacherId: form.classTeacherId || null,
      };
      if (section) await save.mutateAsync({ id: section.id, ...common, isActive: form.isActive });
      else
        await save.mutateAsync({
          academicYearId: yearId,
          classId: cls.class.id,
          ...common,
        } as never);
      onClose();
    } catch (err) {
      errs.set(err);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={
        section ? `Edit ${cls.class.name} – ${section.name}` : `New section in ${cls.class.name}`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Section name" htmlFor="s-name" error={errs.fields.name} required>
            <Input
              id="s-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Room" htmlFor="s-room">
            <Input
              id="s-room"
              value={form.roomLabel}
              onChange={(e) => setForm((f) => ({ ...f, roomLabel: e.target.value }))}
            />
          </Field>
          <Field label="Capacity" htmlFor="s-cap" error={errs.fields.capacity}>
            <Input
              id="s-cap"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
          </Field>
        </div>
        <Field
          label="Class teacher"
          htmlFor="s-ct"
          error={errs.fields.classTeacherId ?? errs.fields.employeeId}
        >
          <Select
            id="s-ct"
            value={form.classTeacherId}
            onChange={(e) => setForm((f) => ({ ...f, classTeacherId: e.target.value }))}
          >
            <option value="">Not assigned</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} · {s.designation}
              </option>
            ))}
          </Select>
        </Field>
        {section && (
          <Checkbox
            label="Active"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
        )}
      </form>
    </Modal>
  );
}

function ClassSubjectsEditor({
  yearId,
  cls,
  onClose,
}: {
  yearId: string;
  cls: ClassStructure;
  onClose: () => void;
}) {
  const subjects = useSubjects();
  const setSubjects = useSetClassSubjects();
  const [selected, setSelected] = useState<Map<string, SubjectType>>(
    () => new Map(cls.subjects.map((s) => [s.subject.id, s.subjectType])),
  );
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string, on: boolean) =>
    setSelected((m) => {
      const n = new Map(m);
      if (on) n.set(id, 'CORE');
      else n.delete(id);
      return n;
    });
  const submit = async () => {
    setError(null);
    try {
      await setSubjects.mutateAsync({
        academicYearId: yearId,
        classId: cls.class.id,
        subjects: [...selected].map(([subjectId, subjectType]) => ({ subjectId, subjectType })),
      });
      onClose();
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Subjects for ${cls.class.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={setSubjects.isPending}>
            Save
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {!subjects.data?.length ? (
        <p className="text-sm text-ink-muted">Add subjects under Academics → Subjects first.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {subjects.data
            .filter((s) => s.isActive || selected.has(s.id))
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <Checkbox
                  label={s.name}
                  description={s.code ?? undefined}
                  checked={selected.has(s.id)}
                  onChange={(e) => toggle(s.id, e.target.checked)}
                />
                {selected.has(s.id) && (
                  <Select
                    className="max-w-[150px]"
                    value={selected.get(s.id)}
                    onChange={(e) =>
                      setSelected((m) => new Map(m).set(s.id, e.target.value as SubjectType))
                    }
                    aria-label={`${s.name} type`}
                  >
                    {SUBJECT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {SUBJECT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                )}
              </li>
            ))}
        </ul>
      )}
    </Modal>
  );
}

// --- Subjects ----------------------------------------------------------------------------------

export function SubjectsPage() {
  const { can } = useAuth();
  const subjects = useSubjects();
  const [editing, setEditing] = useState<SubjectItem | 'new' | null>(null);
  return (
    <div>
      <PageHeader
        title="Subjects"
        description="The subject catalogue. Choose which subjects each class studies under Classes & Sections."
        actions={
          can(PERMISSIONS.ACADEMICS_MANAGE) && (
            <Button onClick={() => setEditing('new')}>New subject</Button>
          )
        }
      />
      <Card>
        {subjects.isLoading ? (
          <PageSpinner />
        ) : !subjects.data?.length ? (
          <EmptyState title="No subjects yet" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {subjects.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-ink">
                    {s.name} {s.code && <Badge tone="gray">{s.code}</Badge>}{' '}
                    {!s.isActive && <Badge tone="gray">inactive</Badge>}
                  </p>
                  {s.description && <p className="text-xs text-ink-muted">{s.description}</p>}
                </div>
                {can(PERMISSIONS.ACADEMICS_MANAGE) && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <SubjectEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function SubjectEditor({ item, onClose }: { item: SubjectItem | null; onClose: () => void }) {
  const save = useSaveSubject();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    name: item?.name ?? '',
    code: item?.code ?? '',
    description: item?.description ?? '',
    isActive: item?.isActive ?? true,
  });
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    errs.clear();
    try {
      await save.mutateAsync(
        item
          ? {
              id: item.id,
              name: form.name,
              code: form.code || null,
              description: form.description || null,
              isActive: form.isActive,
            }
          : { name: form.name, code: form.code, description: form.description || undefined },
      );
      onClose();
    } catch (err) {
      errs.set(err);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'New subject'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Name" htmlFor="sub-name" error={errs.fields.name} required>
            <Input
              id="sub-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Code" htmlFor="sub-code" error={errs.fields.code}>
            <Input
              id="sub-code"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="MATH"
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="sub-desc">
          <Input
            id="sub-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        {item && (
          <Checkbox
            label="Active"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
        )}
      </form>
    </Modal>
  );
}

// --- Teacher assignments -----------------------------------------------------------------------

export function TeacherAssignmentsPage() {
  const { can } = useAuth();
  const { years, yearId, setYearId, year } = useYearSelection();
  const list = useTeacherAssignments(yearId);
  const del = useDeleteAssignment();
  const [adding, setAdding] = useState(false);
  const manage = can(PERMISSIONS.ACADEMICS_MANAGE) && year?.status !== 'CLOSED';
  if (years.isLoading) return <PageSpinner />;
  if (!years.data?.length) return <NoYears />;
  return (
    <div>
      <PageHeader
        title="Teacher Assignments"
        description="Who teaches which subject in which section. Teachers only see the classes assigned to them (plus their class-teacher section)."
        actions={
          <>
            <YearPicker yearId={yearId} onChange={setYearId} years={years.data} />
            {manage && <Button onClick={() => setAdding(true)}>Assign teacher</Button>}
          </>
        }
      />
      <Card>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.length ? (
          <EmptyState title="No assignments yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Section</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Teacher</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.data.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {a.section.className} – {a.section.name}
                  </td>
                  <td className="px-4 py-3 text-ink">{a.subject.name}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {a.employee.fullName}{' '}
                    <span className="text-xs">({a.employee.employeeCode})</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {manage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          window.confirm('Remove this assignment?') && del.mutate(a.id)
                        }
                        aria-label="Remove assignment"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {adding && <AssignmentEditor yearId={yearId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AssignmentEditor({ yearId, onClose }: { yearId: string; onClose: () => void }) {
  const staff = useEmployeeOptions();
  const sections = useSectionOptions(yearId);
  const create = useCreateAssignment();
  const errs = useFormErrors();
  const [form, setForm] = useState({ employeeId: '', sectionId: '', classSubjectId: '' });
  const section = sections.options.find((s) => s.id === form.sectionId);
  const classSubjects = sections.data?.find((c) => c.class.id === section?.classId)?.subjects ?? [];
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    errs.clear();
    try {
      await create.mutateAsync({ academicYearId: yearId, ...form });
      onClose();
    } catch (err) {
      errs.set(err);
    }
  };
  const row = (label: string, id: string, error: string | undefined, children: ReactNode) => (
    <Field label={label} htmlFor={id} error={error} required>
      {children}
    </Field>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Assign a teacher"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => submit()}
            loading={create.isPending}
            disabled={!form.employeeId || !form.classSubjectId}
          >
            Assign
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {errs.general && <Alert>{errs.general}</Alert>}
        {row(
          'Teacher',
          'ta-emp',
          errs.fields.employeeId,
          <Select
            id="ta-emp"
            value={form.employeeId}
            onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
          >
            <option value="">Select teacher</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} · {s.designation}
              </option>
            ))}
          </Select>,
        )}
        {row(
          'Section',
          'ta-sec',
          errs.fields.sectionId,
          <Select
            id="ta-sec"
            value={form.sectionId}
            onChange={(e) =>
              setForm((f) => ({ ...f, sectionId: e.target.value, classSubjectId: '' }))
            }
          >
            <option value="">Select section</option>
            {sections.options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>,
        )}
        {row(
          'Subject',
          'ta-sub',
          errs.fields.classSubjectId,
          <Select
            id="ta-sub"
            value={form.classSubjectId}
            disabled={!section}
            onChange={(e) => setForm((f) => ({ ...f, classSubjectId: e.target.value }))}
          >
            <option value="">
              {section
                ? classSubjects.length
                  ? 'Select subject'
                  : 'No subjects set for this class'
                : 'Choose a section first'}
            </option>
            {classSubjects.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.subject.name}
              </option>
            ))}
          </Select>,
        )}
      </form>
    </Modal>
  );
}
