import {
  PERMISSIONS,
  VEHICLE_STATUSES,
  formatRupees,
  type CrewMember,
  type CrewOption,
  type LicenceStatus,
  type RouteItem,
  type StudentListItem,
  type VehicleDetail,
  type VehicleItem,
  type VehicleServiceItem,
} from '@school/shared';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bus,
  CalendarClock,
  Gauge,
  IdCard,
  Pencil,
  Phone,
  Plus,
  Printer,
  Route as RouteIcon,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
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
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { formatDate, todayIso } from '@/lib/format';
import { StudentFinder, Td, Th } from '../components/OpsParts';
import { tbodyClass, theadClass, useFormErrors } from '../ops-utils';
import {
  useAssignTransport,
  useCrewOptions,
  useDeleteVehicleService,
  useEndTransport,
  useRoutes,
  useSaveRoute,
  useSaveVehicle,
  useSaveVehicleService,
  useTransportAssignments,
  useVehicle,
  useVehicles,
} from '../operations-api';
import { ExportButtons } from '@/features/reports/components/ExportButtons';
import { useConfirm, usePrompt } from '@/lib/dialogs';

const km = (n: number) => `${n.toLocaleString('en-IN')} km`;

/** Routes / Students / Vehicles, with the current one highlighted. */
function TransportTabs() {
  const { pathname } = useLocation();
  const tabs = [
    {
      to: '/admin/transport',
      label: 'Routes',
      icon: RouteIcon,
      active: pathname === '/admin/transport' || pathname.startsWith('/admin/transport/routes'),
    },
    {
      to: '/admin/transport/students',
      label: 'Students',
      icon: Users,
      active: pathname.startsWith('/admin/transport/students'),
    },
    {
      to: '/admin/transport/vehicles',
      label: 'Vehicles',
      icon: Bus,
      active: pathname.startsWith('/admin/transport/vehicles'),
    },
  ];
  return (
    <nav
      aria-label="Transport"
      className="mb-5 inline-flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-gray-200 print:hidden"
    >
      {tabs.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          aria-current={t.active ? 'page' : undefined}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            t.active
              ? 'bg-brand-navy text-white shadow-sm'
              : 'text-ink-muted hover:bg-brand-gold-light hover:text-brand-navy'
          }`}
        >
          <t.icon className="h-4 w-4" aria-hidden="true" />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const crewLine = (v: { driver: CrewMember | null; conductor: CrewMember | null }) =>
  [
    v.driver ? `Driver ${v.driver.fullName}` : 'No driver',
    v.conductor ? `Conductor ${v.conductor.fullName}` : 'No conductor',
  ].join(' · ');

// --- Routes ----------------------------------------------------------------------------------

export function RoutesPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.TRANSPORT_MANAGE);
  const routes = useRoutes();
  const [editing, setEditing] = useState<RouteItem | 'new' | null>(null);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Transport"
        icon={Bus}
        description="Bus routes, stops and who rides them. Transport fees are billed in Fees (a fee plan or a one-off charge)."
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New route
            </Button>
          )
        }
      />
      <TransportTabs />
      {routes.isLoading ? (
        <PageSpinner />
      ) : !routes.data?.length ? (
        <Card>
          <EmptyState
            icon={RouteIcon}
            title="No routes yet"
            description="Add a route with its stops and vehicle. The vehicle brings its driver and conductor."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {routes.data.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-brand-navy">{r.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <Bus className="h-3.5 w-3.5" aria-hidden="true" />
                    {r.vehicle ? r.vehicle.registrationNumber : 'No vehicle'}
                  </p>
                  {r.vehicle && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {crewLine(r.vehicle)}
                    </p>
                  )}
                </div>
                {!r.isActive && <Badge>Inactive</Badge>}
              </div>
              <ol className="mt-3 space-y-1 text-sm">
                {r.stops.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span>
                      {s.sequenceNo}. {s.name}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {s.pickupTime ?? '—'} / {s.dropTime ?? '—'} · {s.students}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm">
                  <strong>{r.students}</strong> student{r.students === 1 ? '' : 's'}
                  {r.vehicle?.capacity ? ` of ${r.vehicle.capacity} seats` : ''}
                </span>
                <div className="flex gap-2">
                  <Link
                    to={`/admin/transport/routes/${r.id}`}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-brand-gold-light"
                  >
                    Route sheet
                  </Link>
                  {manage && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <RouteModal route={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

interface StopRow {
  key: string;
  id?: string;
  name: string;
  pickupTime: string;
  dropTime: string;
}

function RouteModal({ route, onClose }: { route: RouteItem | null; onClose: () => void }) {
  const save = useSaveRoute();
  const vehicles = useVehicles();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    name: route?.name ?? '',
    description: route?.description ?? '',
    vehicleId: route?.vehicle?.id ?? '',
    isActive: route?.isActive ?? true,
  });
  const [stops, setStops] = useState<StopRow[]>(
    route?.stops.map((s) => ({
      key: s.id,
      id: s.id,
      name: s.name,
      pickupTime: s.pickupTime ?? '',
      dropTime: s.dropTime ?? '',
    })) ?? [],
  );
  const vehicle = vehicles.data?.find((v) => v.id === form.vehicleId);
  const setStop = (i: number, patch: Partial<StopRow>) =>
    setStops((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) =>
    setStops((all) => {
      const next = [...all];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const submit = async () => {
    errs.reset();
    try {
      await save.mutateAsync({
        id: route?.id,
        ...form,
        stops: stops.map(({ id, name, pickupTime, dropTime }) => ({
          id,
          name,
          pickupTime,
          dropTime,
        })),
      });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      size="lg"
      icon={RouteIcon}
      onClose={onClose}
      title={route ? `Edit ${route.name}` : 'New route'}
      description="Stops in order, with pick-up and drop times."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save route
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Route name" htmlFor="rt-name" error={errs.fields.name} required>
            <Input
              id="rt-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Route 1 – Vaishali Nagar"
            />
          </Field>
          <Field
            label="Vehicle"
            htmlFor="rt-vehicle"
            error={errs.fields.vehicleId}
            hint={
              vehicle
                ? crewLine(vehicle)
                : 'The driver and conductor are set on the vehicle (Vehicles tab).'
            }
          >
            <Select
              id="rt-vehicle"
              value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
            >
              <option value="">None</option>
              {vehicles.data
                ?.filter((v) => v.status === 'ACTIVE' || v.id === form.vehicleId)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationNumber}
                    {v.capacity ? ` (${v.capacity} seats)` : ''}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Stops (in order)</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setStops((s) => [
                  ...s,
                  { key: crypto.randomUUID(), name: '', pickupTime: '', dropTime: '' },
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add stop
            </Button>
          </div>
          {errs.fields.stops && <p className="mb-2 text-sm text-red-700">{errs.fields.stops}</p>}
          {!stops.length && (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-ink-muted">
              No stops yet. Add the first pick-up point.
            </p>
          )}
          <div className="space-y-2">
            {stops.map((s, i) => (
              <div
                key={s.key}
                className="grid grid-cols-1 items-end gap-2 rounded-lg bg-surface/60 p-2 sm:grid-cols-[1fr_8.5rem_8.5rem_auto]"
              >
                <Field label={`Stop ${i + 1}`} htmlFor={`stop-${s.key}`}>
                  <Input
                    id={`stop-${s.key}`}
                    value={s.name}
                    onChange={(e) => setStop(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="Pick-up" htmlFor={`pick-${s.key}`}>
                  <Input
                    id={`pick-${s.key}`}
                    type="time"
                    value={s.pickupTime}
                    onChange={(e) => setStop(i, { pickupTime: e.target.value })}
                  />
                </Field>
                <Field label="Drop" htmlFor={`drop-${s.key}`}>
                  <Input
                    id={`drop-${s.key}`}
                    type="time"
                    value={s.dropTime}
                    onChange={(e) => setStop(i, { dropTime: e.target.value })}
                  />
                </Field>
                <div className="flex pb-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move stop ${i + 1} up`}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === stops.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move stop ${i + 1} down`}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStops((all) => all.filter((_, j) => j !== i))}
                    aria-label={`Remove stop ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {route && (
          <Checkbox
            label="Active (inactive routes can't take new students)"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
        )}
      </div>
    </Modal>
  );
}

