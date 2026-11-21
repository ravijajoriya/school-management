import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
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
  createMeetingSchema,
  listMeetingsQuerySchema,
  updateMeetingSchema,
  uuidSchema,
  type ListMeetingsQuery,
  type MeetingItem,
  type MeetingStatus,
  type Paginated,
  type UpdateMeetingInput,
} from '@school/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { Authenticated, CurrentUser } from '../../common/decorators/access.decorators.js';
import { getRequestContext, type RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayRange, fullName, paginated } from '../../common/utils/content.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { TeacherScopeService } from '../academics/teacher-scope.service.js';
import { AuditService } from '../audit/audit.service.js';

const include = {
  enrolment: {
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      student: {
        include: {
          guardians: { where: { isPrimary: true }, select: { fullName: true, phone: true } },
        },
      },
    },
  },
  teacher: { select: { id: true, firstName: true, lastName: true } },
  creator: { select: { fullName: true } },
} satisfies Prisma.ParentTeacherMeetingInclude;
type Row = Prisma.ParentTeacherMeetingGetPayload<{ include: typeof include }>;

function toItem(m: Row): MeetingItem {
  const s = m.enrolment.student;
  return {
    id: m.id,
    meetingAt: m.meetingAt.toISOString(),
    venue: m.venue,
    purpose: m.purpose,
    status: m.status as MeetingStatus,
    notes: m.notes,
    student: {
      id: s.id,
      fullName: fullName(s.firstName, s.middleName, s.lastName),
      admissionNumber: s.admissionNumber,
      className: m.enrolment.class.name,
      sectionName: m.enrolment.section.name,
    },
    guardian: s.guardians[0] ?? null,
    teacher: { id: m.teacher.id, fullName: fullName(m.teacher.firstName, m.teacher.lastName) },
    createdBy: m.creator.fullName,
  };
}

/**
 * Parent–teacher meetings. The office (meetings.read / meetings.manage) sees and schedules every
 * meeting; a teacher (meetings.schedule_own) works only with their own meetings, for students of
 * sections they teach or class-teach.
 */
