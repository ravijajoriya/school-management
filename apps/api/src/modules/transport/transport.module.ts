import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  CONDUCTOR_DESIGNATION,
  DRIVER_DESIGNATION,
  PERMISSIONS,
  assignTransportSchema,
  endTransportSchema,
  saveRouteSchema,
  saveVehicleSchema,
  saveVehicleServiceSchema,
  uuidSchema,
  type CrewOption,
  type CrewOptions,
  type LicenceStatus,
  type RouteItem,
  type SaveRouteData,
  type SaveVehicleData,
  type SaveVehicleServiceData,
  type TransportAssignmentItem,
  type VehicleDetail,
  type VehicleItem,
  type VehicleServiceItem,
  type VehicleStatus,
} from '@school/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext, type RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import {
  dayToDate,
  fullName,
  isoDay,
  isoDayOrNull,
  schoolDate,
} from '../../common/utils/content.js';
import { paiseToDb, rupees, toPaise } from '../../common/utils/money.js';
import { AuditService } from '../audit/audit.service.js';

const toTime = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const fromTime = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
const addDays = (day: string, n: number) =>
  isoDay(new Date(dayToDate(day).getTime() + n * 86_400_000));

const employeeSelect = { id: true, firstName: true, lastName: true, phone: true } as const;
const driverSelect = { ...employeeSelect, licenceNumber: true, licenceExpiry: true } as const;
type EmployeeRow = { id: string; firstName: string; lastName: string | null; phone: string | null };
const person = (e: EmployeeRow | null) =>
  e ? { id: e.id, fullName: fullName(e.firstName, e.lastName), phone: e.phone } : null;

const routeInclude = {
  vehicle: {
    select: {
      id: true,
      registrationNumber: true,
      capacity: true,
      driver: { select: employeeSelect },
      conductor: { select: employeeSelect },
    },
  },
  stops: { orderBy: { sequenceNo: 'asc' } },
} satisfies Prisma.TransportRouteInclude;

const vehicleInclude = {
  driver: { select: driverSelect },
  conductor: { select: employeeSelect },
  routes: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
  services: {
    select: { serviceDate: true, odometerKm: true, nextServiceKm: true, nextServiceDate: true },
    orderBy: [{ serviceDate: 'desc' }, { odometerKm: 'desc' }],
    take: 1,
  },
} satisfies Prisma.VehicleInclude;
type VehicleRow = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

const serviceInclude = {
  parts: { orderBy: { id: 'asc' } },
  staff: {
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, designation: true } },
    },
  },
  creator: { select: { fullName: true } },
} satisfies Prisma.VehicleServiceInclude;
type ServiceRow = Prisma.VehicleServiceGetPayload<{ include: typeof serviceInclude }>;

/** Licence state on `today`: expiring = within 30 days. */
export function licenceStatus(
  licenceNumber: string | null,
  expiry: string | null,
  today: string,
): LicenceStatus {
  if (!licenceNumber || !expiry) return 'MISSING';
  if (expiry < today) return 'EXPIRED';
  return expiry <= addDays(today, 30) ? 'EXPIRING' : 'OK';
}

function toVehicleItem(v: VehicleRow, today: string): VehicleItem {
  const soon = addDays(today, 30);
  const insurance = isoDayOrNull(v.insuranceExpiry);
  const permit = isoDayOrNull(v.permitExpiry);
  const last = v.services[0];
  const nextServiceDate = last ? isoDayOrNull(last.nextServiceDate) : null;
  const active = v.status === 'ACTIVE';
  return {
    id: v.id,
    registrationNumber: v.registrationNumber,
    vehicleType: v.vehicleType,
    capacity: v.capacity,
    insuranceExpiry: insurance,
    permitExpiry: permit,
    status: v.status as VehicleStatus,
    notes: v.notes,
    driver: v.driver
      ? {
          ...person(v.driver)!,
          licenceNumber: v.driver.licenceNumber,
          licenceExpiry: isoDayOrNull(v.driver.licenceExpiry),
          licenceStatus: licenceStatus(
            v.driver.licenceNumber,
            isoDayOrNull(v.driver.licenceExpiry),
            today,
          ),
        }
      : null,
    conductor: person(v.conductor),
    routes: v.routes,
    documentsDue: active && [insurance, permit].some((d) => d !== null && d <= soon),
    crewMissing: active && (!v.driver || !v.conductor),
    lastService: last
      ? { serviceDate: isoDay(last.serviceDate), odometerKm: last.odometerKm }
      : null,
    nextServiceKm: last?.nextServiceKm ?? null,
    nextServiceDate,
    serviceDue: active && nextServiceDate !== null && nextServiceDate <= addDays(today, 7),
  };
}

