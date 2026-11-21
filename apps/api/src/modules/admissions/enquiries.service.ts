import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  ENQUIRY_STATUSES,
  PERMISSIONS,
  ROLE_CODES,
  type ClassItem,
  type CreateEnquiryInput,
  type CreateFollowUpInput,
  type EnquiryAssignee,
  type EnquiryDetail,
  type EnquiryListItem,
  type EnquirySource,
  type EnquiryStatus,
  type EnquirySummary,
  type ListEnquiriesQuery,
  type Paginated,
  type PublicEnquiryInput,
  type PublicEnquiryResponse,
  type UpdateEnquiryInput,
} from '@school/shared';
import { randomInt } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayRange, fullName, paginated, schoolDate } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';
import { UserAccessService } from '../auth/user-access.service.js';

const CLOSED_STATUSES: EnquiryStatus[] = ['ADMISSION_CONFIRMED', 'NOT_INTERESTED', 'CLOSED'];

const listInclude = {
  classSought: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true } },
  followUps: {
    select: { nextFollowUpAt: true },
    orderBy: { followUpAt: 'desc' as const },
    take: 1,
  },
} as const;
type ListRow = Prisma.AdmissionEnquiryGetPayload<{ include: typeof listInclude }>;

function toListItem(r: ListRow): EnquiryListItem {
  return {
    id: r.id,
    referenceNumber: r.referenceNumber,
    studentName: r.studentName,
    guardianName: r.guardianName,
    phone: r.phone,
    email: r.email,
    classSought: r.classSought,
    status: r.status as EnquiryStatus,
    source: r.source as EnquirySource,
    assignedTo: r.assignee,
    submittedAt: r.submittedAt.toISOString(),
    nextFollowUpAt: r.followUps[0]?.nextFollowUpAt?.toISOString() ?? null,
  };
}

type EnquiryData = Omit<CreateEnquiryInput, 'source'> & {
  dateOfBirth?: string;
  email?: string;
  message?: string;
};

