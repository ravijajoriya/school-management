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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  DAY_LABELS,
  PERMISSIONS,
  createTimetableSchema,
  listTimetablesQuerySchema,
  saveTimetableEntriesSchema,
  updateTimetableSchema,
  uuidSchema,
  type CreateTimetableData,
  type SaveTimetableEntriesData,
  type TeacherTimetable,
  type TimetableClash,
  type TimetableItem,
  type TimetableListItem,
  type TimetableStatus,
  type UpdateTimetableInput,
} from '@school/shared';
import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext, type RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDayOrNull } from '../../common/utils/content.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { TeacherScopeService } from '../academics/teacher-scope.service.js';
import { AuditService } from '../audit/audit.service.js';

/** Postgres TIME ⇄ "HH:MM". */
const toTime = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const fromTime = (d: Date) => d.toISOString().slice(11, 16);
const PUBLISH_LOCK = 62_026;

const include = {
  section: {
    include: {
      class: { select: { name: true, levelOrder: true } },
      academicYear: { select: { id: true, name: true, status: true } },
    },
  },
  creator: { select: { fullName: true } },
  entries: {
    include: {
      classSubject: { include: { subject: { select: { name: true } } } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { periodNumber: 'asc' }],
  },
} satisfies Prisma.TimetableInclude;

type Row = Prisma.TimetableGetPayload<{ include: typeof include }>;

function toItem(t: Row): TimetableItem {
  return {
    id: t.id,
    name: t.name,
    status: t.status as TimetableStatus,
    effectiveFrom: isoDayOrNull(t.effectiveFrom),
    effectiveTo: isoDayOrNull(t.effectiveTo),
    section: {
      id: t.section.id,
      className: t.section.class.name,
      sectionName: t.section.name,
      academicYear: t.section.academicYear,
    },
    createdBy: t.creator.fullName,
    entries: t.entries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      periodNumber: e.periodNumber,
      startTime: fromTime(e.startTime),
      endTime: fromTime(e.endTime),
      isBreak: e.isBreak,
      roomLabel: e.roomLabel,
      classSubject: e.classSubject
        ? { id: e.classSubject.id, subjectName: e.classSubject.subject.name }
        : null,
      teacher: e.teacher
        ? { id: e.teacher.id, fullName: fullName(e.teacher.firstName, e.teacher.lastName) }
        : null,
    })),
  };
}

/**
 * Class timetables: drafts are edited freely; publishing checks that no teacher is booked in two
 * places at once (across every published timetable of the year) and archives the section's
 * previous published timetable. Teachers see their own week across all published timetables.
 */