@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: TeacherScopeService,
  ) {}

  /** null = every meeting; otherwise the actor's own employee id. */
  private async viewScope(actor: RequestUser): Promise<string | null> {
    if (
      actor.permissions.has(PERMISSIONS.MEETINGS_READ) ||
      actor.permissions.has(PERMISSIONS.MEETINGS_MANAGE)
    )
      return null;
    return this.ownEmployee(actor);
  }

  private async ownEmployee(actor: RequestUser): Promise<string> {
    if (!actor.permissions.has(PERMISSIONS.MEETINGS_OWN))
      throw new ForbiddenException('You do not have permission to manage parent–teacher meetings');
    const employeeId = await this.scope.employeeIdForUser(actor.id);
    if (!employeeId) throw new ForbiddenException('Your login is not linked to a staff record');
    return employeeId;
  }

  async list(q: ListMeetingsQuery, actor: RequestUser): Promise<Paginated<MeetingItem>> {
    const own = await this.viewScope(actor);
    const where: Prisma.ParentTeacherMeetingWhereInput = {
      status: q.status,
      teacherEmployeeId: own ?? undefined,
      meetingAt: dayRange(q.from, q.to),
    };
    const [rows, total] = await Promise.all([
      this.prisma.parentTeacherMeeting.findMany({
        where,
        include,
        orderBy: { meetingAt: q.status === 'SCHEDULED' ? 'asc' : 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.parentTeacherMeeting.count({ where }),
    ]);
    return paginated(rows.map(toItem), total, q.page, q.pageSize);
  }

  private async load(id: string, actor: RequestUser, write: boolean) {
    const row = await this.prisma.parentTeacherMeeting.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Meeting not found');
    const all = write
      ? actor.permissions.has(PERMISSIONS.MEETINGS_MANAGE)
      : (await this.viewScope(actor)) === null;
    if (!all && row.teacherEmployeeId !== (await this.ownEmployee(actor)))
      throw new ForbiddenException('This meeting belongs to another teacher');
    return row;
  }

  async get(id: string, actor: RequestUser) {
    return toItem(await this.load(id, actor, false));
  }

  async create(
    input: z.output<typeof createMeetingSchema>,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const office = actor.permissions.has(PERMISSIONS.MEETINGS_MANAGE);
    const enrolment = await this.prisma.studentEnrolment.findUnique({
      where: { id: input.enrolmentId },
      select: { id: true, status: true, sectionId: true, academicYearId: true },
    });
    if (!enrolment) throw new BadRequestException(['enrolmentId: Student not found']);
    if (enrolment.status !== 'ACTIVE')
      throw new BadRequestException('The student is no longer enrolled');

    let teacherEmployeeId: string;
    if (office) {
      teacherEmployeeId =
        input.teacherEmployeeId ?? (await this.scope.employeeIdForUser(actor.id)) ?? '';
      if (!teacherEmployeeId)
        throw new BadRequestException(['teacherEmployeeId: Choose the teacher']);
      const teacher = await this.prisma.employee.findUnique({
        where: { id: teacherEmployeeId },
        select: { status: true },
      });
      if (teacher?.status !== 'ACTIVE')
        throw new BadRequestException(['teacherEmployeeId: Choose an active staff member']);
    } else {
      teacherEmployeeId = await this.ownEmployee(actor);
      if (input.teacherEmployeeId && input.teacherEmployeeId !== teacherEmployeeId)
        throw new ForbiddenException('You can only schedule your own meetings');
      const sections = await this.scope.accessibleSectionIds(actor.id, enrolment.academicYearId);
      if (!sections.includes(enrolment.sectionId))
        throw new ForbiddenException('This student is not in a class you teach');
    }
    const meetingAt = new Date(input.meetingAt);
    if (meetingAt.getTime() < Date.now() - 60_000)
      throw new BadRequestException(['meetingAt: Choose a time in the future']);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.parentTeacherMeeting.create({
        data: {
          studentEnrolmentId: enrolment.id,
          teacherEmployeeId,
          meetingAt,
          venue: input.venue ?? null,
          purpose: input.purpose ?? null,
          createdBy: actor.id,
        },
        include,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.MEETING_SCHEDULED,
          entityType: 'parent_teacher_meeting',
          entityId: created.id,
          userId: actor.id,
          after: { enrolmentId: enrolment.id, teacherEmployeeId, meetingAt: input.meetingAt },
          context,
        },
        tx,
      );
      return created;
    });
    return toItem(row);
  }

  async update(id: string, input: UpdateMeetingInput, actor: RequestUser, context: RequestContext) {
    const before = await this.load(id, actor, true);
    const status = input.status ?? before.status;
    if (before.status !== 'SCHEDULED' && (status !== before.status || input.meetingAt))
      throw new ConflictException(`This meeting is already ${before.status.toLowerCase()}`);
    const notes = input.notes === undefined ? before.notes : input.notes;
    if (status === 'COMPLETED' && !notes?.trim())
      throw new BadRequestException(['notes: Record what was discussed']);
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.parentTeacherMeeting.update({
        where: { id },
        data: {
          status,
          meetingAt: input.meetingAt ? new Date(input.meetingAt) : undefined,
          venue: input.venue,
          notes,
        },
        include,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.MEETING_UPDATED,
          entityType: 'parent_teacher_meeting',
          entityId: id,
          userId: actor.id,
          before: { status: before.status, meetingAt: before.meetingAt, venue: before.venue },
          after: { status, meetingAt: input.meetingAt, venue: input.venue },
          context,
        },
        tx,
      );
      return saved;
    });
    return toItem(row);
  }
}

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  /** Office: every meeting. Teacher (meetings.schedule_own): only their own. */
  @Get()
  @Authenticated()
  list(
    @Query({ schema: listMeetingsQuerySchema }) q: ListMeetingsQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.meetings.list(q, user);
  }

  @Get(':id')
  @Authenticated()
  get(@id() meetingId: string, @CurrentUser() user: RequestUser) {
    return this.meetings.get(meetingId, user);
  }

  @Post()
  @Authenticated()
  create(
    @Body({ schema: createMeetingSchema }) body: z.output<typeof createMeetingSchema>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.meetings.create(body, user, getRequestContext(req));
  }

  @Patch(':id')
  @Authenticated()
  update(
    @id() meetingId: string,
    @Body({ schema: updateMeetingSchema }) body: UpdateMeetingInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.meetings.update(meetingId, body, user, getRequestContext(req));
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
