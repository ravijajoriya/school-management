import { zodResolver } from '@hookform/resolvers/zod';
import {
  EMPLOYEE_DOCUMENT_TYPES,
  EMPLOYEE_STATUS_LABELS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  PERMISSIONS,
  createEmployeeSchema,
  type CreateEmployeeInput,
  type EmployeeDetail,
  type EmployeeStatus,
} from '@school/shared';
import { ArrowLeft, CalendarOff, IdCard, Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { useRoles, useUsers } from '../api';
import { LeaveHistoryCard } from '@/features/leave/LeaveHistoryCard';
import { DocumentsPanel } from '../components/DocumentsPanel';
import { RoleCheckboxes } from '../components/RoleCheckboxes';
import { TemporaryPasswordModal } from '../components/TemporaryPasswordModal';
import {
  useCreateEmployeeLogin,
  useEmployee,
  useEmployees,
  useLinkEmployeeUser,
  useSaveEmployee,
  useStaffRoleOptions,
} from '../people-api';
import { usePagination } from '@/lib/use-pagination';
import { useConfirm } from '@/lib/dialogs';
import { HeroCard, StaffIllustration } from '@/components/common/HeroCard';
import {
  CountBar,
  FilterCard,
  IconSelect,
  InitialsAvatar,
  SearchBox,
  TonePill,
} from '@/components/common/ListParts';
import { ExportButtons } from '@/features/reports/components/ExportButtons';
import { useViewMode } from '@/lib/use-view-mode';
import { StaffCard, StaffMenu, StaffStatusPill, StaffTile } from './StaffListParts';
import { leaveText } from './staff-format';

const STATUS_TONE = { ACTIVE: 'green', INACTIVE: 'gray', LEFT: 'red' } as const;

export function EmployeesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('ACTIVE');
  const [onLeave, setOnLeave] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [view, setView] = useViewMode('staff');
  const roles = useStaffRoleOptions();
  const role = roles.data?.find((r) => r.id === roleId);
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const [adding, setAdding] = useState(false);
  const list = useEmployees({
    search: useDebouncedValue(search),
    status: status || undefined,
    onLeave: onLeave || undefined,
    roleId: roleId || undefined,
    page,
    pageSize,
  });
  const reset =
    <T,>(fn: (v: T) => void) =>
    (v: T) => {
      fn(v);
      setPage(1);
    };
  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  return (
    <div className="mx-auto max-w-7xl">
      <HeroCard
        title="Staff"
        description="Teaching and non-teaching staff records. Staff on leave today are listed first."
        illustration={<StaffIllustration />}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4 sm:gap-3 [&_button]:text-[13px] sm:[&_button]:text-sm">
        <ExportButtons
          size="md"
          report="staff"
          params={{
            status: status || undefined,
            roleId: roleId || undefined,
            onLeave: onLeave ? 'true' : undefined,
          }}
        />
        <PermissionGate permissions={[PERMISSIONS.EMPLOYEES_MANAGE]}>
          <Button onClick={() => setAdding(true)} className="ml-auto">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add staff member
          </Button>
        </PermissionGate>
      </div>

      <FilterCard id="staff-filters">
        <SearchBox
          className="col-span-2"
          placeholder="Name, code, designation or phone"
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
          aria-label="Search staff"
        />
        <IconSelect
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value as EmployeeStatus | '')}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {EMPLOYEE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {EMPLOYEE_STATUS_LABELS[st]}
            </option>
          ))}
        </IconSelect>
        <IconSelect
          value={roleId}
          onChange={(e) => reset(setRoleId)(e.target.value)}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {roles.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.userCount})
            </option>
          ))}
        </IconSelect>
        <div className="col-span-2 flex items-center px-1 lg:col-span-4">
          <Checkbox
            label="On leave today"
            checked={onLeave}
            onChange={(e) => reset(setOnLeave)(e.target.checked)}
          />
        </div>
      </FilterCard>

      {role && role.usersWithoutStaff.length > 0 && (
        <div className="mb-3 sm:mb-4">
          <Alert tone="info">
            {role.usersWithoutStaff.length} of {role.userCount} user
            {role.userCount === 1 ? '' : 's'} with the {role.name} role{' '}
            {role.usersWithoutStaff.length === 1 ? 'has' : 'have'} no staff record, so{' '}
            {role.usersWithoutStaff.length === 1 ? "isn't" : "aren't"} listed here:{' '}
            <strong>
              {role.usersWithoutStaff
                .map((u) => `${u.fullName}${u.login ? ` (${u.login})` : ''}`)
                .join(', ')}
            </strong>
            . To list them, add a staff record and use “Link existing login” on it.
          </Alert>
        </div>
      )}

      <CountBar
        icon={UsersRound}
        title={`${total.toLocaleString('en-IN')} Staff Member${total === 1 ? '' : 's'}`}
        view={view}
        onViewChange={setView}
      />

      {list.isLoading ? (
        <PageSpinner />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={onLeave ? CalendarOff : UsersRound}
            title={
              onLeave
                ? 'Nobody is on leave today'
                : role
                  ? `No ${status ? `${EMPLOYEE_STATUS_LABELS[status].toLowerCase()} ` : ''}staff with the ${role.name} role`
                  : 'No staff found'
            }
          />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((e) => (
            <StaffTile key={e.id} employee={e} />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2.5 md:hidden">
            {items.map((e) => (
              <StaffCard key={e.id} employee={e} />
            ))}
          </div>
          <Card className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Login / role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-2 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((e) => (
                  <tr
                    key={e.id}
                    className={`cursor-pointer hover:bg-surface/60 ${e.onLeave ? 'bg-orange-50/50' : ''}`}
                    onClick={() => navigate(`/admin/staff/${e.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <InitialsAvatar name={e.fullName} className="h-9 w-9 text-xs" />
                        <div className="min-w-0">
                          <Link
                            to={`/admin/staff/${e.id}`}
                            className="font-semibold text-brand-navy hover:underline"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            {e.fullName}
                          </Link>
                          <div className="text-xs text-ink-muted">{e.employeeCode}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <TonePill>{e.designation}</TonePill>
                      {e.department && (
                        <div className="mt-0.5 text-xs text-ink-muted">{e.department}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      <div className="text-ink">{e.phone ?? '—'}</div>
                      {e.email && <div className="text-xs">{e.email}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      {e.user ? (
                        <div className="flex flex-wrap gap-1">
                          {e.roles.length ? (
                            e.roles.map((r) => (
                              <Badge key={r.id} tone="navy">
                                {r.name}
                              </Badge>
                            ))
                          ) : (
                            <Badge tone="green">Yes</Badge>
                          )}
                        </div>
                      ) : (
                        <Badge tone="gray">No login</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StaffStatusPill employee={e} />
                      {e.onLeave && (
                        <div className="mt-0.5 text-xs text-ink-muted">{leaveText(e.onLeave)}</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                      <StaffMenu employee={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {list.data && total > 0 && (
        <Card className="mt-3 sm:mt-4">
          <Pagination
            className="py-3.5"
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={total}
            onChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </Card>
      )}
      {adding && (
        <EmployeeFormModal
          onClose={() => setAdding(false)}
          onSaved={(id) => navigate(`/admin/staff/${id}`)}
        />
      )}
    </div>
  );
}

function EmployeeFormModal({
  employee,
  onClose,
  onSaved,
}: {
  employee?: EmployeeDetail;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const save = useSaveEmployee();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, control, handleSubmit, setError, formState } = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      employeeCode: employee?.employeeCode ?? '',
      firstName: employee?.firstName ?? '',
      lastName: employee?.lastName ?? '',
      email: employee?.email ?? '',
      phone: employee?.phone ?? '',
      dateOfBirth: employee?.dateOfBirth ?? '',
      joiningDate: employee?.joiningDate ?? todayIso(),
      designation: employee?.designation ?? '',
      department: employee?.department ?? '',
      employmentType: employee?.employmentType ?? '',
      status: employee?.status ?? 'ACTIVE',
      licenceNumber: employee?.licenceNumber ?? '',
      licenceExpiry: employee?.licenceExpiry ?? '',
    },
  });
  const { errors } = formState;
  const designation = useWatch({ control, name: 'designation' }) ?? '';
  const showLicence = /driver/i.test(designation) || !!employee?.licenceNumber;
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const nullable = (v: string | undefined) => (employee ? (v ? v : null) : v);
      const payload = employee
        ? {
            ...values,
            lastName: nullable(values.lastName as string),
            email: nullable(values.email as string),
            phone: nullable(values.phone as string),
            dateOfBirth: nullable(values.dateOfBirth as string),
            department: nullable(values.department as string),
            employmentType: nullable(values.employmentType as string),
            licenceNumber: nullable(values.licenceNumber as string),
            licenceExpiry: nullable(values.licenceExpiry as string),
          }
        : values;
      const saved = await save.mutateAsync({
        id: employee?.id,
        ...(payload as CreateEmployeeInput),
      });
      onSaved?.(saved.id);
      onClose();
    } catch (error) {
      const { fields, general } = splitFieldErrors(error);
      Object.entries(fields).forEach(([k, message]) =>
        setError(k as keyof CreateEmployeeInput, { message }),
      );
      setServerError(general[0] ?? null);
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={employee ? `Edit ${employee.fullName}` : 'Add staff member'}
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" htmlFor="e-first" error={errors.firstName?.message} required>
            <Input id="e-first" {...register('firstName')} />
          </Field>
          <Field label="Last name" htmlFor="e-last" error={errors.lastName?.message}>
            <Input id="e-last" {...register('lastName')} />
          </Field>
          <Field
            label="Employee code"
            htmlFor="e-code"
            error={errors.employeeCode?.message}
            hint={employee ? undefined : 'Empty = automatic'}
          >
            <Input id="e-code" {...register('employeeCode')} />
          </Field>
          <Field label="Designation" htmlFor="e-desig" error={errors.designation?.message} required>
            <Input id="e-desig" placeholder="TGT Mathematics" {...register('designation')} />
          </Field>
          <Field label="Department" htmlFor="e-dept" error={errors.department?.message}>
            <Input id="e-dept" {...register('department')} />
          </Field>
          <Field label="Employment type" htmlFor="e-type">
            <Select id="e-type" {...register('employmentType')}>
              <option value="">—</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phone" htmlFor="e-phone" error={errors.phone?.message}>
            <Input id="e-phone" type="tel" {...register('phone')} />
          </Field>
          <Field label="Email" htmlFor="e-email" error={errors.email?.message}>
            <Input id="e-email" type="email" {...register('email')} />
          </Field>
          <Field label="Date of birth" htmlFor="e-dob" error={errors.dateOfBirth?.message}>
            <Input id="e-dob" type="date" {...register('dateOfBirth')} />
          </Field>
          <Field label="Joining date" htmlFor="e-join" error={errors.joiningDate?.message} required>
            <Input id="e-join" type="date" {...register('joiningDate')} />
          </Field>
          <Field label="Status" htmlFor="e-status">
            <Select id="e-status" {...register('status')}>
              {EMPLOYEE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EMPLOYEE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {showLicence && (
          <fieldset className="rounded-xl border border-gray-200 p-4">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-brand-navy">
              <IdCard className="h-4 w-4" aria-hidden="true" /> Driving licence
            </legend>
            <p className="mb-3 text-xs text-ink-muted">
              Needed before a driver can be put on a vehicle. A licence expiring within 30 days is
              flagged on the Vehicles page.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Licence number"
                htmlFor="e-licence"
                error={errors.licenceNumber?.message}
              >
                <Input
                  id="e-licence"
                  placeholder="RJ14 20190012345"
                  {...register('licenceNumber')}
                />
              </Field>
              <Field
                label="Valid until"
                htmlFor="e-licence-exp"
                error={errors.licenceExpiry?.message}
              >
                <Input id="e-licence-exp" type="date" {...register('licenceExpiry')} />
              </Field>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}

export function EmployeeDetailPage() {
  const confirm = useConfirm();
  const { id = '' } = useParams();
  const employee = useEmployee(id);
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [creatingLogin, setCreatingLogin] = useState(false);
  const [linking, setLinking] = useState(false);
  const link = useLinkEmployeeUser();
  if (employee.isLoading) return <PageSpinner />;
  if (employee.isError || !employee.data) return <Alert>{errorMessages(employee.error)[0]}</Alert>;
  const e = employee.data;
  const manage = can(PERMISSIONS.EMPLOYEES_MANAGE);
  return (
    <div className="max-w-5xl">
      <Link
        to="/admin/staff"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All staff
      </Link>
      <PageHeader
        title={e.fullName}
        description={`${e.employeeCode} · ${e.designation}`}
        actions={
          manage && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {[
                [
                  'Status',
                  <Badge key="s" tone={STATUS_TONE[e.status]}>
                    {EMPLOYEE_STATUS_LABELS[e.status]}
                  </Badge>,
                ],
                ['Department', e.department ?? '—'],
                ['Employment', e.employmentType ? EMPLOYMENT_TYPE_LABELS[e.employmentType] : '—'],
                ['Joined', formatDate(e.joiningDate)],
                ['Phone', e.phone ?? '—'],
                ['Email', e.email ?? '—'],
                ['Date of birth', formatDate(e.dateOfBirth)],
                ...(e.licenceNumber
                  ? [
                      [
                        'Driving licence',
                        `${e.licenceNumber} · valid until ${formatDate(e.licenceExpiry)}`,
                      ],
                    ]
                  : []),
                ...(e.onLeave ? [['Today', leaveText(e.onLeave)]] : []),
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-brand-navy">This year</h2>
            {e.classTeacherOf.length > 0 && (
              <p className="mt-2 text-sm text-ink">
                Class teacher of <strong>{e.classTeacherOf.join(', ')}</strong>
              </p>
            )}
            {e.assignments.length ? (
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {e.assignments.map((a, i) => (
                  <li key={i}>
                    {a.subject} — {a.sectionLabel}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                No teaching assignments in the current year.
              </p>
            )}
          </Card>
          <DocumentsPanel
            basePath={`/employees/${e.id}`}
            refreshKey="employee"
            documents={e.documents}
            types={EMPLOYEE_DOCUMENT_TYPES}
            canManage={manage}
            canDownload={manage}
          />
          {can(PERMISSIONS.LEAVE_READ) && <LeaveHistoryCard employeeId={e.id} />}
        </div>
        <Card className="h-fit space-y-3 p-5">
          <h2 className="font-semibold text-brand-navy">Login</h2>
          {e.user ? (
            <>
              <p className="text-sm text-ink">
                Signs in with <strong>{e.user.email ?? e.user.phone}</strong>{' '}
                <Badge tone={e.user.status === 'ACTIVE' ? 'green' : 'gray'}>
                  {e.user.status.toLowerCase()}
                </Badge>
              </p>
              {manage && can(PERMISSIONS.USERS_UPDATE) && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={link.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Unlink this login from ${e.fullName}?`,
                        message: `The login itself is not deleted.`,
                        confirmLabel: 'Unlink',
                        tone: 'danger',
                      })
                    )
                      void link.mutate({ id: e.id, userId: null });
                  }}
                >
                  Unlink login
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-ink-muted">This staff member cannot sign in yet.</p>
              <div className="flex flex-wrap gap-2">
                {manage && can(PERMISSIONS.USERS_CREATE) && (
                  <Button onClick={() => setCreatingLogin(true)} disabled={!e.email && !e.phone}>
                    Create login
                  </Button>
                )}
                {manage && can(PERMISSIONS.USERS_UPDATE) && can(PERMISSIONS.USERS_READ) && (
                  <Button variant="secondary" onClick={() => setLinking(true)}>
                    Link existing login
                  </Button>
                )}
              </div>
              {!e.email && !e.phone && (
                <p className="text-xs text-ink-muted">Add a phone or email first.</p>
              )}
            </>
          )}
        </Card>
      </div>
      {editing && <EmployeeFormModal employee={e} onClose={() => setEditing(false)} />}
      {creatingLogin && <CreateLoginModal employee={e} onClose={() => setCreatingLogin(false)} />}
      {linking && <LinkLoginModal employee={e} onClose={() => setLinking(false)} />}
    </div>
  );
}