/** Printable list of riders by stop, with guardian phones. */
export function RouteSheetPage() {
  const { id = '' } = useParams();
  const routes = useRoutes();
  const riders = useTransportAssignments({ routeId: id });
  const route = routes.data?.find((r) => r.id === id);
  if (routes.isLoading || riders.isLoading) return <PageSpinner />;
  if (!route) return <Alert>Route not found</Alert>;
  const withPhone = (p: CrewMember | null, label: string) =>
    p ? ` · ${label}: ${p.fullName}${p.phone ? ` (${p.phone})` : ''}` : '';
  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/admin/transport"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Transport
        </Link>
        <Button onClick={async () => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </Button>
      </div>
      <Card className="p-6 print:border-0 print:shadow-none">
        <h1 className="text-xl font-bold text-brand-navy">{route.name}</h1>
        <p className="text-sm text-ink-muted">
          {route.vehicle?.registrationNumber ?? 'No vehicle'}
          {route.vehicle && withPhone(route.vehicle.driver, 'Driver')}
          {route.vehicle && withPhone(route.vehicle.conductor, 'Conductor')}
          {` · As of ${formatDate(todayIso())}`}
        </p>
        <table className="mt-4 min-w-full text-sm">
          <thead className={theadClass}>
            <tr>
              <Th>Stop</Th>
              <Th>Student</Th>
              <Th>Class</Th>
              <Th>Guardian phone</Th>
            </tr>
          </thead>
          <tbody className={tbodyClass}>
            {riders.data?.map((a) => (
              <tr key={a.id}>
                <Td>
                  {a.stop ? a.stop.name : '—'}
                  {a.stop?.pickupTime && (
                    <span className="text-xs text-ink-muted"> ({a.stop.pickupTime})</span>
                  )}
                </Td>
                <Td>
                  {a.student.fullName}{' '}
                  <span className="text-xs text-ink-muted">{a.student.admissionNumber}</span>
                </Td>
                <Td>
                  {a.student.className} – {a.student.sectionName}
                </Td>
                <Td>{a.student.guardianPhone ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        {!riders.data?.length && <EmptyState title="No students on this route" />}
      </Card>
    </div>
  );
}

// --- Students --------------------------------------------------------------------------------

export function TransportStudentsPage() {
  const prompt = usePrompt();
  const { can } = useAuth();
  const manage = can(PERMISSIONS.TRANSPORT_MANAGE);
  const routes = useRoutes();
  const [routeId, setRouteId] = useState('');
  const list = useTransportAssignments({ routeId: routeId || undefined });
  const end = useEndTransport();
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEnd = async (id: string, name: string) => {
    const endDate = await prompt({
      title: `End transport for ${name}`,
      label: 'Last day of transport',
      inputType: 'date',
      defaultValue: todayIso(),
      confirmLabel: 'End transport',
      tone: 'danger',
    });
    if (!endDate) return;
    setError(null);
    try {
      await end.mutateAsync({ id, endDate });
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Transport"
        description="Students currently using school transport."
        actions={
          <>
            <ExportButtons report="transport-riders" params={{ routeId: routeId || undefined }} />
            {manage && <Button onClick={() => setAssigning(true)}>Assign student</Button>}
          </>
        }
      />
      <TransportTabs />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <Card>
        <div className="border-b border-gray-100 p-4">
          <Field label="Route" htmlFor="ts-route">
            <Select
              id="ts-route"
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="max-w-xs"
            >
              <option value="">All routes</option>
              {routes.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {list.isLoading ? (
          <PageSpinner />
        ) : !list.data?.length ? (
          <EmptyState title="No students assigned" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Student</Th>
                <Th>Route / stop</Th>
                <Th>From</Th>
                <Th>Until</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {list.data.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <div className="font-medium text-ink">{a.student.fullName}</div>
                    <div className="text-xs text-ink-muted">
                      {a.student.className} – {a.student.sectionName} · {a.student.admissionNumber}
                    </div>
                  </Td>
                  <Td>
                    {a.route.name}
                    {a.stop && <div className="text-xs text-ink-muted">{a.stop.name}</div>}
                  </Td>
                  <Td>{formatDate(a.startDate)}</Td>
                  <Td>{a.endDate ? formatDate(a.endDate) : 'Ongoing'}</Td>
                  <Td right>
                    {manage && !a.endDate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEnd(a.id, a.student.fullName)}
                      >
                        End
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {assigning && <AssignModal routes={routes.data ?? []} onClose={() => setAssigning(false)} />}
    </div>
  );
}

function AssignModal({ routes, onClose }: { routes: RouteItem[]; onClose: () => void }) {
  const assign = useAssignTransport();
  const errs = useFormErrors();
  const [student, setStudent] = useState<StudentListItem | null>(null);
  const [routeId, setRouteId] = useState('');
  const [stopId, setStopId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const route = routes.find((r) => r.id === routeId);
  const submit = async () => {
    errs.reset();
    if (!student?.enrolment) {
      errs.capture({
        response: { data: { message: ['enrolmentId: Choose a currently enrolled student'] } },
      });
      return;
    }
    try {
      await assign.mutateAsync({
        enrolmentId: student.enrolment.id,
        routeId,
        routeStopId: stopId,
        startDate,
      });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Assign transport"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={assign.isPending}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errs.general && <Alert>{errs.general}</Alert>}
        <StudentFinder
          id="ta-student"
          value={student}
          onChange={setStudent}
          error={errs.fields.enrolmentId}
        />
        <Field label="Route" htmlFor="ta-route" error={errs.fields.routeId} required>
          <Select
            id="ta-route"
            value={routeId}
            onChange={(e) => {
              setRouteId(e.target.value);
              setStopId('');
            }}
          >
            <option value="">Choose…</option>
            {routes
              .filter((r) => r.isActive)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.students}
                  {r.vehicle?.capacity ? `/${r.vehicle.capacity}` : ''})
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Stop" htmlFor="ta-stop" error={errs.fields.routeStopId}>
          <Select
            id="ta-stop"
            value={stopId}
            onChange={(e) => setStopId(e.target.value)}
            disabled={!route}
          >
            <option value="">—</option>
            {route?.stops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="From"
          htmlFor="ta-start"
          error={errs.fields.startDate}
          hint="If the student is already on a route, that ends the day before."
        >
          <Input
            id="ta-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// --- Vehicles --------------------------------------------------------------------------------

const LICENCE_BADGE: Record<LicenceStatus, { tone: 'green' | 'amber' | 'red'; label: string }> = {
  OK: { tone: 'green', label: 'Licence valid' },
  EXPIRING: { tone: 'amber', label: 'Licence expiring' },
  EXPIRED: { tone: 'red', label: 'Licence expired' },
  MISSING: { tone: 'red', label: 'No licence on record' },
};

function VehicleAlerts({ v }: { v: VehicleItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={v.status === 'ACTIVE' ? 'green' : 'gray'}>
        {v.status === 'ACTIVE' ? 'Active' : 'Inactive'}
      </Badge>
      {v.crewMissing && <Badge tone="red">Crew missing</Badge>}
      {v.driver && v.driver.licenceStatus !== 'OK' && v.status === 'ACTIVE' && (
        <Badge tone={LICENCE_BADGE[v.driver.licenceStatus].tone}>
          {LICENCE_BADGE[v.driver.licenceStatus].label}
        </Badge>
      )}
      {v.documentsDue && <Badge tone="amber">Renewal due</Badge>}
      {v.serviceDue && <Badge tone="amber">Service due</Badge>}
    </div>
  );
}

export function VehiclesPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const manage = can(PERMISSIONS.TRANSPORT_MANAGE);
  const vehicles = useVehicles();
  const [editing, setEditing] = useState<VehicleItem | 'new' | null>(null);
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Transport"
        icon={Bus}
        description="School buses and vans with their driver and conductor, renewal dates and service history."
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> New vehicle
            </Button>
          )
        }
      />
      <TransportTabs />
      <Card className="overflow-x-auto">
        {vehicles.isLoading ? (
          <PageSpinner />
        ) : !vehicles.data?.length ? (
          <EmptyState icon={Bus} title="No vehicles yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Vehicle</Th>
                <Th>Driver</Th>
                <Th>Conductor</Th>
                <Th>Next service</Th>
                <Th>Insurance / permit</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {vehicles.data.map((v) => (
                <tr
                  key={v.id}
                  className="cursor-pointer hover:bg-surface/60"
                  onClick={() => navigate(`/admin/transport/vehicles/${v.id}`)}
                >
                  <Td>
                    <Link
                      to={`/admin/transport/vehicles/${v.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="whitespace-nowrap font-mono font-medium text-brand-navy hover:underline"
                    >
                      {v.registrationNumber}
                    </Link>
                    <div className="text-xs text-ink-muted">
                      {[v.vehicleType, v.capacity ? `${v.capacity} seats` : null]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </Td>
                  <Td>
                    {v.driver ? (
                      <>
                        <div className="text-ink">{v.driver.fullName}</div>
                        <div className="text-xs text-ink-muted">{v.driver.phone ?? '—'}</div>
                      </>
                    ) : (
                      <span className="text-red-700">Not set</span>
                    )}
                  </Td>
                  <Td>
                    {v.conductor ? (
                      <>
                        <div className="text-ink">{v.conductor.fullName}</div>
                        <div className="text-xs text-ink-muted">{v.conductor.phone ?? '—'}</div>
                      </>
                    ) : (
                      <span className="text-red-700">Not set</span>
                    )}
                  </Td>
                  <Td>
                    {v.nextServiceKm || v.nextServiceDate ? (
                      <>
                        {v.nextServiceKm && (
                          <div className="whitespace-nowrap">At {km(v.nextServiceKm)}</div>
                        )}
                        {v.nextServiceDate && (
                          <div className="whitespace-nowrap text-xs text-ink-muted">
                            By {formatDate(v.nextServiceDate)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-muted">No record</span>
                    )}
                  </Td>
                  <Td>
                    <div>{formatDate(v.insuranceExpiry)}</div>
                    <div className="text-xs text-ink-muted">{formatDate(v.permitExpiry)}</div>
                  </Td>
                  <Td>
                    <VehicleAlerts v={v} />
                  </Td>
                  <Td right>
                    {manage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(v);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <VehicleModal
          vehicle={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Why a crew option can't be picked (on another vehicle, licence problem), or null. */
function crewBlock(o: CrewOption, vehicleId: string | undefined, driver: boolean) {
  if (o.onVehicle && o.onVehicle.id !== vehicleId) return `on ${o.onVehicle.registrationNumber}`;
  if (driver) {
    if (!o.licenceNumber || !o.licenceExpiry) return 'no licence on record';
    if (o.licenceExpiry < todayIso()) return 'licence expired';
  }
  return null;
}

function CrewSelect({
  id,
  label,
  options,
  value,
  onChange,
  vehicleId,
  driver,
  error,
  required,
}: {
  id: string;
  label: string;
  options: CrewOption[] | undefined;
  value: string;
  onChange: (v: string) => void;
  vehicleId?: string;
  driver: boolean;
  error?: string;
  required: boolean;
}) {
  const chosen = options?.find((o) => o.id === value);
  const hint = chosen
    ? [
        chosen.phone,
        driver && chosen.licenceNumber
          ? `Licence ${chosen.licenceNumber} until ${formatDate(chosen.licenceExpiry)}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : `Staff with the designation ${driver ? 'Driver' : 'Conductor'}`;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={!!error}>
        <option value="">Choose…</option>
        {options?.map((o) => {
          const block = crewBlock(o, vehicleId, driver);
          return (
            <option key={o.id} value={o.id} disabled={!!block && o.id !== value}>
              {o.fullName}
              {block ? ` (${block})` : ''}
            </option>
          );
        })}
      </Select>
    </Field>
  );
}

function VehicleModal({ vehicle, onClose }: { vehicle: VehicleItem | null; onClose: () => void }) {
  const save = useSaveVehicle();
  const crew = useCrewOptions();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    registrationNumber: vehicle?.registrationNumber ?? '',
    vehicleType: vehicle?.vehicleType ?? '',
    capacity: vehicle?.capacity?.toString() ?? '',
    insuranceExpiry: vehicle?.insuranceExpiry ?? '',
    permitExpiry: vehicle?.permitExpiry ?? '',
    status: vehicle?.status ?? 'ACTIVE',
    driverEmployeeId: vehicle?.driver?.id ?? '',
    conductorEmployeeId: vehicle?.conductor?.id ?? '',
    notes: vehicle?.notes ?? '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  const active = form.status === 'ACTIVE';
  const noCrewStaff =
    crew.data && (!crew.data.drivers.length || !crew.data.conductors.length) ? true : false;
  const submit = async () => {
    errs.reset();
    try {
      await save.mutateAsync({ id: vehicle?.id, ...form });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      size="lg"
      icon={Bus}
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.registrationNumber}` : 'New vehicle'}
      description="An active vehicle needs a driver and a conductor."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save vehicle
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Registration number"
            htmlFor="vh-reg"
            error={errs.fields.registrationNumber}
            required
          >
            <Input
              id="vh-reg"
              value={form.registrationNumber}
              onChange={set('registrationNumber')}
              placeholder="RJ 14 PA 1234"
            />
          </Field>
          <Field label="Type" htmlFor="vh-type">
            <Input
              id="vh-type"
              value={form.vehicleType}
              onChange={set('vehicleType')}
              placeholder="Bus / Van"
            />
          </Field>
          <Field label="Seats" htmlFor="vh-cap" error={errs.fields.capacity}>
            <Input
              id="vh-cap"
              type="number"
              min={1}
              value={form.capacity}
              onChange={set('capacity')}
            />
          </Field>
          <Field label="Status" htmlFor="vh-status">
            <Select id="vh-status" value={form.status} onChange={set('status')}>
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'ACTIVE' ? 'Active' : 'Inactive'}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="rounded-xl border border-gray-200 p-4">
          <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-brand-navy">
            <UserRound className="h-4 w-4" aria-hidden="true" /> Crew
          </legend>
          {noCrewStaff && (
            <div className="mb-3">
              <Alert tone="info">
                Add drivers and conductors in{' '}
                <Link to="/admin/staff" className="font-medium underline">
                  Staff
                </Link>{' '}
                with the designation “Driver” or “Conductor” (drivers also need their licence number
                and expiry).
              </Alert>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <CrewSelect
              id="vh-driver"
              label="Driver"
              driver
              options={crew.data?.drivers}
              value={form.driverEmployeeId}
              onChange={(v) => setForm({ ...form, driverEmployeeId: v })}
              vehicleId={vehicle?.id}
              error={errs.fields.driverEmployeeId}
              required={active}
            />
            <CrewSelect
              id="vh-conductor"
              label="Conductor"
              driver={false}
              options={crew.data?.conductors}
              value={form.conductorEmployeeId}
              onChange={(v) => setForm({ ...form, conductorEmployeeId: v })}
              vehicleId={vehicle?.id}
              error={errs.fields.conductorEmployeeId}
              required={active}
            />
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Insurance valid until" htmlFor="vh-ins">
            <Input
              id="vh-ins"
              type="date"
              value={form.insuranceExpiry}
              onChange={set('insuranceExpiry')}
            />
          </Field>
          <Field label="Permit valid until" htmlFor="vh-permit">
            <Input
              id="vh-permit"
              type="date"
              value={form.permitExpiry}
              onChange={set('permitExpiry')}
            />
          </Field>
        </div>
        <Field label="Notes" htmlFor="vh-notes">
          <Textarea id="vh-notes" rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Modal>
  );
}

// --- Vehicle detail & service history ----------------------------------------------------------

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Bus;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
        <Icon className="h-4 w-4 text-brand-gold-dark" aria-hidden="true" /> {title}
      </h2>
      <div className="space-y-3 text-sm">{children}</div>
    </Card>
  );
}

function Person({ label, p, extra }: { label: string; p: CrewMember | null; extra?: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      {p ? (
        <>
          <p className="font-medium text-ink">{p.fullName}</p>
          {p.phone && (
            <a
              href={`tel:${p.phone}`}
              className="inline-flex items-center gap-1 text-xs text-brand-navy hover:underline"
            >
              <Phone className="h-3 w-3" aria-hidden="true" /> {p.phone}
            </a>
          )}
          {extra}
        </>
      ) : (
        <p className="font-medium text-red-700">Not set</p>
      )}
    </div>
  );
}

export function VehicleDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const manage = can(PERMISSIONS.TRANSPORT_MANAGE);
  const confirm = useConfirm();
  const vehicle = useVehicle(id);
  const remove = useDeleteVehicleService();
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [service, setService] = useState<VehicleServiceItem | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (vehicle.isLoading) return <PageSpinner />;
  if (vehicle.isError || !vehicle.data) return <Alert>{errorMessages(vehicle.error)[0]}</Alert>;
  const v: VehicleDetail = vehicle.data;
  const onDelete = async (s: VehicleServiceItem) => {
    const ok = await confirm({
      title: 'Delete this service record?',
      message: `The ${formatDate(s.serviceDate)} service at ${km(s.odometerKm)} (${formatRupees(s.totalCost)}) will be removed. This is recorded in the audit log.`,
      confirmLabel: 'Delete record',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    try {
      await remove.mutateAsync(s.id);
    } catch (e) {
      setError(errorMessages(e)[0]);
    }
  };
  return (
    <div className="max-w-6xl">
      <Link
        to="/admin/transport/vehicles"
        className="mb-4 inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Vehicles
      </Link>
      <PageHeader
        title={v.registrationNumber}
        icon={Bus}
        description={
          [v.vehicleType, v.capacity ? `${v.capacity} seats` : null, ...v.routes.map((r) => r.name)]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        actions={
          manage && (
            <>
              <Button variant="secondary" onClick={() => setEditingVehicle(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit vehicle
              </Button>
              <Button onClick={() => setService('new')}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Add service record
              </Button>
            </>
          )
        }
      />
      <div className="mb-4">
        <VehicleAlerts v={v} />
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <InfoCard icon={UserRound} title="Crew">
          <Person
            label="Driver"
            p={v.driver}
            extra={
              v.driver && (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  <IdCard className="h-3.5 w-3.5" aria-hidden="true" />
                  {v.driver.licenceNumber ?? 'No licence number'}
                  {v.driver.licenceExpiry && ` · until ${formatDate(v.driver.licenceExpiry)}`}
                  <Badge tone={LICENCE_BADGE[v.driver.licenceStatus].tone}>
                    {LICENCE_BADGE[v.driver.licenceStatus].label}
                  </Badge>
                </p>
              )
            }
          />
          <Person label="Conductor" p={v.conductor} />
        </InfoCard>
        <InfoCard icon={Gauge} title="Service">
          <div>
            <p className="text-xs text-ink-muted">Last service</p>
            <p className="font-medium text-ink">
              {v.lastService
                ? `${formatDate(v.lastService.serviceDate)} at ${km(v.lastService.odometerKm)}`
                : 'No record yet'}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Next service</p>
            <p className="font-medium text-ink">
              {[
                v.nextServiceKm ? `At ${km(v.nextServiceKm)}` : null,
                v.nextServiceDate ? `by ${formatDate(v.nextServiceDate)}` : null,
              ]
                .filter(Boolean)
                .join(' or ') || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Spent on services</p>
            <p className="font-medium text-ink">
              {formatRupees(v.serviceTotals.thisYearCost)} this year ·{' '}
              {formatRupees(v.serviceTotals.totalCost)} in all ({v.serviceTotals.count} record
              {v.serviceTotals.count === 1 ? '' : 's'})
            </p>
          </div>
        </InfoCard>
        <InfoCard icon={ShieldCheck} title="Documents">
          <div>
            <p className="text-xs text-ink-muted">Insurance valid until</p>
            <p className="font-medium text-ink">{formatDate(v.insuranceExpiry)}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Permit valid until</p>
            <p className="font-medium text-ink">{formatDate(v.permitExpiry)}</p>
          </div>
          {v.notes && <p className="text-ink-muted">{v.notes}</p>}
        </InfoCard>
      </div>

      <Card className="overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Wrench className="h-4 w-4 text-brand-gold-dark" aria-hidden="true" />
          <h2 className="font-semibold text-brand-navy">Service history</h2>
        </div>
        {!v.services.length ? (
          <EmptyState
            icon={Wrench}
            title="No service records yet"
            description="Record each service with the kilometre reading, parts fitted, cost and who took the vehicle."
          />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Date</Th>
                <Th>Odometer</Th>
                <Th>Garage</Th>
                <Th>New parts</Th>
                <Th>Went with</Th>
                <Th right>Cost</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {v.services.map((s) => (
                <tr key={s.id} className="align-top">
                  <Td>
                    <div className="font-medium text-ink">{formatDate(s.serviceDate)}</div>
                    {(s.nextServiceKm || s.nextServiceDate) && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                        <CalendarClock className="h-3 w-3" aria-hidden="true" />
                        Next{s.nextServiceKm ? ` at ${km(s.nextServiceKm)}` : ''}
                        {s.nextServiceDate ? ` by ${formatDate(s.nextServiceDate)}` : ''}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div>{km(s.odometerKm)}</div>
                    {s.kmSincePrevious !== null && (
                      <div className="text-xs text-ink-muted">
                        +{km(s.kmSincePrevious)} since last
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div>{s.garageName ?? '—'}</div>
                    {s.invoiceNumber && (
                      <div className="text-xs text-ink-muted">Invoice {s.invoiceNumber}</div>
                    )}
                    {s.notes && (
                      <div className="mt-1 max-w-56 text-xs text-ink-muted">{s.notes}</div>
                    )}
                  </Td>
                  <Td>
                    {s.parts.length ? (
                      <ul className="space-y-0.5">
                        {s.parts.map((p) => (
                          <li key={p.id} className="flex justify-between gap-3">
                            <span>
                              {p.partName}
                              {p.quantity > 1 && (
                                <span className="text-ink-muted"> × {p.quantity}</span>
                              )}
                            </span>
                            <span className="text-xs text-ink-muted">{formatRupees(p.cost)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-ink-muted">None</span>
                    )}
                  </Td>
                  <Td>
                    {s.staff.length
                      ? s.staff.map((p) => (
                          <div key={p.id}>
                            {p.fullName}
                            <span className="text-xs text-ink-muted"> · {p.designation}</span>
                          </div>
                        ))
                      : '—'}
                  </Td>
                  <Td right>
                    <div className="font-semibold text-ink">{formatRupees(s.totalCost)}</div>
                    <div className="text-xs text-ink-muted">
                      Parts {formatRupees(s.partsCost)} · Labour {formatRupees(s.labourCost)}
                    </div>
                  </Td>
                  <Td right>
                    {manage && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setService(s)}
                          aria-label={`Edit service of ${formatDate(s.serviceDate)}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(s)}
                          aria-label={`Delete service of ${formatDate(s.serviceDate)}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editingVehicle && <VehicleModal vehicle={v} onClose={() => setEditingVehicle(false)} />}
      {service && (
        <ServiceModal
          vehicle={v}
          service={service === 'new' ? null : service}
          onClose={() => setService(null)}
        />
      )}
    </div>
  );
}

interface PartRow {
  key: string;
  partName: string;
  quantity: string;
  cost: string;
}

function ServiceModal({
  vehicle,
  service,
  onClose,
}: {
  vehicle: VehicleDetail;
  service: VehicleServiceItem | null;
  onClose: () => void;
}) {
  const save = useSaveVehicleService(vehicle.id);
  const crew = useCrewOptions();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    serviceDate: service?.serviceDate ?? todayIso(),
    odometerKm: service?.odometerKm.toString() ?? '',
    garageName: service?.garageName ?? '',
    invoiceNumber: service?.invoiceNumber ?? '',
    nextServiceKm: service?.nextServiceKm?.toString() ?? '',
    nextServiceDate: service?.nextServiceDate ?? '',
    labourCost: service ? service.labourCost.toString() : '',
    notes: service?.notes ?? '',
  });
  const [parts, setParts] = useState<PartRow[]>(
    service?.parts.map((p) => ({
      key: p.id,
      partName: p.partName,
      quantity: p.quantity.toString(),
      cost: p.cost.toString(),
    })) ?? [],
  );
  // New records start with the vehicle's crew ticked.
  const [staffIds, setStaffIds] = useState<string[]>(
    service
      ? service.staff.map((s) => s.id)
      : ([vehicle.driver?.id, vehicle.conductor?.id].filter(Boolean) as string[]),
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
  const setPart = (i: number, patch: Partial<PartRow>) =>
    setParts((all) => all.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const toNumber = (v: string) => (v.trim() === '' ? 0 : Number(v) || 0);
  const partsTotal = parts.reduce((n, p) => n + toNumber(p.cost), 0);
  const total = partsTotal + toNumber(form.labourCost);
  const partErrors = Object.entries(errs.fields).filter(([k]) => k.startsWith('parts'));
  // Staff picker: crew first, then everyone else by name.
  const staff = [...(crew.data?.staff ?? [])];
  for (const s of service?.staff ?? []) if (!staff.some((x) => x.id === s.id)) staff.push(s);
  const crewIds = [vehicle.driver?.id, vehicle.conductor?.id];
  staff.sort(
    (a, b) =>
      Number(crewIds.includes(b.id)) - Number(crewIds.includes(a.id)) ||
      a.fullName.localeCompare(b.fullName),
  );
  const submit = async () => {
    errs.reset();
    try {
      await save.mutateAsync({
        id: service?.id,
        ...form,
        labourCost: form.labourCost || 0,
        parts: parts.map((p) => ({ partName: p.partName, quantity: p.quantity, cost: p.cost })),
        staffIds,
      });
      onClose();
    } catch (e) {
      errs.capture(e);
    }
  };
  return (
    <Modal
      open
      size="xl"
      icon={Wrench}
      onClose={onClose}
      title={service ? 'Edit service record' : `Service record · ${vehicle.registrationNumber}`}
      description={
        vehicle.lastService && !service
          ? `Last service ${formatDate(vehicle.lastService.serviceDate)} at ${km(vehicle.lastService.odometerKm)}.`
          : undefined
      }
      footer={
        <>
          <span className="mr-auto self-center text-sm text-ink-muted">
            Total <strong className="text-ink">{formatRupees(total)}</strong>
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save record
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {errs.general && <Alert>{errs.general}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Service date" htmlFor="sv-date" error={errs.fields.serviceDate} required>
            <Input
              id="sv-date"
              type="date"
              max={todayIso()}
              value={form.serviceDate}
              onChange={set('serviceDate')}
            />
          </Field>
          <Field
            label="Odometer (km)"
            htmlFor="sv-km"
            error={errs.fields.odometerKm}
            required
            hint="Reading when serviced"
          >
            <Input
              id="sv-km"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.odometerKm}
              onChange={set('odometerKm')}
            />
          </Field>
          <Field label="Garage" htmlFor="sv-garage" error={errs.fields.garageName}>
            <Input
              id="sv-garage"
              value={form.garageName}
              onChange={set('garageName')}
              placeholder="Shree Ram Motors"
            />
          </Field>
          <Field label="Invoice no." htmlFor="sv-invoice" error={errs.fields.invoiceNumber}>
            <Input id="sv-invoice" value={form.invoiceNumber} onChange={set('invoiceNumber')} />
          </Field>
          <Field
            label="Next service at (km)"
            htmlFor="sv-next-km"
            error={errs.fields.nextServiceKm}
            hint={
              form.odometerKm && !form.nextServiceKm
                ? `Usually ${km(toNumber(form.odometerKm) + 5000)}`
                : undefined
            }
          >
            <Input
              id="sv-next-km"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.nextServiceKm}
              onChange={set('nextServiceKm')}
            />
          </Field>
          <Field label="Next service by" htmlFor="sv-next-date" error={errs.fields.nextServiceDate}>
            <Input
              id="sv-next-date"
              type="date"
              value={form.nextServiceDate}
              onChange={set('nextServiceDate')}
            />
          </Field>
          <Field label="Labour cost (₹)" htmlFor="sv-labour" error={errs.fields.labourCost}>
            <Input
              id="sv-labour"
              type="number"
              min={0}
              step="0.01"
              value={form.labourCost}
              onChange={set('labourCost')}
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">New parts fitted</h3>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setParts((all) => [
                  ...all,
                  { key: crypto.randomUUID(), partName: '', quantity: '1', cost: '' },
                ])
              }
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add part
            </Button>
          </div>
          {partErrors.length > 0 && (
            <p className="mb-2 text-sm text-red-700">
              Check the parts: {partErrors.map(([, m]) => m).join('; ')}
            </p>
          )}
          {!parts.length ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-ink-muted">
              No parts. Add oil, filters, brake pads, tyres… with what each cost.
            </p>
          ) : (
            <div className="space-y-2">
              {parts.map((p, i) => (
                <div
                  key={p.key}
                  className="grid grid-cols-[1fr_5rem_8rem_auto] items-end gap-2 rounded-lg bg-surface/60 p-2"
                >
                  <Field label={i === 0 ? 'Part' : ''} htmlFor={`pt-name-${p.key}`}>
                    <Input
                      id={`pt-name-${p.key}`}
                      aria-label={`Part ${i + 1}`}
                      value={p.partName}
                      onChange={(e) => setPart(i, { partName: e.target.value })}
                      placeholder="Engine oil (15W-40)"
                    />
                  </Field>
                  <Field label={i === 0 ? 'Qty' : ''} htmlFor={`pt-qty-${p.key}`}>
                    <Input
                      id={`pt-qty-${p.key}`}
                      aria-label={`Quantity of part ${i + 1}`}
                      type="number"
                      min={1}
                      value={p.quantity}
                      onChange={(e) => setPart(i, { quantity: e.target.value })}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Cost (₹)' : ''} htmlFor={`pt-cost-${p.key}`}>
                    <Input
                      id={`pt-cost-${p.key}`}
                      aria-label={`Cost of part ${i + 1}`}
                      type="number"
                      min={0}
                      step="0.01"
                      value={p.cost}
                      onChange={(e) => setPart(i, { cost: e.target.value })}
                    />
                  </Field>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mb-1"
                    onClick={() => setParts((all) => all.filter((_, j) => j !== i))}
                    aria-label={`Remove part ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <p className="text-right text-xs text-ink-muted">
                Parts {formatRupees(partsTotal)} + labour {formatRupees(toNumber(form.labourCost))}
              </p>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Who went with the vehicle</legend>
          {errs.fields.staffIds && (
            <p className="mb-2 text-sm text-red-700">{errs.fields.staffIds}</p>
          )}
          <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-gray-200 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((s) => (
              <Checkbox
                key={s.id}
                label={`${s.fullName} · ${s.designation}`}
                checked={staffIds.includes(s.id)}
                onChange={(e) =>
                  setStaffIds((ids) =>
                    e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>

        <Field label="Notes" htmlFor="sv-notes" error={errs.fields.notes}>
          <Textarea
            id="sv-notes"
            rows={2}
            value={form.notes}
            onChange={set('notes')}
            placeholder="What was done, problems found…"
          />
        </Field>
      </div>
    </Modal>
  );
}