function toServiceItem(r: ServiceRow, previousKm: number | null): VehicleServiceItem {
  const labour = toPaise(r.labourCost);
  const parts = r.parts.reduce((n, p) => n + toPaise(p.cost), 0);
  return {
    id: r.id,
    vehicleId: r.vehicleId,
    serviceDate: isoDay(r.serviceDate),
    garageName: r.garageName,
    odometerKm: r.odometerKm,
    kmSincePrevious: previousKm === null ? null : r.odometerKm - previousKm,
    nextServiceKm: r.nextServiceKm,
    nextServiceDate: isoDayOrNull(r.nextServiceDate),
    labourCost: rupees(labour),
    partsCost: rupees(parts),
    totalCost: rupees(labour + parts),
    invoiceNumber: r.invoiceNumber,
    notes: r.notes,
    parts: r.parts.map((p) => ({
      id: p.id,
      partName: p.partName,
      quantity: p.quantity,
      cost: rupees(toPaise(p.cost)),
    })),
    staff: r.staff
      .map((x) => ({
        id: x.employee.id,
        fullName: fullName(x.employee.firstName, x.employee.lastName),
        designation: x.employee.designation,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    recordedBy: r.creator.fullName,
  };
}

const assignmentInclude = {
  route: { select: { id: true, name: true } },
  stop: true,
  enrolment: {
    include: {
      class: { select: { name: true, levelOrder: true } },
      section: { select: { name: true } },
      student: {
        include: { guardians: { where: { isPrimary: true }, select: { phone: true } } },
      },
    },
  },
} satisfies Prisma.StudentTransportInclude;
type AssignmentRow = Prisma.StudentTransportGetPayload<{ include: typeof assignmentInclude }>;

/** Active on `day`: started on or before it and not ended before it. */
const activeOn = (day: string): Prisma.StudentTransportWhereInput => ({
  startDate: { lte: dayToDate(day) },
  OR: [{ endDate: null }, { endDate: { gte: dayToDate(day) } }],
});

function toAssignment(a: AssignmentRow, today: string): TransportAssignmentItem {
  const s = a.enrolment.student;
  return {
    id: a.id,
    route: a.route,
    stop: a.stop
      ? {
          id: a.stop.id,
          name: a.stop.name,
          pickupTime: fromTime(a.stop.pickupTime),
          dropTime: fromTime(a.stop.dropTime),
        }
      : null,
    startDate: isoDay(a.startDate),
    endDate: isoDayOrNull(a.endDate),
    status: a.endDate && isoDay(a.endDate) < today ? 'ENDED' : 'ACTIVE',
    student: {
      id: s.id,
      fullName: fullName(s.firstName, s.middleName, s.lastName),
      admissionNumber: s.admissionNumber,
      className: a.enrolment.class.name,
      sectionName: a.enrolment.section.name,
      guardianPhone: s.guardians[0]?.phone ?? null,
    },
  };
}

@Injectable()
export class TransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Vehicles ------------------------------------------------------------------------------

  async vehicles(): Promise<VehicleItem[]> {
    const today = schoolDate();
    const rows = await this.prisma.vehicle.findMany({
      include: vehicleInclude,
      orderBy: [{ status: 'asc' }, { registrationNumber: 'asc' }],
    });
    return rows.map((v) => toVehicleItem(v, today));
  }

  async vehicle(id: string): Promise<VehicleDetail> {
    const today = schoolDate();
    const v = await this.prisma.vehicle.findUnique({ where: { id }, include: vehicleInclude });
    if (!v) throw new NotFoundException('Vehicle not found');
    const rows = await this.prisma.vehicleService.findMany({
      where: { vehicleId: id },
      include: serviceInclude,
      orderBy: [{ serviceDate: 'asc' }, { odometerKm: 'asc' }],
    });
    const services = rows.map((r, i) => toServiceItem(r, i ? rows[i - 1].odometerKm : null));
    const yearStart = `${today.slice(0, 4)}-01-01`;
    return {
      ...toVehicleItem(v, today),
      services: services.reverse(),
      serviceTotals: {
        count: services.length,
        totalCost: rupees(services.reduce((n, x) => n + toPaise(x.totalCost), 0)),
        thisYearCost: rupees(
          services
            .filter((x) => x.serviceDate >= yearStart)
            .reduce((n, x) => n + toPaise(x.totalCost), 0),
        ),
      },
    };
  }

  /** Active Driver / Conductor staff, with the vehicle each already crews. */
  async crewOptions(): Promise<CrewOptions> {
    const [staff, vehicles] = await Promise.all([
      this.prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        select: { ...driverSelect, designation: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.vehicle.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          registrationNumber: true,
          driverEmployeeId: true,
          conductorEmployeeId: true,
        },
      }),
    ]);
    const onVehicle = (empId: string) => {
      const v = vehicles.find(
        (x) => x.driverEmployeeId === empId || x.conductorEmployeeId === empId,
      );
      return v ? { id: v.id, registrationNumber: v.registrationNumber } : null;
    };
    const toOption = (e: (typeof staff)[number]): CrewOption => ({
      id: e.id,
      fullName: fullName(e.firstName, e.lastName),
      designation: e.designation,
      phone: e.phone,
      licenceNumber: e.licenceNumber,
      licenceExpiry: isoDayOrNull(e.licenceExpiry),
      onVehicle: onVehicle(e.id),
    });
    return {
      drivers: staff.filter((e) => DRIVER_DESIGNATION.test(e.designation)).map(toOption),
      conductors: staff.filter((e) => CONDUCTOR_DESIGNATION.test(e.designation)).map(toOption),
      staff: staff.map((e) => ({
        id: e.id,
        fullName: fullName(e.firstName, e.lastName),
        designation: e.designation,
      })),
    };
  }

  /** Crew rules the form can't check: right designation, active, licence valid, one vehicle each. */
  private async checkCrew(vehicleId: string | null, input: SaveVehicleData) {
    if (input.status !== 'ACTIVE' && !input.driverEmployeeId && !input.conductorEmployeeId) return;
    const today = schoolDate();
    const errors: string[] = [];
    const roles = [
      ['driverEmployeeId', input.driverEmployeeId, DRIVER_DESIGNATION, 'Driver'],
      ['conductorEmployeeId', input.conductorEmployeeId, CONDUCTOR_DESIGNATION, 'Conductor'],
    ] as const;
    for (const [field, empId, designation, label] of roles) {
      if (!empId) continue;
      const e = await this.prisma.employee.findUnique({
        where: { id: empId },
        select: { ...driverSelect, designation: true, status: true },
      });
      if (!e || e.status !== 'ACTIVE') {
        errors.push(`${field}: Choose an active staff member`);
        continue;
      }
      const name = fullName(e.firstName, e.lastName);
      if (!designation.test(e.designation)) {
        errors.push(
          `${field}: ${name} is a ${e.designation}. Only staff with the designation ${label} can be chosen.`,
        );
        continue;
      }
      if (field === 'driverEmployeeId') {
        const expiry = isoDayOrNull(e.licenceExpiry);
        const status = licenceStatus(e.licenceNumber, expiry, today);
        if (status === 'MISSING')
          errors.push(
            `${field}: Add ${name}'s driving licence number and expiry in their staff record first`,
          );
        else if (status === 'EXPIRED')
          errors.push(`${field}: ${name}'s driving licence expired on ${expiry}`);
      }
      if (input.status === 'ACTIVE') {
        const other = await this.prisma.vehicle.findFirst({
          where: {
            status: 'ACTIVE',
            id: vehicleId ? { not: vehicleId } : undefined,
            OR: [{ driverEmployeeId: empId }, { conductorEmployeeId: empId }],
          },
          select: { registrationNumber: true, driverEmployeeId: true },
        });
        if (other)
          errors.push(
            `${field}: ${name} is already the ${other.driverEmployeeId === empId ? 'driver' : 'conductor'} of ${other.registrationNumber}`,
          );
      }
    }
    if (errors.length) throw new BadRequestException(errors);
  }

  async saveVehicle(
    id: string | null,
    input: SaveVehicleData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    if (id && !(await this.prisma.vehicle.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException('Vehicle not found');
    await this.checkCrew(id, input);
    const data = {
      registrationNumber: input.registrationNumber,
      vehicleType: input.vehicleType ?? null,
      capacity: input.capacity ?? null,
      insuranceExpiry: input.insuranceExpiry ? dayToDate(input.insuranceExpiry) : null,
      permitExpiry: input.permitExpiry ? dayToDate(input.permitExpiry) : null,
      status: input.status,
      driverEmployeeId: input.driverEmployeeId ?? null,
      conductorEmployeeId: input.conductorEmployeeId ?? null,
      notes: input.notes ?? null,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.vehicle.findUnique({ where: { id } }) : null;
      const saved = id
        ? await tx.vehicle.update({ where: { id }, data })
        : await tx.vehicle.create({ data });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.VEHICLE_SAVED,
          entityType: 'vehicle',
          entityId: saved.id,
          userId: actor.id,
          before,
          after: saved,
          context,
        },
        tx,
      );
      return saved;
    });
    return (await this.vehicles()).find((v) => v.id === row.id)!;
  }

  // --- Service history -----------------------------------------------------------------------

  private async checkService(
    vehicleId: string,
    serviceId: string | null,
    input: SaveVehicleServiceData,
  ) {
    const errors: string[] = [];
    if (input.serviceDate > schoolDate())
      errors.push('serviceDate: The service date cannot be in the future');
    // Odometer readings must not go backwards in time.
    const others = await this.prisma.vehicleService.findMany({
      where: { vehicleId, id: serviceId ? { not: serviceId } : undefined },
      select: { serviceDate: true, odometerKm: true },
    });
    const earlier = others.filter((o) => isoDay(o.serviceDate) <= input.serviceDate);
    const later = others.filter((o) => isoDay(o.serviceDate) > input.serviceDate);
    const maxBefore = Math.max(-1, ...earlier.map((o) => o.odometerKm));
    const minAfter = Math.min(Number.MAX_SAFE_INTEGER, ...later.map((o) => o.odometerKm));
    if (input.odometerKm < maxBefore)
      errors.push(
        `odometerKm: An earlier service was recorded at ${maxBefore.toLocaleString('en-IN')} km, so this reading can't be lower`,
      );
    else if (input.odometerKm > minAfter)
      errors.push(
        `odometerKm: A later service was recorded at ${minAfter.toLocaleString('en-IN')} km, so this reading can't be higher`,
      );
    const staffIds = [...new Set(input.staffIds)];
    if (staffIds.length) {
      const found = await this.prisma.employee.count({ where: { id: { in: staffIds } } });
      if (found !== staffIds.length) errors.push('staffIds: A chosen staff member was not found');
    }
    if (errors.length) throw new BadRequestException(errors);
    return staffIds;
  }

  async saveService(
    vehicleId: string,
    serviceId: string | null,
    input: SaveVehicleServiceData,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<VehicleServiceItem> {
    const before = serviceId
      ? await this.prisma.vehicleService.findUnique({
          where: { id: serviceId },
          include: serviceInclude,
        })
      : null;
    if (serviceId && !before) throw new NotFoundException('Service record not found');
    const vid = before?.vehicleId ?? vehicleId;
    if (!(await this.prisma.vehicle.findUnique({ where: { id: vid }, select: { id: true } })))
      throw new NotFoundException('Vehicle not found');
    const staffIds = await this.checkService(vid, serviceId, input);
    const data = {
      serviceDate: dayToDate(input.serviceDate),
      garageName: input.garageName ?? null,
      odometerKm: input.odometerKm,
      nextServiceKm: input.nextServiceKm ?? null,
      nextServiceDate: input.nextServiceDate ? dayToDate(input.nextServiceDate) : null,
      labourCost: paiseToDb(toPaise(input.labourCost)),
      invoiceNumber: input.invoiceNumber ?? null,
      notes: input.notes ?? null,
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      const row = before
        ? await tx.vehicleService.update({ where: { id: before.id }, data })
        : await tx.vehicleService.create({
            data: { ...data, vehicleId: vid, createdBy: actor.id },
          });
      if (before) {
        await tx.vehicleServicePart.deleteMany({ where: { serviceId: row.id } });
        await tx.vehicleServiceStaff.deleteMany({ where: { serviceId: row.id } });
      }
      if (input.parts.length)
        await tx.vehicleServicePart.createMany({
          data: input.parts.map((p) => ({
            serviceId: row.id,
            partName: p.partName,
            quantity: p.quantity,
            cost: paiseToDb(toPaise(p.cost)),
          })),
        });
      if (staffIds.length)
        await tx.vehicleServiceStaff.createMany({
          data: staffIds.map((employeeId) => ({ serviceId: row.id, employeeId })),
        });
      const after = await tx.vehicleService.findUniqueOrThrow({
        where: { id: row.id },
        include: serviceInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.VEHICLE_SERVICE_SAVED,
          entityType: 'vehicle_service',
          entityId: row.id,
          userId: actor.id,
          before: before ? toServiceItem(before, null) : null,
          after: toServiceItem(after, null),
          context,
        },
        tx,
      );
      return after;
    });
    return (await this.vehicle(vid)).services.find((x) => x.id === saved.id)!;
  }

  async deleteService(serviceId: string, actor: RequestUser, context: RequestContext) {
    const before = await this.prisma.vehicleService.findUnique({
      where: { id: serviceId },
      include: serviceInclude,
    });
    if (!before) throw new NotFoundException('Service record not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleService.delete({ where: { id: serviceId } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.VEHICLE_SERVICE_DELETED,
          entityType: 'vehicle_service',
          entityId: serviceId,
          userId: actor.id,
          before: toServiceItem(before, null),
          context,
        },
        tx,
      );
    });
  }

  // --- Routes --------------------------------------------------------------------------------

  private async routeItems(where: Prisma.TransportRouteWhereInput): Promise<RouteItem[]> {
    const today = schoolDate();
    const rows = await this.prisma.transportRoute.findMany({
      where,
      include: routeInclude,
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.studentTransport.groupBy({
      by: ['routeId', 'routeStopId'],
      where: { routeId: { in: rows.map((r) => r.id) }, ...activeOn(today) },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: r.isActive,
      vehicle: r.vehicle
        ? {
            id: r.vehicle.id,
            registrationNumber: r.vehicle.registrationNumber,
            capacity: r.vehicle.capacity,
            driver: person(r.vehicle.driver),
            conductor: person(r.vehicle.conductor),
          }
        : null,
      stops: r.stops.map((s) => ({
        id: s.id,
        name: s.name,
        pickupTime: fromTime(s.pickupTime),
        dropTime: fromTime(s.dropTime),
        sequenceNo: s.sequenceNo,
        students:
          counts.find((c) => c.routeId === r.id && c.routeStopId === s.id)?._count._all ?? 0,
      })),
      students: counts.filter((c) => c.routeId === r.id).reduce((n, c) => n + c._count._all, 0),
    }));
  }

  routes() {
    return this.routeItems({});
  }

  async route(id: string) {
    const [item] = await this.routeItems({ id });
    if (!item) throw new NotFoundException('Route not found');
    return item;
  }

  private async checkRouteRefs(input: SaveRouteData) {
    const errors: string[] = [];
    if (
      input.vehicleId &&
      !(await this.prisma.vehicle.findUnique({ where: { id: input.vehicleId } }))
    )
      errors.push('vehicleId: Vehicle not found');
    const names = input.stops.map((s) => s.name.toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) errors.push(`stops: The stop "${dup}" is listed twice`);
    if (errors.length) throw new BadRequestException(errors);
  }

  async saveRoute(
    id: string | null,
    input: SaveRouteData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.checkRouteRefs(input);
    const routeId = await this.prisma.$transaction(async (tx) => {
      const before = id
        ? await tx.transportRoute.findUnique({ where: { id }, include: { stops: true } })
        : null;
      if (id && !before) throw new NotFoundException('Route not found');
      const data = {
        name: input.name,
        description: input.description ?? null,
        vehicleId: input.vehicleId ?? null,
        isActive: input.isActive,
      };
      const route = before
        ? await tx.transportRoute.update({ where: { id: before.id }, data })
        : await tx.transportRoute.create({ data });

      // Sync stops: keep (and renumber) listed ones, add new ones, remove the rest if unused.
      const keepIds = new Set(input.stops.flatMap((s) => (s.id ? [s.id] : [])));
      const existing = before?.stops ?? [];
      const unknown = [...keepIds].filter((sid) => !existing.some((s) => s.id === sid));
      if (unknown.length)
        throw new BadRequestException(['stops: A stop does not belong to this route']);
      const removed = existing.filter((s) => !keepIds.has(s.id));
      if (removed.length) {
        const used = await tx.studentTransport.findMany({
          where: { routeStopId: { in: removed.map((s) => s.id) } },
          select: { stop: { select: { name: true } } },
          distinct: ['routeStopId'],
        });
        if (used.length)
          throw new ConflictException(
            `Stop ${used.map((u) => `"${u.stop?.name}"`).join(', ')} has students assigned (now or in the past) and can't be removed. Rename it instead.`,
          );
        await tx.routeStop.deleteMany({ where: { id: { in: removed.map((s) => s.id) } } });
      }
      // Rename in two steps so swapping two stop names never trips the unique index.
      for (const s of input.stops.filter((x) => x.id))
        await tx.routeStop.update({ where: { id: s.id }, data: { name: `~${s.id}` } });
      for (const [i, s] of input.stops.entries()) {
        const stopData = {
          name: s.name,
          pickupTime: s.pickupTime ? toTime(s.pickupTime) : null,
          dropTime: s.dropTime ? toTime(s.dropTime) : null,
          sequenceNo: i + 1,
        };
        if (s.id) await tx.routeStop.update({ where: { id: s.id }, data: stopData });
        else await tx.routeStop.create({ data: { ...stopData, routeId: route.id } });
      }
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ROUTE_SAVED,
          entityType: 'transport_route',
          entityId: route.id,
          userId: actor.id,
          before,
          after: { ...route, stops: input.stops },
          context,
        },
        tx,
      );
      return route.id;
    });
    return this.route(routeId);
  }

  // --- Assignments ---------------------------------------------------------------------------

  async assignments(q: {
    routeId?: string;
    sectionId?: string;
    studentId?: string;
    includeEnded?: boolean;
  }) {
    const today = schoolDate();
    const rows = await this.prisma.studentTransport.findMany({
      where: {
        routeId: q.routeId,
        enrolment: { sectionId: q.sectionId, studentId: q.studentId },
        ...(q.includeEnded ? {} : activeOn(today)),
      },
      include: assignmentInclude,
      orderBy: [{ startDate: 'desc' }],
    });
    const items = rows.map((r) => toAssignment(r, today));
    if (q.studentId) return items;
    // Route sheet order: stop sequence, then class, then name.
    const seq = new Map(rows.map((r) => [r.id, r.stop?.sequenceNo ?? 999]));
    const level = new Map(rows.map((r) => [r.id, r.enrolment.class.levelOrder]));
    return items.sort(
      (a, b) =>
        seq.get(a.id)! - seq.get(b.id)! ||
        level.get(a.id)! - level.get(b.id)! ||
        a.student.sectionName.localeCompare(b.student.sectionName) ||
        a.student.fullName.localeCompare(b.student.fullName),
    );
  }

  async assign(
    input: z.output<typeof assignTransportSchema>,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const enrolment = await this.prisma.studentEnrolment.findUnique({
      where: { id: input.enrolmentId },
      select: { id: true, status: true, studentId: true },
    });
    if (!enrolment) throw new BadRequestException(['enrolmentId: Student enrolment not found']);
    if (enrolment.status !== 'ACTIVE')
      throw new BadRequestException('Only a currently enrolled student can be given transport');
    const route = await this.prisma.transportRoute.findUnique({
      where: { id: input.routeId },
      include: {
        stops: { select: { id: true } },
        vehicle: { select: { capacity: true, registrationNumber: true } },
      },
    });
    if (!route?.isActive) throw new BadRequestException(['routeId: Choose an active route']);
    if (input.routeStopId && !route.stops.some((s) => s.id === input.routeStopId))
      throw new BadRequestException(['routeStopId: This stop is not on the chosen route']);

    const created = await this.prisma.$transaction(async (tx) => {
      // Changing route: the current open-ended assignment ends the day before the new one starts.
      const open = await tx.studentTransport.findFirst({
        where: {
          studentEnrolmentId: enrolment.id,
          endDate: null,
          startDate: { lt: dayToDate(input.startDate) },
        },
      });
      if (open) {
        await tx.studentTransport.update({
          where: { id: open.id },
          data: { endDate: dayToDate(addDays(input.startDate, -1)) },
        });
      }
      if (route.vehicle?.capacity) {
        const riding = await tx.studentTransport.count({
          where: { routeId: route.id, ...activeOn(input.startDate) },
        });
        if (riding >= route.vehicle.capacity)
          throw new ConflictException(
            `${route.name} is full: vehicle ${route.vehicle.registrationNumber} seats ${route.vehicle.capacity.toString()}`,
          );
      }
      const row = await tx.studentTransport.create({
        data: {
          studentEnrolmentId: enrolment.id,
          routeId: route.id,
          routeStopId: input.routeStopId ?? null,
          startDate: dayToDate(input.startDate),
          createdBy: actor.id,
        },
        include: assignmentInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TRANSPORT_ASSIGNED,
          entityType: 'student_transport',
          entityId: row.id,
          userId: actor.id,
          before: open ? { endedAssignmentId: open.id } : null,
          after: {
            studentId: enrolment.studentId,
            routeId: route.id,
            routeStopId: input.routeStopId ?? null,
            startDate: input.startDate,
          },
          context,
        },
        tx,
      );
      return row;
    });
    return toAssignment(created, schoolDate());
  }

  async end(id: string, endDate: string, actor: RequestUser, context: RequestContext) {
    const row = await this.prisma.studentTransport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Transport assignment not found');
    if (endDate < isoDay(row.startDate))
      throw new BadRequestException(['endDate: The end date cannot be before the start date']);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.studentTransport.update({
        where: { id },
        data: { endDate: dayToDate(endDate) },
        include: assignmentInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TRANSPORT_ENDED,
          entityType: 'student_transport',
          entityId: id,
          userId: actor.id,
          before: { endDate: isoDayOrNull(row.endDate) },
          after: { endDate },
          context,
        },
        tx,
      );
      return saved;
    });
    return toAssignment(updated, schoolDate());
  }
}

