import {
  PERMISSIONS,
  VEHICLE_STATUSES,
  type RouteItem,
  type StudentListItem,
  type VehicleItem,
} from '@school/shared';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
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
import { useEmployeeOptions } from '@/features/admin/people-api';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessages } from '@/lib/api-client';
import { formatDate, todayIso } from '@/lib/format';
import { StudentFinder, Td, Th } from '../components/OpsParts';
import { tbodyClass, theadClass, useFormErrors } from '../ops-utils';
import {
  useAssignTransport,
  useEndTransport,
  useRoutes,
  useSaveRoute,
  useSaveVehicle,
  useTransportAssignments,
  useVehicles,
} from '../operations-api';

function TransportTabs() {
  const tab = (to: string, label: string) => (
    <Link
      to={to}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-brand-gold-light"
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Transport" className="mb-4 flex gap-2 print:hidden">
      {tab('/admin/transport', 'Routes')}
      {tab('/admin/transport/students', 'Students')}
      {tab('/admin/transport/vehicles', 'Vehicles')}
    </nav>
  );
}

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
        description="Bus routes, stops and who rides them. Transport fees are billed in Fees (a fee plan or a one-off charge)."
        actions={manage && <Button onClick={() => setEditing('new')}>New route</Button>}
      />
      <TransportTabs />
      {routes.isLoading ? (
        <PageSpinner />
      ) : !routes.data?.length ? (
        <Card>
          <EmptyState
            title="No routes yet"
            description="Add a route with its stops, vehicle and driver."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {routes.data.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-brand-navy">{r.name}</h2>
                  <p className="text-xs text-ink-muted">
                    {r.vehicle ? r.vehicle.registrationNumber : 'No vehicle'}
                    {r.driver && ` · Driver ${r.driver.fullName}`}
                    {r.attendant && ` · Attendant ${r.attendant.fullName}`}
                  </p>
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
                      Edit
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
  const staff = useEmployeeOptions();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    name: route?.name ?? '',
    description: route?.description ?? '',
    vehicleId: route?.vehicle?.id ?? '',
    driverEmployeeId: route?.driver?.id ?? '',
    attendantEmployeeId: route?.attendant?.id ?? '',
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
      onClose={onClose}
      title={route ? `Edit ${route.name}` : 'New route'}
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
        <Field label="Route name" htmlFor="rt-name" error={errs.fields.name} required>
          <Input
            id="rt-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Route 1 – Vaishali Nagar"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Vehicle" htmlFor="rt-vehicle" error={errs.fields.vehicleId}>
            <Select
              id="rt-vehicle"
              value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
            >
              <option value="">None</option>
              {vehicles.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber}
                  {v.capacity ? ` (${v.capacity} seats)` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver" htmlFor="rt-driver" error={errs.fields.driverEmployeeId}>
            <Select
              id="rt-driver"
              value={form.driverEmployeeId}
              onChange={(e) => setForm({ ...form, driverEmployeeId: e.target.value })}
            >
              <option value="">None</option>
              {staff.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.designation})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Attendant" htmlFor="rt-attendant" error={errs.fields.attendantEmployeeId}>
            <Select
              id="rt-attendant"
              value={form.attendantEmployeeId}
              onChange={(e) => setForm({ ...form, attendantEmployeeId: e.target.value })}
            >
              <option value="">None</option>
              {staff.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.designation})
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
          <div className="space-y-2">
            {stops.map((s, i) => (
              <div key={s.key} className="grid grid-cols-[1fr_110px_110px_auto] items-end gap-2">
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
  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          to="/admin/transport"
          className="inline-flex items-center gap-1 text-sm text-brand-navy hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Transport
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </Button>
      </div>
      <Card className="p-6 print:border-0 print:shadow-none">
        <h1 className="text-xl font-bold text-brand-navy">{route.name}</h1>
        <p className="text-sm text-ink-muted">
          {route.vehicle?.registrationNumber ?? 'No vehicle'}
          {route.driver &&
            ` · Driver: ${route.driver.fullName}${route.driver.phone ? ` (${route.driver.phone})` : ''}`}
          {route.attendant && ` · Attendant: ${route.attendant.fullName}`}
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
  const { can } = useAuth();
  const manage = can(PERMISSIONS.TRANSPORT_MANAGE);
  const routes = useRoutes();
  const [routeId, setRouteId] = useState('');
  const list = useTransportAssignments({ routeId: routeId || undefined });
  const end = useEndTransport();
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEnd = async (id: string, name: string) => {
    const endDate = window.prompt(`Last day of transport for ${name} (YYYY-MM-DD)`, todayIso());
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
        actions={manage && <Button onClick={() => setAssigning(true)}>Assign student</Button>}
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

export function VehiclesPage() {
  const { can } = useAuth();
  const manage = can(PERMISSIONS.TRANSPORT_MANAGE);
  const vehicles = useVehicles();
  const [editing, setEditing] = useState<VehicleItem | 'new' | null>(null);
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Transport"
        description="School buses and vans, with insurance and permit renewal dates."
        actions={manage && <Button onClick={() => setEditing('new')}>New vehicle</Button>}
      />
      <TransportTabs />
      <Card>
        {vehicles.isLoading ? (
          <PageSpinner />
        ) : !vehicles.data?.length ? (
          <EmptyState title="No vehicles yet" />
        ) : (
          <table className="min-w-full text-sm">
            <thead className={theadClass}>
              <tr>
                <Th>Registration</Th>
                <Th>Type</Th>
                <Th right>Seats</Th>
                <Th>Insurance until</Th>
                <Th>Permit until</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {vehicles.data.map((v) => (
                <tr key={v.id}>
                  <Td className="font-mono">{v.registrationNumber}</Td>
                  <Td>{v.vehicleType ?? '—'}</Td>
                  <Td right>{v.capacity ?? '—'}</Td>
                  <Td>{formatDate(v.insuranceExpiry)}</Td>
                  <Td>{formatDate(v.permitExpiry)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={v.status === 'ACTIVE' ? 'green' : 'gray'}>
                        {v.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Badge>
                      {v.documentsDue && <Badge tone="amber">Renewal due</Badge>}
                    </div>
                  </Td>
                  <Td right>
                    {manage && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                        Edit
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

function VehicleModal({ vehicle, onClose }: { vehicle: VehicleItem | null; onClose: () => void }) {
  const save = useSaveVehicle();
  const errs = useFormErrors();
  const [form, setForm] = useState({
    registrationNumber: vehicle?.registrationNumber ?? '',
    vehicleType: vehicle?.vehicleType ?? '',
    capacity: vehicle?.capacity?.toString() ?? '',
    insuranceExpiry: vehicle?.insuranceExpiry ?? '',
    permitExpiry: vehicle?.permitExpiry ?? '',
    status: vehicle?.status ?? 'ACTIVE',
    notes: vehicle?.notes ?? '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });
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
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.registrationNumber}` : 'New vehicle'}
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
      <div className="space-y-4">
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
          <Input id="vh-notes" value={form.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Modal>
  );
}
