import { zodResolver } from '@hookform/resolvers/zod';
import {
  ENROLMENT_STATUS_LABELS,
  GENDER_LABELS,
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIPS,
  PERMISSIONS,
  STUDENT_DOCUMENT_TYPES,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUSES,
  createStudentSchema,
  type CreateStudentInput,
  type EnrolmentHistoryItem,
  type GuardianItem,
  type PromotionAction,
  type StudentDetail,
  type StudentStatus,
} from '@school/shared';
import {
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Camera,
  Coins,
  GraduationCap,
  Plus,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
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
  Pagination,
  Select,
} from '@/components/ui';
import { PermissionGate } from '@/features/auth/RequireAuth';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages, splitFieldErrors } from '@/lib/api-client';
import { formatDate, todayIso } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { StudentAttendanceCard } from '@/features/attendance/components/AttendanceReports';
import { StudentFeeCard } from '@/features/fees/components/StudentFeeCard';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { YearPicker } from '../components/YearPicker';
import {
  useAdmissionYears,
  useCreateStudent,
  usePrivateImage,
  usePromote,
  useSectionOptions,
  useStudent,
  useStudentActions,
  useStudents,
  useYearSelection,
} from '../people-api';
import { AddressFields, EnrolmentFields, StudentFields } from './StudentFormParts';
import { ExportButtons } from '@/features/reports/components/ExportButtons';
import { usePagination } from '@/lib/use-pagination';
import { GraduateIllustration, HeroCard } from '@/components/common/HeroCard';
import {
  ClassBadge,
  FeesPill,
  StatusDot,
  StudentAvatar,
  StudentCard,
  StudentMenu,
  StudentTile,
} from './StudentListParts';
import { CountBar, FilterCard, IconSelect, SearchBox } from '@/components/common/ListParts';
import { useViewMode } from '@/lib/use-view-mode';
import { admittedLabel } from './student-format';
import { useConfirm } from '@/lib/dialogs';

const STATUS_TONE = { ACTIVE: 'green', INACTIVE: 'gray', WITHDRAWN: 'red' } as const;

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, i, 1)),
  ),
);
const ENROLMENT_TONE = {
  ACTIVE: 'green',
  PROMOTED: 'navy',
  RETAINED: 'amber',
  TRANSFERRED: 'gray',
  WITHDRAWN: 'red',
  COMPLETED: 'navy',
} as const;

// --- List ------------------------------------------------------------------------------------