function CreateLoginModal({
  employee,
  onClose,
}: {
  employee: EmployeeDetail;
  onClose: () => void;
}) {
  const roles = useRoles();
  const create = useCreateEmployeeLogin();
  const teacherRoleId = roles.data?.find((r) => r.code === 'TEACHER')?.id;
  const [roleIds, setRoleIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const selected = roleIds ?? (teacherRoleId ? [teacherRoleId] : []);
  if (password)
    return (
      <TemporaryPasswordModal
        open
        onClose={onClose}
        userName={employee.fullName}
        password={password}
      />
    );
  const submit = async () => {
    setError(null);
    try {
      const res = await create.mutateAsync({ id: employee.id, roleIds: selected });
      setPassword(res.temporaryPassword ?? '');
    } catch (e) {
      setError(errorMessages(e).map((m) => m.replace(/^\w+: /, ''))[0]);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Create login for ${employee.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!selected.length}>
            Create login
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <p className="text-sm text-ink">
          They will sign in with <strong>{employee.email ?? employee.phone}</strong> and a one-time
          temporary password.
        </p>
        <Field label="Roles">
          <RoleCheckboxes roles={roles.data ?? []} value={selected} onChange={setRoleIds} />
        </Field>
      </div>
    </Modal>
  );
}

/** Connects a login that already exists (e.g. created under Users) to this staff record. */
function LinkLoginModal({ employee, onClose }: { employee: EmployeeDetail; onClose: () => void }) {
  const [search, setSearch] = useState(employee.email ?? employee.phone ?? '');
  const users = useUsers({ search: useDebouncedValue(search), pageSize: 10 });
  const link = useLinkEmployeeUser();
  const [error, setError] = useState<string | null>(null);
  const choose = async (userId: string) => {
    setError(null);
    try {
      await link.mutateAsync({ id: employee.id, userId });
      onClose();
    } catch (err) {
      setError(errorMessages(err).map((m) => m.replace(/^\w+: /, ''))[0]);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Link a login to ${employee.fullName}`}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Find login" htmlFor="ll-search">
          <Input
            id="ll-search"
            type="search"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            placeholder="Name, email or phone"
          />
        </Field>
        {users.isLoading ? (
          <PageSpinner />
        ) : !users.data?.items.length ? (
          <p className="text-sm text-ink-muted">No matching logins.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.data.items.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-ink">{u.fullName}</p>
                  <p className="truncate text-ink-muted">
                    {u.email ?? u.phone} · {u.roles.map((r) => r.name).join(', ') || 'no roles'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => choose(u.id)}
                  loading={link.isPending && link.variables?.userId === u.id}
                  aria-label={`Link ${u.fullName}`}
                >
                  Link
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
