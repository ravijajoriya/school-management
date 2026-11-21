import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type CreateNoticeInput,
  type NoticeItem,
  type Paginated,
  type PaginationQuery,
  type UpdateNoticeInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { isWithinWindow, paginated, toDate } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

const include = { creator: { select: { id: true, fullName: true } } } as const;
type Row = Prisma.InternalNoticeGetPayload<{ include: typeof include }>;

function toItem(r: Row): NoticeItem {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    audienceRoleCode: r.audienceRoleCode,
    publishAt: r.publishAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    isLive: isWithinWindow(r.publishAt, r.expiresAt),
    createdAt: r.createdAt.toISOString(),
    createdBy: r.creator,
  };
}

const snapshot = (n: NoticeItem) => ({
  title: n.title,
  audienceRoleCode: n.audienceRoleCode,
  publishAt: n.publishAt,
  expiresAt: n.expiresAt,
});

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQuery): Promise<Paginated<NoticeItem>> {
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.internalNotice.count(),
      this.prisma.internalNotice.findMany({
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toItem), total, query.page, query.pageSize);
  }

  /** Live notices for the signed-in user: addressed to everyone or to one of their roles. */
  async feed(user: RequestUser): Promise<NoticeItem[]> {
    const now = new Date();
    const rows = await this.prisma.internalNotice.findMany({
      where: {
        AND: [
          { OR: [{ audienceRoleCode: null }, { audienceRoleCode: { in: user.roles } }] },
          { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      include,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map(toItem);
  }

  async get(id: string): Promise<NoticeItem> {
    const row = await this.prisma.internalNotice.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Notice not found');
    return toItem(row);
  }

  async create(input: CreateNoticeInput, actor: RequestUser, context: RequestContext) {
    await this.assertAudience(input.audienceRoleCode ?? null);
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.internalNotice.create({
          data: {
            title: input.title,
            body: input.body,
            audienceRoleCode: input.audienceRoleCode ?? null,
            publishAt: toDate(input.publishAt) ?? null,
            expiresAt: toDate(input.expiresAt) ?? null,
            createdBy: actor.id,
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.NOTICE_CREATED,
          entityType: 'internal_notice',
          entityId: item.id,
          userId: actor.id,
          after: snapshot(item),
          context,
        },
        tx,
      );
      return item;
    });
  }

  async update(id: string, input: UpdateNoticeInput, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    if (input.audienceRoleCode !== undefined) await this.assertAudience(input.audienceRoleCode);
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.internalNotice.update({
          where: { id },
          data: {
            title: input.title,
            body: input.body,
            audienceRoleCode: input.audienceRoleCode,
            publishAt: toDate(input.publishAt),
            expiresAt: toDate(input.expiresAt),
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.NOTICE_UPDATED,
          entityType: 'internal_notice',
          entityId: id,
          userId: actor.id,
          before: snapshot(before),
          after: snapshot(item),
          context,
        },
        tx,
      );
      return item;
    });
  }

  async remove(id: string, actor: RequestUser, context: RequestContext): Promise<void> {
    const before = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.internalNotice.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.NOTICE_DELETED,
          entityType: 'internal_notice',
          entityId: id,
          userId: actor.id,
          before: snapshot(before),
          context,
        },
        tx,
      );
    });
  }

  private async assertAudience(code: string | null) {
    if (!code) return;
    const role = await this.prisma.role.findUnique({ where: { code }, select: { id: true } });
    if (!role) throw new BadRequestException(['audienceRoleCode: Unknown role']);
  }
}
