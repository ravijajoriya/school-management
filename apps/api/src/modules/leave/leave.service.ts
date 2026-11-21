import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  leaveDays,
  type CreateLeaveRequestInput,
  type LeaveRequestItem,
  type LeaveStatus,
  type LeaveSummary,
  type LeaveType,
  type ListLeaveRequestsQuery,
  type Paginated,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDay, paginated, schoolDate } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

const include = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      userId: true,
    },
  },
  reviewer: { select: { id: true, fullName: true } },
} satisfies Prisma.LeaveRequestInclude;

type Row = Prisma.LeaveRequestGetPayload<{ include: typeof include }>;

/** Requests that block the same days for the same employee (mirrors the DB exclusion constraint). */
const ACTIVE: LeaveStatus[] = ['PENDING', 'APPROVED'];

function toItem(row: Row, today = schoolDate()): LeaveRequestItem {
  const startDate = isoDay(row.startDate);
  const endDate = isoDay(row.endDate);
  return {
    id: row.id,
    employee: {
      id: row.employee.id,
      fullName: fullName(row.employee.firstName, row.employee.lastName),
      employeeCode: row.employee.employeeCode,
      designation: row.employee.designation,
    },
    leaveType: row.leaveType as LeaveType,
    startDate,
    endDate,
    days: leaveDays(startDate, endDate),
    reason: row.reason,
    status: row.status as LeaveStatus,
    reviewedBy: row.reviewer,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewRemarks: row.reviewRemarks,
    createdAt: row.createdAt.toISOString(),
    canCancel: row.status === 'PENDING' || (row.status === 'APPROVED' && startDate > today),
  };
}

/** Teacher leave: apply and cancel (self-service), approve/reject and history (office). */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async myEmployeeId(actor: RequestUser): Promise<string> {
    const emp = await this.prisma.employee.findUnique({
      where: { userId: actor.id },
      select: { id: true, status: true },
    });
    if (!emp || emp.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Your login is not linked to an active staff record. Ask the office to link it.',
      );
    }
    return emp.id;
  }

  async listMine(actor: RequestUser): Promise<LeaveRequestItem[]> {
    const employeeId = await this.myEmployeeId(actor);
    const rows = await this.prisma.leaveRequest.findMany({
      where: { employeeId },
      include,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    const today = schoolDate();
    return rows.map((r) => toItem(r, today));
  }

  async apply(
    input: CreateLeaveRequestInput,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<LeaveRequestItem> {
    const employeeId = await this.myEmployeeId(actor);
    const start = dayToDate(input.startDate);
    const end = dayToDate(input.endDate);
    return this.prisma.$transaction(async (tx) => {
      const clash = await tx.leaveRequest.findFirst({
        where: {
          employeeId,
          status: { in: ACTIVE },
          startDate: { lte: end },
          endDate: { gte: start },
        },
        select: { startDate: true, endDate: true },
      });
      if (clash) {
        throw new ConflictException([
          `startDate: You already have a pending or approved request for ${isoDay(clash.startDate)} – ${isoDay(clash.endDate)}`,
        ]);
      }
      const row = await tx.leaveRequest.create({
        data: {
          employeeId,
          leaveType: input.leaveType,
          startDate: start,
          endDate: end,
          reason: input.reason,
        },
        include,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.LEAVE_REQUESTED,
          entityType: 'leave_request',
          entityId: row.id,
          userId: actor.id,
          after: {
            leaveType: input.leaveType,
            startDate: input.startDate,
            endDate: input.endDate,
          },
          context,
        },
        tx,
      );
      return toItem(row);
    });
  }

  async cancel(id: string, actor: RequestUser, context: RequestContext): Promise<LeaveRequestItem> {
    const employeeId = await this.myEmployeeId(actor);
    const row = await this.prisma.leaveRequest.findUnique({ where: { id }, include });
    if (!row || row.employeeId !== employeeId)
      throw new NotFoundException('Leave request not found');
    if (!toItem(row).canCancel) {
      throw new BadRequestException(
        'Only pending requests, or approved leave that has not started yet, can be cancelled',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.leaveRequest.updateMany({
        where: { id, status: row.status },
        data: { status: 'CANCELLED' },
      });
      if (!count)
        throw new ConflictException('This request was just changed — reload and try again');
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.LEAVE_CANCELLED,
          entityType: 'leave_request',
          entityId: id,
          userId: actor.id,
          before: { status: row.status },
          after: { status: 'CANCELLED' },
          context,
        },
        tx,
      );
      return toItem(await tx.leaveRequest.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  async list(query: ListLeaveRequestsQuery): Promise<Paginated<LeaveRequestItem>> {
    const where: Prisma.LeaveRequestWhereInput = {
      status: query.status,
      employeeId: query.employeeId,
      ...(query.to ? { startDate: { lte: dayToDate(query.to) } } : {}),
      ...(query.from ? { endDate: { gte: dayToDate(query.from) } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.leaveRequest.count({ where }),
      this.prisma.leaveRequest.findMany({
        where,
        include,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const today = schoolDate();
    return paginated(
      rows.map((r) => toItem(r, today)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async summary(): Promise<LeaveSummary> {
    const today = dayToDate(schoolDate());
    const [pending, onLeave] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.leaveRequest.findMany({
        where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
        include,
        orderBy: { endDate: 'asc' },
      }),
    ]);
    return {
      pending,
      onLeaveToday: onLeave.map((r) => ({
        employeeId: r.employee.id,
        fullName: fullName(r.employee.firstName, r.employee.lastName),
        leaveType: r.leaveType as LeaveType,
        endDate: isoDay(r.endDate),
      })),
    };
  }

  async review(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    remarks: string | undefined,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<LeaveRequestItem> {
    const row = await this.prisma.leaveRequest.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Leave request not found');
    if (row.employee.userId === actor.id) {
      throw new ForbiddenException('You cannot review your own leave request');
    }
    if (row.status !== 'PENDING') {
      throw new ConflictException(
        `This request is already ${row.status.toLowerCase()} and can no longer be reviewed`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.leaveRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: decision,
          reviewedBy: actor.id,
          reviewedAt: new Date(),
          reviewRemarks: remarks ?? null,
        },
      });
      if (!count) throw new ConflictException('This request was just reviewed by someone else');
      await this.audit.log(
        {
          action:
            decision === 'APPROVED' ? AUDIT_ACTIONS.LEAVE_APPROVED : AUDIT_ACTIONS.LEAVE_REJECTED,
          entityType: 'leave_request',
          entityId: id,
          userId: actor.id,
          before: { status: 'PENDING' },
          after: { status: decision, remarks: remarks ?? null },
          context,
        },
        tx,
      );
      return toItem(await tx.leaveRequest.findUniqueOrThrow({ where: { id }, include }));
    });
  }
}