export function StudentsPage() {
  const navigate = useNavigate();
  const { years, yearId, setYearId } = useYearSelection();
  const sections = useSectionOptions(yearId);
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState<StudentStatus | ''>('ACTIVE');
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [admissionYear, setAdmissionYear] = useState('');
  const [admissionMonth, setAdmissionMonth] = useState('');
  const [pendingFees, setPendingFees] = useState<'' | 'YES' | 'NO'>('');
  const [view, setView] = useViewMode('students');
  const { can } = useAuth();
  const seeFees = can(PERMISSIONS.FEES_READ);
  const admissionYears = useAdmissionYears();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const list = useStudents({
    search: useDebouncedValue(search),
    academicYearId: yearId || undefined,
    classId,
    sectionId,
    status: status || undefined,
    notEnrolled: notEnrolled || undefined,
    admissionYear: admissionYear ? Number(admissionYear) : undefined,
    admissionMonth: admissionMonth ? Number(admissionMonth) : undefined,
    pendingFees: (seeFees && pendingFees) || undefined,
    page,
    pageSize,
  });
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };
  const classes = sections.data?.map((c) => c.class) ?? [];
  const yearName = years.data?.find((y) => y.id === yearId)?.name;
  const items = list.data?.items ?? [];
  return (
    <div className="mx-auto max-w-7xl">
      <HeroCard
        title="Students"
        description="Search students and see their class for the selected academic year."
        illustration={<GraduateIllustration />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4 sm:gap-3 [&_button]:text-[13px] sm:[&_button]:text-sm">
        <IconSelect
          icon={CalendarDays}
          value={yearId}
          onChange={(e) => reset(setYearId)(e.target.value)}
          aria-label="Academic year"
          className="basis-full sm:w-64 sm:basis-auto"
        >
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.isActive ? ' (current)' : y.status === 'DRAFT' ? ' (upcoming)' : ''}
            </option>
          ))}
        </IconSelect>
        <ExportButtons
          size="md"
          report="students"
          params={{
            academicYearId: yearId || undefined,
            classId: classId || undefined,
            sectionId: sectionId || undefined,
            status: status || undefined,
            search: search || undefined,
            admissionYear: admissionYear || undefined,
            admissionMonth: admissionMonth || undefined,
            pendingFees: (seeFees && pendingFees) || undefined,
          }}
        />
        <PermissionGate permissions={[PERMISSIONS.STUDENTS_MANAGE]}>
          <Button onClick={() => navigate('/admin/students/new')} className="ml-auto">
            <Plus className="h-4 w-4" aria-hidden="true" /> Register student
          </Button>
        </PermissionGate>
      </div>

      <FilterCard id="student-filters">
        <SearchBox
          className="col-span-2"
          placeholder="Name, admission no. or phone"
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
          aria-label="Search students"
        />
        <IconSelect
          icon={GraduationCap}
          value={classId}
          onChange={(e) => {
            reset(setClassId)(e.target.value);
            setSectionId('');
          }}
          aria-label="Filter by class"
          disabled={notEnrolled}
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </IconSelect>
        <IconSelect
          icon={Users}
          value={sectionId}
          onChange={(e) => reset(setSectionId)(e.target.value)}
          aria-label="Filter by section"
          disabled={notEnrolled}
        >
          <option value="">All sections</option>
          {sections.options
            .filter((o) => !classId || o.classId === classId)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </IconSelect>
        <IconSelect
          leading={<StatusDot status={status} />}
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value as StudentStatus | '')}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {STUDENT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {STUDENT_STATUS_LABELS[st]}
            </option>
          ))}
        </IconSelect>
        <IconSelect
          icon={CalendarDays}
          value={admissionYear}
          onChange={(e) => reset(setAdmissionYear)(e.target.value)}
          aria-label="Filter by admission year"
        >
          <option value="">Admitted</option>
          {admissionYears.data?.map((y) => (
            <option key={y} value={y}>
              Admitted {y}
            </option>
          ))}
        </IconSelect>
        <IconSelect
          icon={CalendarRange}
          value={admissionMonth}
          onChange={(e) => reset(setAdmissionMonth)(e.target.value)}
          aria-label="Filter by admission month"
        >
          <option value="">Any month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </IconSelect>
        {seeFees && (
          <IconSelect
            icon={Coins}
            value={pendingFees}
            onChange={(e) => reset(setPendingFees)(e.target.value as '' | 'YES' | 'NO')}
            aria-label="Filter by pending fees"
          >
            <option value="">Fees: all</option>
            <option value="YES">Fees pending</option>
            <option value="NO">No fees pending</option>
          </IconSelect>
        )}
        <div className="col-span-2 flex items-center px-1 lg:col-span-1">
          <Checkbox
            label="Not enrolled this year"
            checked={notEnrolled}
            onChange={(e) => reset(setNotEnrolled)(e.target.checked)}
          />
        </div>
      </FilterCard>

      <CountBar
        icon={Users}
        title={`${(list.data?.total ?? 0).toLocaleString('en-IN')} Student${list.data?.total === 1 ? '' : 's'}`}
        subtitle={yearName ? `Academic year: ${yearName}` : undefined}
        view={view}
        onViewChange={setView}
      />

      {list.isLoading ? (
        <PageSpinner />
      ) : !items.length ? (
        <Card>
          <EmptyState icon={Users} title="No students found" />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((s) => (
            <StudentTile key={s.id} student={s} />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2.5 md:hidden">
            {items.map((s) => (
              <StudentCard key={s.id} student={s} />
            ))}
          </div>
          <Card className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Admitted</th>
                  {seeFees && <th className="px-4 py-3 text-right font-medium">Pending fees</th>}
                  <th className="px-4 py-3 font-medium">Parent</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-2 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer hover:bg-surface/60"
                    onClick={() => navigate(`/admin/students/${s.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <StudentAvatar name={s.fullName} className="h-9 w-9 text-xs" />
                        <div className="min-w-0">
                          <Link
                            to={`/admin/students/${s.id}`}
                            className="font-semibold text-brand-navy hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {s.fullName}
                          </Link>
                          <div className="text-xs text-ink-muted">{s.admissionNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <ClassBadge student={s} icon={false} />
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{admittedLabel(s.admissionDate)}</td>
                    {seeFees && (
                      <td className="px-4 py-2.5 text-right">
                        <FeesPill amount={s.pendingFees} />
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-ink-muted">
                      {s.primaryGuardian ? (
                        <>
                          <div className="text-ink">{s.primaryGuardian.fullName}</div>
                          <div className="text-xs">{s.primaryGuardian.phone}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[s.status]}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <StudentMenu student={s} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {list.data && list.data.total > 0 && (
        <Card className="mt-3 sm:mt-4">
          <Pagination
            className="py-3.5"
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}
    </div>
  );
}

// --- Register --------------------------------------------------------------------------------

export function RegisterStudentPage() {
  const navigate = useNavigate();
  const { years, yearId, setYearId } = useYearSelection();
  const create = useCreateStudent();
  const [enrolNow, setEnrolNow] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, setError, setValue, formState } =
    useForm<CreateStudentInput>({
      resolver: zodResolver(createStudentSchema),
      defaultValues: {
        firstName: '',
        dateOfBirth: '',
        state: 'Rajasthan',
        guardians: [
          {
            fullName: '',
            relationship: 'FATHER',
            phone: '',
            isPrimary: true,
            addressSameAsStudent: true,
          },
        ],
        enrolment: { academicYearId: '', sectionId: '', enrolmentDate: todayIso() },
      },
    });
  const guardians = useFieldArray({ control, name: 'guardians' });
  const { errors } = formState;
  const primaryIndex = useWatch({ control, name: 'guardians' }).findIndex((g) => g.isPrimary);
  useEffect(() => {
    if (enrolNow) setValue('enrolment.academicYearId', yearId);
  }, [enrolNow, yearId, setValue]);
  const toggleEnrol = (on: boolean) => {
    setEnrolNow(on);
    setValue(
      'enrolment',
      on ? { academicYearId: yearId, sectionId: '', enrolmentDate: todayIso() } : undefined,
    );
  };

  const onSubmit = handleSubmit(
    async (values) => {
      setServerError(null);
      try {
        const student = await create.mutateAsync(values);
        navigate(`/admin/students/${student.id}`, { replace: true });
      } catch (error) {
        const { fields, general } = splitFieldErrors(error);
        Object.entries(fields).forEach(([k, message]) =>
          setError(
            (k === 'sectionId' ||
            k === 'rollNumber' ||
            k === 'enrolmentDate' ||
            k === 'academicYearId'
              ? `enrolment.${k}`
              : k) as never,
            { message },
          ),
        );
        setServerError(general[0] ?? null);
      }
    },
    () => setServerError('Please fix the highlighted fields.'),
  );

  return (
    <div className="max-w-4xl">
      <Link
        to="/admin/students"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All students
      </Link>
      <PageHeader
        title="Register student"
        description="Student details, parents/guardians and class placement in one step."
      />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold text-brand-navy">Student</h2>
          <StudentFields register={register} errors={errors as never} />
          <AddressFields register={register} errors={errors as never} />
        </Card>
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-brand-navy">Parents / guardians</h2>
            {guardians.fields.length < 4 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  guardians.append({
                    fullName: '',
                    relationship: 'MOTHER',
                    phone: '',
                    isPrimary: false,
                    addressSameAsStudent: true,
                  })
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add guardian
              </Button>
            )}
          </div>
          {errors.guardians?.root?.message && (
            <p className="text-xs text-red-600">{errors.guardians.root.message}</p>
          )}
          {errors.guardians?.message && (
            <p className="text-xs text-red-600">{errors.guardians.message}</p>
          )}
          {guardians.fields.map((f, i) => (
            <div key={f.id} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="primaryGuardian"
                    checked={primaryIndex === i}
                    onChange={() =>
                      guardians.fields.forEach((_, j) =>
                        setValue(`guardians.${j}.isPrimary`, j === i),
                      )
                    }
                    className="accent-brand-navy"
                  />
                  Primary contact
                </label>
                {guardians.fields.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const wasPrimary = primaryIndex === i;
                      guardians.remove(i);
                      if (wasPrimary) setValue('guardians.0.isPrimary', true);
                    }}
                    aria-label={`Remove guardian ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-4">
                <Field
                  label="Full name"
                  htmlFor={`g-${i}-name`}
                  error={errors.guardians?.[i]?.fullName?.message}
                  required
                >
                  <Input id={`g-${i}-name`} {...register(`guardians.${i}.fullName`)} />
                </Field>
                <Field label="Relationship" htmlFor={`g-${i}-rel`}>
                  <Select id={`g-${i}-rel`} {...register(`guardians.${i}.relationship`)}>
                    {GUARDIAN_RELATIONSHIPS.map((r) => (
                      <option key={r} value={r}>
                        {GUARDIAN_RELATIONSHIP_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Phone"
                  htmlFor={`g-${i}-phone`}
                  error={errors.guardians?.[i]?.phone?.message}
                  required
                >
                  <Input id={`g-${i}-phone`} type="tel" {...register(`guardians.${i}.phone`)} />
                </Field>
                <Field
                  label="Email"
                  htmlFor={`g-${i}-email`}
                  error={errors.guardians?.[i]?.email?.message}
                >
                  <Input id={`g-${i}-email`} type="email" {...register(`guardians.${i}.email`)} />
                </Field>
              </div>
            </div>
          ))}
        </Card>
        <Card className="space-y-4 p-5">
          <Checkbox
            label="Enrol in a class now"
            checked={enrolNow}
            onChange={(e) => toggleEnrol(e.target.checked)}
          />
          {enrolNow && (
            <EnrolmentFields
              yearId={yearId}
              setYearId={setYearId}
              years={years.data}
              register={register as never}
              errors={errors.enrolment as never}
              prefix="reg"
            />
          )}
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate('/admin/students')}>
            Cancel
          </Button>
          <Button type="submit" loading={formState.isSubmitting}>
            Register student
          </Button>
        </div>
      </form>
    </div>
  );
}

// --- Detail ----------------------------------------------------------------------------------

export function StudentDetailPage() {
  const { id = '' } = useParams();
  const student = useStudent(id);
  if (student.isLoading) return <PageSpinner />;
  if (student.isError || !student.data) return <Alert>{errorMessages(student.error)[0]}</Alert>;
  return <StudentDetailView student={student.data} />;
}

function StudentDetailView({ student }: { student: StudentDetail }) {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.STUDENTS_MANAGE);
  const lifecycle = can(PERMISSIONS.STUDENTS_LIFECYCLE);
  const actions = useStudentActions(student.id);
  const [photoVersion, setPhotoVersion] = useState(0);
  const photo = usePrivateImage(
    student.hasPhoto ? `/students/${student.id}/photo` : null,
    photoVersion,
  );
  const photoInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [guardianEdit, setGuardianEdit] = useState<GuardianItem | 'new' | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [changing, setChanging] = useState<EnrolmentHistoryItem | null>(null);
  const [exiting, setExiting] = useState<{
    enrolment: EnrolmentHistoryItem;
    kind: 'transfer' | 'withdraw';
  } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const current = student.enrolments.find((e) => e.status === 'ACTIVE');

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      await actions.uploadPhoto.mutateAsync(file);
      setPhotoVersion((v) => v + 1);
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessages(e)[0].replace(/^file: /, '') });
    }
  };

  return (
    <div className="max-w-5xl">
      <Link
        to="/admin/students"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All students
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="relative">
          {photo ? (
            <img
              src={photo}
              alt={student.fullName}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy">
              <UserRound className="h-10 w-10" aria-hidden="true" />
            </div>
          )}
          {manage && (
            <>
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  void onPhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => photoInput.current?.click()}
                className="absolute -bottom-1 -right-1 rounded-full bg-brand-gold p-1.5 text-brand-navy-dark shadow"
                aria-label="Change photo"
              >
                <Camera className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-xl font-bold text-brand-navy sm:text-2xl">{student.fullName}</h1>
          <p className="text-sm text-ink-muted">
            {student.admissionNumber} ·{' '}
            <Badge tone={STATUS_TONE[student.status]}>
              {STUDENT_STATUS_LABELS[student.status]}
            </Badge>
            {current && (
              <>
                {' '}
                · {current.className} – {current.sectionName}
                {current.rollNumber ? ` · Roll ${current.rollNumber}` : ''} (
                {current.academicYear.name})
              </>
            )}
            {student.enquiry && (
              <>
                {' '}
                · from enquiry <span className="font-mono">{student.enquiry.referenceNumber}</span>
              </>
            )}
          </p>
        </div>
        {manage && (
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setEditing(true)}>
            Edit details
          </Button>
        )}
      </div>
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold text-brand-navy">Details</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {[
              ['Date of birth', formatDate(student.dateOfBirth)],
              ['Gender', student.gender ? GENDER_LABELS[student.gender] : '—'],
              ['Blood group', student.bloodGroup ?? '—'],
              [
                'Address',
                [
                  student.addressLine1,
                  student.addressLine2,
                  student.city,
                  student.state,
                  student.postalCode,
                ]
                  .filter(Boolean)
                  .join(', ') || '—',
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-muted">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-brand-navy">Parents / guardians</h2>
            {manage && student.guardians.length < 4 && (
              <Button size="sm" variant="secondary" onClick={() => setGuardianEdit('new')}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add
              </Button>
            )}
          </div>
          <ul className="mt-3 divide-y divide-gray-100">
            {student.guardians.map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-2 py-2">
                <div className="text-sm">
                  <p className="font-medium text-ink">
                    {g.fullName} {g.isPrimary && <Badge tone="gold">Primary</Badge>}
                  </p>
                  <p className="text-ink-muted">
                    {GUARDIAN_RELATIONSHIP_LABELS[g.relationship]} ·{' '}
                    <a href={`tel:${g.phone}`} className="hover:underline">
                      {g.phone}
                    </a>
                    {g.email ? ` · ${g.email}` : ''}
                  </p>
                </div>
                {manage && (
                  <Button size="sm" variant="ghost" onClick={() => setGuardianEdit(g)}>
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-brand-navy">Enrolment history</h2>
            {manage && !current && student.status !== 'WITHDRAWN' && (
              <Button size="sm" onClick={() => setEnrolling(true)}>
                Enrol in a class
              </Button>
            )}
            {manage && !current && student.status === 'WITHDRAWN' && (
              <Button size="sm" variant="secondary" onClick={() => setEnrolling(true)}>
                Re-admit
              </Button>
            )}
          </div>
          {student.enrolments.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Not enrolled in any class yet.</p>
          ) : (
            <table className="mt-3 min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-muted">
                <tr>
                  <th className="py-2 font-medium">Year</th>
                  <th className="py-2 font-medium">Class</th>
                  <th className="py-2 font-medium">Roll</th>
                  <th className="py-2 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {student.enrolments.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 text-ink">{e.academicYear.name}</td>
                    <td className="py-2 text-ink">
                      {e.className} – {e.sectionName}
                    </td>
                    <td className="py-2 text-ink-muted">{e.rollNumber ?? '—'}</td>
                    <td className="py-2">
                      <Badge tone={ENROLMENT_TONE[e.status]}>
                        {ENROLMENT_STATUS_LABELS[e.status]}
                      </Badge>
                      {e.exitDate && (
                        <span className="ml-2 text-xs text-ink-muted">
                          {formatDate(e.exitDate)}
                          {e.exitReason ? ` — ${e.exitReason}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {e.status === 'ACTIVE' && manage && (
                        <Button size="sm" variant="ghost" onClick={() => setChanging(e)}>
                          Change section
                        </Button>
                      )}
                      {e.status === 'ACTIVE' && lifecycle && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExiting({ enrolment: e, kind: 'transfer' })}
                          >
                            Transfer
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExiting({ enrolment: e, kind: 'withdraw' })}
                          >
                            Withdraw
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

        {can(PERMISSIONS.FEES_READ) && (
          <div className="lg:col-span-2">
            <StudentFeeCard studentId={student.id} />
          </div>
        )}

        {can(PERMISSIONS.ATTENDANCE_READ) && (
          <div className="lg:col-span-2">
            <StudentAttendanceCard studentId={student.id} />
          </div>
        )}

        <div className="lg:col-span-2">
          <DocumentsPanel
            basePath={`/students/${student.id}`}
            refreshKey="student"
            documents={student.documents}
            types={STUDENT_DOCUMENT_TYPES}
            canManage={manage}
          />
        </div>
      </div>

      {editing && <EditStudentModal student={student} onClose={() => setEditing(false)} />}
      {guardianEdit && (
        <GuardianModal
          studentId={student.id}
          guardian={guardianEdit === 'new' ? null : guardianEdit}
          canRemove={student.guardians.length > 1}
          onClose={() => setGuardianEdit(null)}
        />
      )}
      {enrolling && <EnrolModal studentId={student.id} onClose={() => setEnrolling(false)} />}
      {changing && (
        <ChangeSectionModal
          studentId={student.id}
          enrolment={changing}
          onClose={() => setChanging(null)}
        />
      )}
      {exiting && (
        <ExitModal
          studentId={student.id}
          studentName={student.fullName}
          {...exiting}
          onClose={() => setExiting(null)}
        />
      )}
    </div>
  );
}

function EditStudentModal({ student, onClose }: { student: StudentDetail; onClose: () => void }) {
  const { update } = useStudentActions(student.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const editSchema = useMemo(
    () => createStudentSchema.omit({ guardians: true, enrolment: true }),
    [],
  );
  const { register, handleSubmit, setError, formState } = useForm<CreateStudentInput>({
    resolver: zodResolver(editSchema) as never,
    defaultValues: {
      ...student,
      middleName: student.middleName ?? '',
      lastName: student.lastName ?? '',
      gender: student.gender ?? '',
      bloodGroup: (student.bloodGroup ?? '') as never,
      addressLine1: student.addressLine1 ?? '',
      addressLine2: student.addressLine2 ?? '',
      city: student.city ?? '',
      state: student.state ?? '',
      postalCode: student.postalCode ?? '',
    } as never,
  });
  const onSubmit = handleSubmit(async (v) => {
    setServerError(null);
    const orNull = (x: unknown) => (x ? x : null);
    try {
      await update.mutateAsync({
        admissionNumber: v.admissionNumber,
        firstName: v.firstName,
        middleName: orNull(v.middleName) as never,
        lastName: orNull(v.lastName) as never,
        dateOfBirth: v.dateOfBirth,
        gender: orNull(v.gender) as never,
        bloodGroup: orNull(v.bloodGroup) as never,
        addressLine1: orNull(v.addressLine1) as never,
        addressLine2: orNull(v.addressLine2) as never,
        city: orNull(v.city) as never,
        state: orNull(v.state) as never,
        postalCode: orNull(v.postalCode) as never,
      });
      onClose();
    } catch (error) {
      const { fields, general } = splitFieldErrors(error);
      Object.entries(fields).forEach(([k, message]) => setError(k as never, { message }));
      setServerError(general[0] ?? null);
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit student details"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={formState.isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert>{serverError}</Alert>}
        <StudentFields register={register} errors={formState.errors as never} />
        <AddressFields register={register} errors={formState.errors as never} />
      </form>
    </Modal>
  );
}

function GuardianModal({
  studentId,
  guardian,
  canRemove,
  onClose,
}: {
  studentId: string;
  guardian: GuardianItem | null;
  canRemove: boolean;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const actions = useStudentActions(studentId);
  const [form, setForm] = useState({
    fullName: guardian?.fullName ?? '',
    relationship: guardian?.relationship ?? 'MOTHER',
    phone: guardian?.phone ?? '',
    email: guardian?.email ?? '',
    occupation: guardian?.occupation ?? '',
    isPrimary: guardian?.isPrimary ?? false,
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setFields({});
    setError(null);
    try {
      if (guardian)
        await actions.updateGuardian.mutateAsync({
          id: guardian.id,
          ...form,
          email: form.email || null,
          occupation: form.occupation || null,
        });
      else await actions.addGuardian.mutateAsync({ ...form, addressSameAsStudent: true });
      onClose();
    } catch (err) {
      const r = splitFieldErrors(err);
      setFields(r.fields);
      setError(r.general[0] ?? null);
    }
  };
  const remove = async () => {
    if (
      !guardian ||
      !(await confirm({
        title: `Remove ${guardian.fullName}?`,
        confirmLabel: 'Remove',
        tone: 'danger',
      }))
    )
      return;
    try {
      await actions.removeGuardian.mutateAsync(guardian.id);
      onClose();
    } catch (err) {
      setError(errorMessages(err)[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={guardian ? `Edit ${guardian.fullName}` : 'Add guardian'}
      footer={
        <>
          {guardian && canRemove && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              Remove
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => submit()}>Save</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="gm-name" error={fields.fullName} required>
            <Input
              id="gm-name"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            />
          </Field>
          <Field label="Relationship" htmlFor="gm-rel">
            <Select
              id="gm-rel"
              value={form.relationship}
              onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value as never }))}
            >
              {GUARDIAN_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {GUARDIAN_RELATIONSHIP_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone" htmlFor="gm-phone" error={fields.phone} required>
            <Input
              id="gm-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="Email" htmlFor="gm-email" error={fields.email}>
            <Input
              id="gm-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Occupation" htmlFor="gm-occ">
            <Input
              id="gm-occ"
              value={form.occupation}
              onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))}
            />
          </Field>
        </div>
        {!guardian?.isPrimary && (
          <Checkbox
            label="Make primary contact"
            checked={form.isPrimary}
            onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
          />
        )}
      </form>
    </Modal>
  );
}

function EnrolModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const { years, yearId, setYearId } = useYearSelection();
  const sections = useSectionOptions(yearId);
  const { enrol } = useStudentActions(studentId);
  const [form, setForm] = useState({ sectionId: '', rollNumber: '', enrolmentDate: todayIso() });
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await enrol.mutateAsync({ academicYearId: yearId, ...form });
      onClose();
    } catch (e) {
      setError(
        errorMessages(e)
          .map((m) => m.replace(/^\w+: /, ''))
          .join(' '),
      );
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Enrol in a class"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={enrol.isPending} disabled={!form.sectionId}>
            Enrol
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Academic year">
          <YearPicker
            yearId={yearId}
            onChange={setYearId}
            years={years.data?.filter((y) => y.status !== 'CLOSED')}
          />
        </Field>
        <Field label="Class & section" htmlFor="en-sec" required>
          <Select
            id="en-sec"
            value={form.sectionId}
            onChange={(e) => setForm((f) => ({ ...f, sectionId: e.target.value }))}
          >
            <option value="">Select section</option>
            {sections.options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.studentCount}
                {s.capacity ? `/${s.capacity}` : ''})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Roll number" htmlFor="en-roll">
            <Input
              id="en-roll"
              value={form.rollNumber}
              onChange={(e) => setForm((f) => ({ ...f, rollNumber: e.target.value }))}
            />
          </Field>
          <Field label="Enrolment date" htmlFor="en-date">
            <Input
              id="en-date"
              type="date"
              value={form.enrolmentDate}
              onChange={(e) => setForm((f) => ({ ...f, enrolmentDate: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function ChangeSectionModal({
  studentId,
  enrolment,
  onClose,
}: {
  studentId: string;
  enrolment: EnrolmentHistoryItem;
  onClose: () => void;
}) {
  const sections = useSectionOptions(enrolment.academicYear.id);
  const { updateEnrolment } = useStudentActions(studentId);
  const [sectionId, setSectionId] = useState(enrolment.sectionId);
  const [rollNumber, setRollNumber] = useState(enrolment.rollNumber ?? '');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await updateEnrolment.mutateAsync({
        id: enrolment.id,
        sectionId,
        rollNumber: rollNumber || null,
      });
      onClose();
    } catch (e) {
      setError(
        errorMessages(e)
          .map((m) => m.replace(/^\w+: /, ''))
          .join(' '),
      );
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Change section (${enrolment.academicYear.name})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={updateEnrolment.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Class & section" htmlFor="cs-sec">
          <Select id="cs-sec" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Roll number" htmlFor="cs-roll">
          <Input id="cs-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ExitModal({
  studentId,
  studentName,
  enrolment,
  kind,
  onClose,
}: {
  studentId: string;
  studentName: string;
  enrolment: EnrolmentHistoryItem;
  kind: 'transfer' | 'withdraw';
  onClose: () => void;
}) {
  const { exit } = useStudentActions(studentId);
  const [form, setForm] = useState({ exitDate: todayIso(), reason: '' });
  const [error, setError] = useState<string | null>(null);
  const label = kind === 'transfer' ? 'Transfer out' : 'Withdraw';
  const submit = async () => {
    setError(null);
    try {
      await exit.mutateAsync({ id: enrolment.id, kind, ...form });
      onClose();
    } catch (e) {
      setError(
        errorMessages(e)
          .map((m) => m.replace(/^\w+: /, ''))
          .join(' '),
      );
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${label}: ${studentName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={exit.isPending}
            disabled={form.reason.trim().length < 3}
          >
            {label}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Alert tone="warning">
          The student will leave {enrolment.className} – {enrolment.sectionName}. Their records are
          kept; they can be re-admitted later.
        </Alert>
        <Field
          label={kind === 'transfer' ? 'Date of leaving (TC date)' : 'Date of withdrawal'}
          htmlFor="ex-date"
        >
          <Input
            id="ex-date"
            type="date"
            value={form.exitDate}
            onChange={(e) => setForm((f) => ({ ...f, exitDate: e.target.value }))}
          />
        </Field>
        <Field label="Reason" htmlFor="ex-reason" required>
          <Input
            id="ex-reason"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder={kind === 'transfer' ? 'Family relocating to Delhi' : 'Parents request'}
          />
        </Field>
      </div>
    </Modal>
  );
}

// --- Promotions -------------------------------------------------------------------------------

export function PromotionsPage() {
  const confirm = useConfirm();
  const { years } = useYearSelection();
  const yearList = years.data ?? [];
  const [fromYearId, setFromYearId] = useState('');
  const [toYearId, setToYearId] = useState('');
  const from = fromYearId || yearList.find((y) => y.isActive)?.id || '';
  const to =
    toYearId ||
    yearList
      .filter((y) => y.status === 'DRAFT')
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]?.id ||
    '';
  const fromSections = useSectionOptions(from);
  const toSections = useSectionOptions(to);
  const [sectionId, setSectionId] = useState('');
  const students = useStudents({ academicYearId: from, sectionId, pageSize: 100 });
  const promote = usePromote();
  const [choices, setChoices] = useState<
    Record<string, { action: PromotionAction | 'SKIP'; toSectionId: string }>
  >({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const source = fromSections.options.find((s) => s.id === sectionId);
  const nextClassSection = toSections.options.find(
    (s) => source && s.levelOrder === source.levelOrder + 1,
  );
  const sameClassSection = toSections.options.find((s) => source && s.classId === source.classId);
  const isFinal = source && !toSections.options.some((s) => s.levelOrder > source.levelOrder);
  const active = (students.data?.items ?? []).filter(
    (s) => s.enrolment?.status === 'ACTIVE' && s.enrolment.sectionId === sectionId,
  );
  const choiceFor = (enrolmentId: string) =>
    choices[enrolmentId] ?? {
      action: isFinal ? 'COMPLETE' : 'PROMOTE',
      toSectionId: nextClassSection?.id ?? '',
    };

  const submit = async () => {
    setMessage(null);
    const entries = active
      .map((s) => ({ enrolmentId: s.enrolment!.id, ...choiceFor(s.enrolment!.id) }))
      .filter((e) => e.action !== 'SKIP')
      .map((e) => ({
        enrolmentId: e.enrolmentId,
        action: e.action as PromotionAction,
        toSectionId:
          e.action === 'COMPLETE'
            ? undefined
            : e.action === 'RETAIN'
              ? e.toSectionId || sameClassSection?.id
              : e.toSectionId,
      }));
    if (
      !(await confirm({
        title: `Move ${entries.length} student(s) to the next year?`,
        message: `This cannot be undone from here.`,
        confirmLabel: 'Move students',
      }))
    )
      return;
    try {
      const res = await promote.mutateAsync({ toAcademicYearId: to, entries });
      setMessage({
        tone: 'success',
        text: `Done: ${res.promoted} promoted, ${res.retained} retained, ${res.completed} completed.`,
      });
      setChoices({});
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessages(e).slice(0, 5).join(' · ') });
    }
  };

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Promotions"
        description="Move a section's students into the next academic year: promote, retain (repeat the class) or mark as completed."
      />
      <Card className="mb-6 grid gap-4 p-5 sm:grid-cols-3">
        <Field label="From year">
          <YearPicker
            yearId={from}
            onChange={(id) => {
              setFromYearId(id);
              setSectionId('');
            }}
            years={yearList}
          />
        </Field>
        <Field label="From section" htmlFor="pr-sec">
          <Select
            id="pr-sec"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setChoices({});
            }}
          >
            <option value="">Select section</option>
            {fromSections.options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.studentCount})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Into year">
          <YearPicker
            yearId={to}
            onChange={setToYearId}
            years={yearList.filter((y) => y.status !== 'CLOSED' && y.id !== from)}
          />
        </Field>
      </Card>
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {!to ? (
        <Alert tone="info">
          Create the next academic year (and its sections) first — under Academic Years you can copy
          this year's structure.
        </Alert>
      ) : !sectionId ? null : students.isLoading ? (
        <PageSpinner />
      ) : !active.length ? (
        <EmptyState title="No current students in this section" />
      ) : (
        <Card>
          <table className="min-w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">New section</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {active.map((s) => {
                const c = choiceFor(s.enrolment!.id);
                const set = (patch: Partial<typeof c>) =>
                  setChoices((m) => ({ ...m, [s.enrolment!.id]: { ...c, ...patch } }));
                const options = toSections.options.filter((o) =>
                  c.action === 'RETAIN'
                    ? o.classId === source?.classId
                    : o.levelOrder > (source?.levelOrder ?? -1),
                );
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {s.enrolment?.rollNumber ? `${s.enrolment.rollNumber}. ` : ''}
                      {s.fullName}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        aria-label={`Action for ${s.fullName}`}
                        value={c.action}
                        onChange={(e) => {
                          const action = e.target.value as PromotionAction | 'SKIP';
                          set({
                            action,
                            toSectionId:
                              action === 'RETAIN'
                                ? (sameClassSection?.id ?? '')
                                : action === 'PROMOTE'
                                  ? (nextClassSection?.id ?? '')
                                  : '',
                          });
                        }}
                      >
                        <option value="PROMOTE">Promote</option>
                        <option value="RETAIN">Retain (repeat class)</option>
                        <option value="COMPLETE">Completed final class</option>
                        <option value="SKIP">Skip for now</option>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {c.action === 'PROMOTE' || c.action === 'RETAIN' ? (
                        <Select
                          aria-label={`New section for ${s.fullName}`}
                          value={c.toSectionId}
                          onChange={(e) => set({ toSectionId: e.target.value })}
                        >
                          <option value="">Select</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end border-t border-gray-200 p-4">
            <Button onClick={submit} loading={promote.isPending}>
              Apply to {active.length} student(s)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
