import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type AnnouncementItem,
  type AnnouncementStatus,
  type CreateAnnouncementInput,
  type ListAnnouncementsQuery,
  type Paginated,
  type PublicAnnouncement,
  type UpdateAnnouncementInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { isWithinWindow, paginated, toDate, uniqueSlug } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

const include = { creator: { select: { id: true, fullName: true } } } as const;
type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;

const NEW_FOR_MS = 7 * 86_400_000;

function toItem(r: Row): AnnouncementItem {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    body: r.body,
    status: r.status as AnnouncementStatus,
    publishAt: r.publishAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    isLive: r.status === 'PUBLISHED' && isWithinWindow(r.publishAt, r.expiresAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    createdBy: r.creator,
  };
}

const snapshot = (a: AnnouncementItem) => ({
  title: a.title,
  status: a.status,
  publishAt: a.publishAt,
  expiresAt: a.expiresAt,
});

/** Visible on the public site right now. */
function liveWhere(now = new Date()): Prisma.AnnouncementWhereInput {
  return {
    status: 'PUBLISHED',
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  };
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAnnouncementsQuery): Promise<Paginated<AnnouncementItem>> {
    const where: Prisma.AnnouncementWhereInput = {
      status: query.status,
      title: query.search ? { contains: query.search, mode: 'insensitive' } : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<AnnouncementItem> {
    const row = await this.prisma.announcement.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Announcement not found');
    return toItem(row);
  }

  async create(input: CreateAnnouncementInput, actor: RequestUser, context: RequestContext) {
    const slug = await uniqueSlug(
      input.title,
      async (s) =>
        !!(await this.prisma.announcement.findUnique({ where: { slug: s }, select: { id: true } })),
    );
    const status = input.status ?? 'DRAFT';
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.announcement.create({
          data: {
            title: input.title,
            slug,
            body: input.body,
            status,
            // Publishing without a schedule means "now", so ordering by publish time works.
            publishAt: toDate(input.publishAt) ?? (status === 'PUBLISHED' ? new Date() : null),
            expiresAt: toDate(input.expiresAt) ?? null,
            createdBy: actor.id,
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ANNOUNCEMENT_CREATED,
          entityType: 'announcement',
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

  async update(
    id: string,
    input: UpdateAnnouncementInput,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<AnnouncementItem> {
    const before = await this.get(id);
    const publishing = input.status === 'PUBLISHED' && before.status !== 'PUBLISHED';
    let publishAt = toDate(input.publishAt);
    if (publishing && !publishAt && !before.publishAt) publishAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      // The slug is kept stable so shared links keep working when the title is edited.
      const item = toItem(
        await tx.announcement.update({
          where: { id },
          data: {
            title: input.title,
            body: input.body,
            status: input.status,
            publishAt,
            expiresAt: toDate(input.expiresAt),
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
          entityType: 'announcement',
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
      await tx.announcement.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ANNOUNCEMENT_DELETED,
          entityType: 'announcement',
          entityId: id,
          userId: actor.id,
          before: { ...snapshot(before), body: before.body },
          context,
        },
        tx,
      );
    });
  }

  // --- Public -------------------------------------------------------------------------

  async listPublic(limit: number): Promise<PublicAnnouncement[]> {
    const rows = await this.prisma.announcement.findMany({
      where: liveWhere(),
      orderBy: [{ publishAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map(toPublic);
  }

  async getPublic(slug: string): Promise<PublicAnnouncement> {
    const row = await this.prisma.announcement.findFirst({ where: { slug, ...liveWhere() } });
    if (!row) throw new NotFoundException('Announcement not found');
    return toPublic(row);
  }
}

function toPublic(r: {
  title: string;
  slug: string;
  body: string;
  publishAt: Date | null;
  createdAt: Date;
}) {
  const publishedAt = r.publishAt ?? r.createdAt;
  return {
    title: r.title,
    slug: r.slug,
    body: r.body,
    publishedAt: publishedAt.toISOString(),
    isNew: Date.now() - publishedAt.getTime() < NEW_FOR_MS,
  };
}