const id = () => Param('id', { schema: uuidSchema });
const assignmentsQuerySchema = z.object({
  routeId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  studentId: uuidSchema.optional(),
  includeEnded: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

@ApiTags('Transport')
@ApiBearerAuth()
@Controller('transport')
export class TransportController {
  constructor(private readonly transport: TransportService) {}

  @Get('vehicles')
  @RequirePermissions(PERMISSIONS.TRANSPORT_READ)
  vehicles() {
    return this.transport.vehicles();
  }

  /** Driver / Conductor staff for the vehicle form. */
  @Get('crew-options')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  crewOptions() {
    return this.transport.crewOptions();
  }

  /** One vehicle with its crew and full service history. */
  @Get('vehicles/:id')
  @RequirePermissions(PERMISSIONS.TRANSPORT_READ)
  vehicle(@id() vehicleId: string) {
    return this.transport.vehicle(vehicleId);
  }

  @Post('vehicles/:id/services')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  createService(
    @id() vehicleId: string,
    @Body({ schema: saveVehicleServiceSchema }) body: SaveVehicleServiceData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.saveService(vehicleId, null, body, user, getRequestContext(req));
  }

  @Patch('services/:id')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  updateService(
    @id() serviceId: string,
    @Body({ schema: saveVehicleServiceSchema }) body: SaveVehicleServiceData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.saveService('', serviceId, body, user, getRequestContext(req));
  }

  @Delete('services/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  async deleteService(
    @id() serviceId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.transport.deleteService(serviceId, user, getRequestContext(req));
  }

  @Post('vehicles')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  createVehicle(
    @Body({ schema: saveVehicleSchema }) body: SaveVehicleData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.saveVehicle(null, body, user, getRequestContext(req));
  }

  @Patch('vehicles/:id')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  updateVehicle(
    @id() vehicleId: string,
    @Body({ schema: saveVehicleSchema }) body: SaveVehicleData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.saveVehicle(vehicleId, body, user, getRequestContext(req));
  }

  @Get('routes')
  @RequirePermissions(PERMISSIONS.TRANSPORT_READ)
  routes() {
    return this.transport.routes();
  }

  @Get('routes/:id')
  @RequirePermissions(PERMISSIONS.TRANSPORT_READ)
  route(@id() routeId: string) {
    return this.transport.route(routeId);
  }

  @Post('routes')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  createRoute(
    @Body({ schema: saveRouteSchema }) body: SaveRouteData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.saveRoute(null, body, user, getRequestContext(req));
  }

  @Patch('routes/:id')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  updateRoute(
    @id() routeId: string,
    @Body({ schema: saveRouteSchema }) body: SaveRouteData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.saveRoute(routeId, body, user, getRequestContext(req));
  }

  @Get('assignments')
  @RequirePermissions(PERMISSIONS.TRANSPORT_READ)
  assignments(
    @Query({ schema: assignmentsQuerySchema }) q: z.output<typeof assignmentsQuerySchema>,
  ) {
    return this.transport.assignments(q);
  }

  @Post('assignments')
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  assign(
    @Body({ schema: assignTransportSchema }) body: z.output<typeof assignTransportSchema>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.assign(body, user, getRequestContext(req));
  }

  @Post('assignments/:id/end')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TRANSPORT_MANAGE)
  end(
    @id() assignmentId: string,
    @Body({ schema: endTransportSchema }) body: { endDate: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.transport.end(assignmentId, body.endDate, user, getRequestContext(req));
  }
}

@Module({
  controllers: [TransportController],
  providers: [TransportService],
  exports: [TransportService],
})
export class TransportModule {}
