import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
  PERMISSIONS,
  assignTransportSchema,
  endTransportSchema,
  saveRouteSchema,
  saveVehicleSchema,
  uuidSchema,
  type RouteItem,
  type SaveRouteData,
  type SaveVehicleData,
  type TransportAssignmentItem,
  type VehicleItem,
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
import { AuditService } from '../audit/audit.service.js';

const toTime = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const fromTime = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
const addDays = (day: string, n: number) =>
  isoDay(new Date(dayToDate(day).getTime() + n * 86_400_000));

const employeeSelect = { id: true, firstName: true, lastName: true, phone: true } as const;
const routeInclude = {
  vehicle: { select: { id: true, registrationNumber: true, capacity: true } },
  driver: { select: employeeSelect },
  attendant: { select: employeeSelect },
  stops: { orderBy: { sequenceNo: 'asc' } },
} satisfies Prisma.TransportRouteInclude;
type RouteRow = Prisma.TransportRouteGetPayload<{ include: typeof routeInclude }>;

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
    const soon = addDays(schoolDate(), 30);
    const rows = await this.prisma.vehicle.findMany({ orderBy: { registrationNumber: 'asc' } });
    return rows.map((v) => {
      const insurance = isoDayOrNull(v.insuranceExpiry);
      const permit = isoDayOrNull(v.permitExpiry);
      return {
        id: v.id,
        registrationNumber: v.registrationNumber,
        vehicleType: v.vehicleType,
        capacity: v.capacity,
        insuranceExpiry: insurance,
        permitExpiry: permit,
        status: v.status as VehicleStatus,
        notes: v.notes,
        documentsDue:
          v.status === 'ACTIVE' && [insurance, permit].some((d) => d !== null && d <= soon),
      };
    });
  }

  async saveVehicle(
    id: string | null,
    input: SaveVehicleData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const data = {
      registrationNumber: input.registrationNumber,
      vehicleType: input.vehicleType ?? null,
      capacity: input.capacity ?? null,
      insuranceExpiry: input.insuranceExpiry ? dayToDate(input.insuranceExpiry) : null,
      permitExpiry: input.permitExpiry ? dayToDate(input.permitExpiry) : null,
      status: input.status,
      notes: input.notes ?? null,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.vehicle.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('Vehicle not found');
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
    const person = (e: RouteRow['driver']) =>
      e ? { id: e.id, fullName: fullName(e.firstName, e.lastName), phone: e.phone } : null;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: r.isActive,
      vehicle: r.vehicle,
      driver: person(r.driver),
      attendant: person(r.attendant),
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
    for (const key of ['driverEmployeeId', 'attendantEmployeeId'] as const) {
      const empId = input[key];
      if (!empId) continue;
      const emp = await this.prisma.employee.findUnique({
        where: { id: empId },
        select: { status: true },
      });
      if (emp?.status !== 'ACTIVE') errors.push(`${key}: Choose an active staff member`);
    }
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
        driverEmployeeId: input.driverEmployeeId ?? null,
        attendantEmployeeId: input.attendantEmployeeId ?? null,
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