@Injectable()
export class EnquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly userAccess: UserAccessService,
  ) {}

  async activeClasses(): Promise<ClassItem[]> {
    return this.prisma.class.findMany({
      where: { isActive: true },
      orderBy: { levelOrder: 'asc' },
      select: { id: true, name: true, levelOrder: true },
    });
  }

  /** Public website form. Bots that fill the honeypot get a convincing reply but nothing is stored. */
  async submitPublic(
    input: PublicEnquiryInput,
    context: RequestContext,
  ): Promise<PublicEnquiryResponse> {
    if (input.website) {
      return {
        referenceNumber: `ENQ-${schoolDate().slice(0, 4)}-${String(randomInt(10_000, 99_999))}`,
      };
    }
    const row = await this.createRecord(input as EnquiryData, 'WEBSITE', context, null);
    return { referenceNumber: row.referenceNumber };
  }

  /** Staff-entered enquiry (walk-in, phone call, referral…). */
  async create(input: CreateEnquiryInput, actor: RequestUser, context: RequestContext) {
    const row = await this.createRecord(
      input as EnquiryData,
      input.source ?? 'WALK_IN',
      context,
      actor.id,
    );
    return this.get(row.id);
  }

  private async createRecord(
    input: EnquiryData,
    source: EnquirySource,
    context: RequestContext,
    actorId: string | null,
  ) {
    const cls = await this.prisma.class.findFirst({
      where: { id: input.classSoughtId, isActive: true },
      select: { id: true },
    });
    if (!cls) throw new BadRequestException(['classSoughtId: Select a class from the list']);

    return this.prisma.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT nextval('admission_enquiry_number_seq') AS n`;
      const referenceNumber = `ENQ-${schoolDate().slice(0, 4)}-${String(n).padStart(5, '0')}`;
      const row = await tx.admissionEnquiry.create({
        data: {
          referenceNumber,
          studentName: input.studentName,
          classSoughtId: input.classSoughtId,
          dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null,
          guardianName: input.guardianName,
          phone: input.phone,
          email: input.email ?? null,
          message: input.message ?? null,
          source,
          createdIp: actorId ? null : context.ipAddress,
        },
      });
      await this.audit.log(
        {
          action: actorId ? AUDIT_ACTIONS.ENQUIRY_CREATED : AUDIT_ACTIONS.ENQUIRY_SUBMITTED,
          entityType: 'admission_enquiry',
          entityId: row.id,
          userId: actorId,
          after: { referenceNumber, source, status: row.status },
          context,
        },
        tx,
      );
      return row;
    });
  }

  async list(query: ListEnquiriesQuery, actor: RequestUser): Promise<Paginated<EnquiryListItem>> {
    const search = query.search?.trim();
    const where: Prisma.AdmissionEnquiryWhereInput = {
      status: query.status,
      classSoughtId: query.classSoughtId,
      assignedTo:
        query.assignedTo === 'me'
          ? actor.id
          : query.assignedTo === 'unassigned'
            ? null
            : query.assignedTo,
      submittedAt: dayRange(query.from, query.to),
      OR: search
        ? [
            { referenceNumber: { contains: search, mode: 'insensitive' } },
            { studentName: { contains: search, mode: 'insensitive' } },
            { guardianName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search.replace(/[\s-]/g, '') } },
            { email: { contains: search.toLowerCase() } },
          ]
        : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.admissionEnquiry.count({ where }),
      this.prisma.admissionEnquiry.findMany({
        where,
        include: listInclude,
        orderBy: { submittedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toListItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<EnquiryDetail> {
    const row = await this.prisma.admissionEnquiry.findUnique({
      where: { id },
      include: {
        ...listInclude,
        followUps: {
          orderBy: { followUpAt: 'desc' },
          include: { user: { select: { id: true, fullName: true } } },
        },
        convertedStudent: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            middleName: true,
            lastName: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Enquiry not found');
    const converted = row.convertedStudent;
    const history = await this.prisma.auditLog.findMany({
      where: { entityType: 'admission_enquiry', entityId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
    return {
      ...toListItem({ ...row, followUps: row.followUps.slice(0, 1) }),
      dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      message: row.message,
      convertedStudent: converted
        ? {
            id: converted.id,
            admissionNumber: converted.admissionNumber,
            fullName: fullName(converted.firstName, converted.middleName, converted.lastName),
          }
        : null,
      followUps: row.followUps.map((f) => ({
        id: f.id,
        followUpAt: f.followUpAt.toISOString(),
        outcome: f.outcome,
        notes: f.notes,
        nextFollowUpAt: f.nextFollowUpAt?.toISOString() ?? null,
        user: f.user,
      })),
      history: history.map((h) => ({
        action: h.action,
        at: h.createdAt.toISOString(),
        user: h.user,
        before: h.beforeJson,
        after: h.afterJson,
      })),
    };
  }

  async update(id: string, input: UpdateEnquiryInput, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    if (input.assignedToId) await this.assertAssignable(input.assignedToId);
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.admissionEnquiry.update({
        where: { id },
        data: { status: input.status, assignedTo: input.assignedToId },
        include: { assignee: { select: { fullName: true } } },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ENQUIRY_UPDATED,
          entityType: 'admission_enquiry',
          entityId: id,
          userId: actor.id,
          before: { status: before.status, assignedTo: before.assignedTo?.fullName ?? null },
          after: { status: row.status, assignedTo: row.assignee?.fullName ?? null },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  async addFollowUp(
    id: string,
    input: CreateFollowUpInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.enquiryFollowUp.create({
        data: {
          enquiryId: id,
          userId: actor.id,
          outcome: input.outcome || null,
          notes: input.notes,
          nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
        },
      });
      const statusChanged = input.status && input.status !== before.status;
      // Taking action on an unassigned enquiry assigns it to you.
      const assign = !before.assignedTo;
      if (statusChanged || assign) {
        await tx.admissionEnquiry.update({
          where: { id },
          data: {
            status: statusChanged ? input.status : undefined,
            assignedTo: assign ? actor.id : undefined,
          },
        });
      }
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ENQUIRY_FOLLOW_UP_ADDED,
          entityType: 'admission_enquiry',
          entityId: id,
          userId: actor.id,
          before: statusChanged ? { status: before.status } : undefined,
          after: {
            outcome: input.outcome || null,
            ...(statusChanged ? { status: input.status } : {}),
            nextFollowUpAt: input.nextFollowUpAt ?? null,
          },
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Active staff who can see enquiries (ADMIN or enquiries.read/manage). */
  async assignees(): Promise<EnquiryAssignee[]> {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: {
              OR: [
                { code: ROLE_CODES.ADMIN },
                {
                  permissions: {
                    some: {
                      permission: {
                        code: { in: [PERMISSIONS.ENQUIRIES_READ, PERMISSIONS.ENQUIRIES_MANAGE] },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async summary(): Promise<EnquirySummary> {
    const grouped = await this.prisma.admissionEnquiry.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(ENQUIRY_STATUSES.map((s) => [s, 0])) as Record<
      EnquiryStatus,
      number
    >;
    for (const g of grouped) byStatus[g.status as EnquiryStatus] = g._count._all;
    const [{ due }] = await this.prisma.$queryRaw<{ due: bigint }[]>`
      SELECT count(*) AS due FROM (
        SELECT DISTINCT ON (enquiry_id) enquiry_id, next_follow_up_at
        FROM enquiry_follow_ups ORDER BY enquiry_id, follow_up_at DESC
      ) f
      JOIN admission_enquiries e ON e.id = f.enquiry_id
      WHERE f.next_follow_up_at <= now() AND e.status NOT IN (${CLOSED_STATUSES[0]}, ${CLOSED_STATUSES[1]}, ${CLOSED_STATUSES[2]})`;
    return { byStatus, dueFollowUps: Number(due) };
  }

  private async assertAssignable(userId: string) {
    const profile = await this.userAccess.load(userId);
    const canSee =
      profile?.status === 'ACTIVE' &&
      (profile.permissions.has(PERMISSIONS.ENQUIRIES_READ) ||
        profile.permissions.has(PERMISSIONS.ENQUIRIES_MANAGE));
    if (!canSee) {
      throw new BadRequestException(['assignedToId: This user cannot work on admission enquiries']);
    }
  }
}
