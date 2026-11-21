import {
  BadRequestException,
  Body,
  Controller,
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
  ROLE_CODES,
  createComplaintSchema,
  listComplaintsQuerySchema,
  updateComplaintSchema,
  uuidSchema,
  type ComplaintCategory,
  type ComplaintItem,
  type ComplaintStatus,
  type ListComplaintsQuery,
  type Paginated,
  type UpdateComplaintInput,
} from '@school/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext, type RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { paginated, schoolDate } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

const include = {
  assignee: { select: { id: true, fullName: true } },
  creator: { select: { fullName: true } },
} satisfies Prisma.ComplaintInclude;
type Row = Prisma.ComplaintGetPayload<{ include: typeof include }>;

const HISTORY_LABELS: Record<string, string> = {
  [AUDIT_ACTIONS.COMPLAINT_CREATED]: 'Logged',
  [AUDIT_ACTIONS.COMPLAINT_UPDATED]: 'Updated',
};

function toItem(c: Row, history: ComplaintItem['history'] = []): ComplaintItem {
  return {
    id: c.id,
    referenceNumber: c.referenceNumber,
    category: c.category as ComplaintCategory,
    subject: c.subject,
    description: c.description,
    submittedByName: c.submittedByName,
    contactPhone: c.contactPhone,
    status: c.status as ComplaintStatus,
    assignedTo: c.assignee,
    resolutionNotes: c.resolutionNotes,
    createdBy: c.creator.fullName,
    createdAt: c.createdAt.toISOString(),
    history,
  };
}

/** Users who may be assigned complaints: active staff holding complaints.manage (or ADMIN). */
const assigneeWhere: Prisma.UserWhereInput = {
  status: 'ACTIVE',
  roles: {
    some: {
      role: {
        OR: [
          { code: ROLE_CODES.ADMIN },
          { permissions: { some: { permission: { code: PERMISSIONS.COMPLAINTS_MANAGE } } } },
        ],
      },
    },
  },
};

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListComplaintsQuery): Promise<Paginated<ComplaintItem>> {
    const where: Prisma.ComplaintWhereInput = {
      status: q.status,
      category: q.category,
      ...(q.search
        ? {
            OR: [
              { referenceNumber: { contains: q.search, mode: 'insensitive' } },
              { subject: { contains: q.search, mode: 'insensitive' } },
              { submittedByName: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.complaint.count({ where }),
    ]);
    return paginated(
      rows.map((r) => toItem(r)),
      total,
      q.page,
      q.pageSize,
    );
  }

  async summary() {
    const rows = await this.prisma.complaint.groupBy({
      by: ['status', 'category'],
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 };
    const byCategory: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + r._count._all;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + r._count._all;
    }
    return { byStatus, byCategory, total: rows.reduce((n, r) => n + r._count._all, 0) };
  }

  async get(id: string): Promise<ComplaintItem> {
    const row = await this.prisma.complaint.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Complaint not found');
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType: 'complaint', entityId: id },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return toItem(
      row,
      logs.map((l) => {
        const after = (l.afterJson ?? {}) as Record<string, unknown>;
        const parts: string[] = [];
        if (typeof after.status === 'string')
          parts.push(`status ${after.status.toLowerCase().replace('_', ' ')}`);
        if (typeof after.assignee === 'string') parts.push(`assigned to ${after.assignee}`);
        if (after.assignee === null && 'assignee' in after) parts.push('unassigned');
        return {
          action: HISTORY_LABELS[l.action] ?? l.action,
          at: l.createdAt.toISOString(),
          user: l.user?.fullName ?? null,
          detail: parts.join(', ') || null,
        };
      }),
    );
  }

  assignees() {
    return this.prisma.user.findMany({
      where: assigneeWhere,
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  private async assigneeName(userId: string | null | undefined) {
    if (!userId) return null;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...assigneeWhere },
      select: { fullName: true },
    });
    if (!user)
      throw new BadRequestException(['assignedTo: Choose a staff member who handles complaints']);
    return user.fullName;
  }

  async create(
    input: z.output<typeof createComplaintSchema>,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const assignee = await this.assigneeName(input.assignedTo);
    const row = await this.prisma.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT nextval('complaint_reference_seq') AS n`;
      const referenceNumber = `CMP-${schoolDate().slice(0, 4)}-${n.toString().padStart(5, '0')}`;
      const created = await tx.complaint.create({
        data: {
          referenceNumber,
          category: input.category,
          subject: input.subject,
          description: input.description,
          submittedByName: input.submittedByName ?? null,
          contactPhone: input.contactPhone ?? null,
          assignedTo: input.assignedTo ?? null,
          status: input.assignedTo ? 'IN_PROGRESS' : 'OPEN',
          createdBy: actor.id,
        },
        include,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.COMPLAINT_CREATED,
          entityType: 'complaint',
          entityId: created.id,
          userId: actor.id,
          after: {
            referenceNumber,
            category: created.category,
            status: created.status,
            ...(assignee ? { assignee } : {}),
          },
          context,
        },
        tx,
      );
      return created;
    });
    return this.get(row.id);
  }

  async update(
    id: string,
    input: UpdateComplaintInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.prisma.complaint.findUnique({ where: { id }, include });
    if (!before) throw new NotFoundException('Complaint not found');
    const assignee =
      input.assignedTo === undefined ? undefined : await this.assigneeName(input.assignedTo);
    const status = input.status ?? before.status;
    const notes =
      input.resolutionNotes === undefined ? before.resolutionNotes : input.resolutionNotes;
    const closing = status === 'RESOLVED' || status === 'CLOSED';
    if (closing && !notes?.trim())
      throw new BadRequestException(['resolutionNotes: Write how the complaint was resolved']);
    const wasClosed = before.status === 'RESOLVED' || before.status === 'CLOSED';
    await this.prisma.$transaction(async (tx) => {
      await tx.complaint.update({
        where: { id },
        data: {
          status,
          category: input.category,
          assignedTo: input.assignedTo,
          resolutionNotes: notes,
          resolvedAt: closing ? (wasClosed ? before.resolvedAt : new Date()) : null,
        },
      });
      const after: Record<string, unknown> = {};
      if (status !== before.status) after.status = status;
      if (input.category && input.category !== before.category) after.category = input.category;
      if (assignee !== undefined && input.assignedTo !== before.assignedTo)
        after.assignee = assignee;
      if (notes !== before.resolutionNotes) after.resolutionNotes = notes;
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.COMPLAINT_UPDATED,
          entityType: 'complaint',
          entityId: id,
          userId: actor.id,
          before: {
            status: before.status,
            category: before.category,
            assignee: before.assignee?.fullName ?? null,
          },
          after,
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }
}

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Complaints')
@ApiBearerAuth()
@Controller('complaints')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPLAINTS_READ)
  list(@Query({ schema: listComplaintsQuerySchema }) q: ListComplaintsQuery) {
    return this.complaints.list(q);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_READ)
  summary() {
    return this.complaints.summary();
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE)
  assignees() {
    return this.complaints.assignees();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_READ)
  get(@id() complaintId: string) {
    return this.complaints.get(complaintId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE)
  create(
    @Body({ schema: createComplaintSchema }) body: z.output<typeof createComplaintSchema>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.complaints.create(body, user, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPLAINTS_MANAGE)
  update(
    @id() complaintId: string,
    @Body({ schema: updateComplaintSchema }) body: UpdateComplaintInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.complaints.update(complaintId, body, user, getRequestContext(req));
  }
}

@Module({
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