@Injectable()
export class TimetableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: TeacherScopeService,
  ) {}

  private async load(id: string) {
    const t = await this.prisma.timetable.findUnique({ where: { id }, include });
    if (!t) throw new NotFoundException('Timetable not found');
    return t;
  }

  async list(academicYearId: string, sectionId?: string): Promise<TimetableListItem[]> {
    const rows = await this.prisma.timetable.findMany({
      where: { academicYearId, sectionId },
      include,
      orderBy: [
        { section: { class: { levelOrder: 'asc' } } },
        { section: { name: 'asc' } },
        { status: 'asc' },
      ],
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status as TimetableStatus,
      effectiveFrom: isoDayOrNull(t.effectiveFrom),
      effectiveTo: isoDayOrNull(t.effectiveTo),
      section: { id: t.section.id, className: t.section.class.name, sectionName: t.section.name },
      periods: new Set(t.entries.map((e) => e.periodNumber)).size,
      lessons: t.entries.filter((e) => !e.isBreak && e.classSubjectId).length,
    }));
  }

  async get(id: string) {
    return toItem(await this.load(id));
  }

  async create(input: CreateTimetableData, actor: RequestUser, context: RequestContext) {
    const section = await this.prisma.section.findUnique({
      where: { id: input.sectionId },
      include: { academicYear: true },
    });
    if (!section) throw new BadRequestException(['sectionId: Section not found']);
    if (section.academicYear.status === 'CLOSED')
      throw new BadRequestException(`${section.academicYear.name} is closed`);
    const source = input.copyFromId ? await this.load(input.copyFromId) : null;
    const sameClass = source && source.section.classId === section.classId;
    const row = await this.prisma.$transaction(async (tx) => {
      const t = await tx.timetable.create({
        data: {
          academicYearId: section.academicYearId,
          sectionId: section.id,
          name: input.name,
          effectiveFrom: input.effectiveFrom ? dayToDate(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? dayToDate(input.effectiveTo) : null,
          createdBy: actor.id,
          entries: source
            ? {
                create: source.entries.map((e) => ({
                  dayOfWeek: e.dayOfWeek,
                  periodNumber: e.periodNumber,
                  startTime: e.startTime,
                  endTime: e.endTime,
                  isBreak: e.isBreak,
                  roomLabel: e.roomLabel,
                  // Subjects/teachers carry over only within the same class (another class has other subjects).
                  classSubjectId: sameClass ? e.classSubjectId : null,
                  teacherEmployeeId: sameClass ? e.teacherEmployeeId : null,
                })),
              }
            : undefined,
        },
        include,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TIMETABLE_CREATED,
          entityType: 'timetable',
          entityId: t.id,
          userId: actor.id,
          after: {
            name: t.name,
            section: `${t.section.class.name} ${t.section.name}`,
            copiedFrom: input.copyFromId ?? null,
          },
          context,
        },
        tx,
      );
      return t;
    });
    return toItem(row);
  }

  async update(
    id: string,
    input: UpdateTimetableInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const t = await this.load(id);
    if (t.status === 'ARCHIVED')
      throw new BadRequestException('An archived timetable cannot be changed');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.timetable.update({
        where: { id },
        data: {
          name: input.name,
          effectiveFrom:
            input.effectiveFrom === undefined
              ? undefined
              : input.effectiveFrom
                ? dayToDate(input.effectiveFrom)
                : null,
          effectiveTo:
            input.effectiveTo === undefined
              ? undefined
              : input.effectiveTo
                ? dayToDate(input.effectiveTo)
                : null,
        },
        include,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TIMETABLE_UPDATED,
          entityType: 'timetable',
          entityId: id,
          userId: actor.id,
          after: input,
          context,
        },
        tx,
      );
      return updated;
    });
    return toItem(row);
  }

  /** Replaces all periods of a draft. Subjects must belong to the section's class; teachers must be active. */
  async saveEntries(
    id: string,
    input: SaveTimetableEntriesData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const t = await this.load(id);
    if (t.status !== 'DRAFT')
      throw new BadRequestException(
        'Only a draft timetable can be edited — make a copy to change a published one',
      );
    const subjectIds = [
      ...new Set(input.entries.map((e) => e.classSubjectId).filter((x): x is string => !!x)),
    ];
    const teacherIds = [
      ...new Set(input.entries.map((e) => e.teacherEmployeeId).filter((x): x is string => !!x)),
    ];
    const [subjects, teachers] = await Promise.all([
      this.prisma.classSubject.count({
        where: {
          id: { in: subjectIds },
          classId: t.section.classId,
          academicYearId: t.academicYearId,
        },
      }),
      this.prisma.employee.count({ where: { id: { in: teacherIds }, status: 'ACTIVE' } }),
    ]);
    if (subjects !== subjectIds.length)
      throw new BadRequestException([
        `entries: Choose subjects set up for ${t.section.class.name}`,
      ]);
    if (teachers !== teacherIds.length)
      throw new BadRequestException(['entries: Choose active staff members as teachers']);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.timetableEntry.deleteMany({ where: { timetableId: id } });
      await tx.timetableEntry.createMany({
        data: input.entries.map((e) => ({
          timetableId: id,
          dayOfWeek: e.dayOfWeek,
          periodNumber: e.periodNumber,
          startTime: toTime(e.startTime),
          endTime: toTime(e.endTime),
          isBreak: e.isBreak,
          classSubjectId: e.isBreak ? null : (e.classSubjectId ?? null),
          teacherEmployeeId: e.isBreak ? null : (e.teacherEmployeeId ?? null),
          roomLabel: e.roomLabel ?? null,
        })),
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TIMETABLE_UPDATED,
          entityType: 'timetable',
          entityId: id,
          userId: actor.id,
          after: { entries: input.entries.length },
          context,
        },
        tx,
      );
      return tx.timetable.findUniqueOrThrow({ where: { id }, include });
    });
    return toItem(row);
  }

  /** Teacher double-bookings: inside this timetable, and against every other published one of the year. */
  async clashes(
    id: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<TimetableClash[]> {
    const t = await db.timetable.findUniqueOrThrow({ where: { id }, include });
    const others = await db.timetableEntry.findMany({
      where: {
        teacherEmployeeId: {
          in: t.entries.map((e) => e.teacherEmployeeId).filter((x): x is string => !!x),
        },
        timetable: {
          academicYearId: t.academicYearId,
          status: 'PUBLISHED',
          id: { not: t.id },
          sectionId: { not: t.sectionId },
        },
      },
      include: {
        timetable: { include: { section: { include: { class: { select: { name: true } } } } } },
      },
    });
    const overlaps = (
      a: { startTime: Date; endTime: Date },
      b: { startTime: Date; endTime: Date },
    ) => a.startTime < b.endTime && b.startTime < a.endTime;
    const clashes: TimetableClash[] = [];
    const lessons = t.entries.filter((e) => !e.isBreak && e.teacherEmployeeId);
    for (const e of lessons) {
      const name = e.teacher ? fullName(e.teacher.firstName, e.teacher.lastName) : 'Teacher';
      const where = `${DAY_LABELS[e.dayOfWeek]} period ${e.periodNumber} (${fromTime(e.startTime)}–${fromTime(e.endTime)})`;
      for (const o of others.filter(
        (o) =>
          o.teacherEmployeeId === e.teacherEmployeeId &&
          o.dayOfWeek === e.dayOfWeek &&
          overlaps(o, e),
      )) {
        clashes.push({
          kind: 'TEACHER',
          dayOfWeek: e.dayOfWeek,
          periodNumber: e.periodNumber,
          message: `${name} is already teaching ${o.timetable.section.class.name} – ${o.timetable.section.name} on ${where}`,
        });
      }
      for (const o of lessons.filter(
        (o) =>
          o.id !== e.id &&
          o.teacherEmployeeId === e.teacherEmployeeId &&
          o.dayOfWeek === e.dayOfWeek &&
          overlaps(o, e) &&
          o.periodNumber > e.periodNumber,
      )) {
        clashes.push({
          kind: 'TEACHER',
          dayOfWeek: e.dayOfWeek,
          periodNumber: o.periodNumber,
          message: `${name} has two overlapping periods on ${where}`,
        });
      }
    }
    return clashes;
  }

  async publish(id: string, actor: RequestUser, context: RequestContext) {
    const t = await this.load(id);
    if (t.status !== 'DRAFT')
      throw new BadRequestException('Only a draft timetable can be published');
    if (!t.entries.some((e) => !e.isBreak && e.classSubjectId))
      throw new BadRequestException('Add at least one lesson before publishing');
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PUBLISH_LOCK})`;
      const clashes = await this.clashes(id, tx);
      if (clashes.length) throw new ConflictException(clashes.map((c) => c.message));
      const previous = await tx.timetable.findFirst({
        where: { sectionId: t.sectionId, status: 'PUBLISHED' },
      });
      if (previous)
        await tx.timetable.update({ where: { id: previous.id }, data: { status: 'ARCHIVED' } });
      await tx.timetable.update({ where: { id }, data: { status: 'PUBLISHED' } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TIMETABLE_PUBLISHED,
          entityType: 'timetable',
          entityId: id,
          userId: actor.id,
          after: { name: t.name, replaced: previous?.id ?? null },
          context,
        },
        tx,
      );
      return tx.timetable.findUniqueOrThrow({ where: { id }, include });
    });
    return toItem(row);
  }

  async archive(id: string, actor: RequestUser, context: RequestContext) {
    const t = await this.load(id);
    if (t.status === 'ARCHIVED') throw new BadRequestException('Already archived');
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.timetable.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        include,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TIMETABLE_ARCHIVED,
          entityType: 'timetable',
          entityId: id,
          userId: actor.id,
          before: { status: t.status },
          context,
        },
        tx,
      );
      return updated;
    });
    return toItem(row);
  }

  async teacherTimetable(employeeId: string): Promise<TeacherTimetable> {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw new NotFoundException('Staff member not found');
    const entries = await this.prisma.timetableEntry.findMany({
      where: {
        teacherEmployeeId: employeeId,
        timetable: { status: 'PUBLISHED', academicYear: { isActive: true } },
      },
      include: {
        classSubject: { include: { subject: { select: { name: true } } } },
        timetable: { include: { section: { include: { class: { select: { name: true } } } } } },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return {
      teacher: { id: emp.id, fullName: fullName(emp.firstName, emp.lastName) },
      entries: entries.map((e) => ({
        sectionId: e.timetable.sectionId,
        dayOfWeek: e.dayOfWeek,
        periodNumber: e.periodNumber,
        startTime: fromTime(e.startTime),
        endTime: fromTime(e.endTime),
        className: e.timetable.section.class.name,
        sectionName: e.timetable.section.name,
        subjectName: e.classSubject?.subject.name ?? 'Lesson',
        roomLabel: e.roomLabel,
      })),
    };
  }

  async myTimetable(actor: RequestUser): Promise<TeacherTimetable | null> {
    const employeeId = await this.scope.employeeIdForUser(actor.id);
    return employeeId ? this.teacherTimetable(employeeId) : null;
  }
}

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Timetable')
@ApiBearerAuth()
@Controller('timetables')
export class TimetableController {
  constructor(private readonly timetables: TimetableService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TIMETABLE_READ)
  list(
    @Query({ schema: listTimetablesQuerySchema }) q: { academicYearId: string; sectionId?: string },
  ) {
    return this.timetables.list(q.academicYearId, q.sectionId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TIMETABLE_MANAGE)
  create(
    @Body({ schema: createTimetableSchema }) body: CreateTimetableData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.timetables.create(body, user, getRequestContext(req));
  }

  /** The signed-in teacher's week (null when the login is not linked to a staff record). */
  @Get('mine')
  @Authenticated()
  mine(@CurrentUser() user: RequestUser) {
    return this.timetables.myTimetable(user);
  }

  @Get('teachers/:id')
  @RequirePermissions(PERMISSIONS.TIMETABLE_READ)
  teacher(@id() employeeId: string) {
    return this.timetables.teacherTimetable(employeeId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TIMETABLE_READ)
  get(@id() timetableId: string) {
    return this.timetables.get(timetableId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TIMETABLE_MANAGE)
  update(
    @id() timetableId: string,
    @Body({ schema: updateTimetableSchema }) body: UpdateTimetableInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.timetables.update(timetableId, body, user, getRequestContext(req));
  }

  @Put(':id/entries')
  @RequirePermissions(PERMISSIONS.TIMETABLE_MANAGE)
  saveEntries(
    @id() timetableId: string,
    @Body({ schema: saveTimetableEntriesSchema }) body: SaveTimetableEntriesData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.timetables.saveEntries(timetableId, body, user, getRequestContext(req));
  }

  @Get(':id/clashes')
  @RequirePermissions(PERMISSIONS.TIMETABLE_READ)
  clashes(@id() timetableId: string) {
    return this.timetables.clashes(timetableId);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TIMETABLE_MANAGE)
  publish(@id() timetableId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.timetables.publish(timetableId, user, getRequestContext(req));
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.TIMETABLE_MANAGE)
  archive(@id() timetableId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.timetables.archive(timetableId, user, getRequestContext(req));
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
