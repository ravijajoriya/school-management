import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type CreateEventInput,
  type EventItem,
  type EventStatus,
  type ListEventsQuery,
  type Paginated,
  type PublicEvent,
  type UpdateEventInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import {
  paginated,
  schoolDate,
  startOfSchoolDay,
  toDate,
  uniqueSlug,
} from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

const include = { creator: { select: { id: true, fullName: true } } } as const;
type Row = Prisma.EventGetPayload<{ include: typeof include }>;

function toItem(r: Row): EventItem {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    venue: r.venue,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    status: r.status as EventStatus,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.creator,
  };
}

const toPublic = (e: EventItem): PublicEvent => ({
  title: e.title,
  slug: e.slug,
  description: e.description,
  venue: e.venue,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  status: e.status as PublicEvent['status'],
});

const snapshot = (e: EventItem) => ({
  title: e.title,
  status: e.status,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  venue: e.venue,
});

/** Events still to come, including ones happening today (school time zone). */
function upcomingWhere(): Prisma.EventWhereInput {
  const todayStart = startOfSchoolDay(schoolDate());
  return { OR: [{ endsAt: { gte: new Date() } }, { endsAt: null, startsAt: { gte: todayStart } }] };
}

/** The exact complement of upcomingWhere (written out: SQL NOT over NULL end times drops rows). */
function pastWhere(): Prisma.EventWhereInput {
  const todayStart = startOfSchoolDay(schoolDate());
  return { OR: [{ endsAt: { lt: new Date() } }, { endsAt: null, startsAt: { lt: todayStart } }] };
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListEventsQuery): Promise<Paginated<EventItem>> {
    const where: Prisma.EventWhereInput = {
      status: query.status,
      title: query.search ? { contains: query.search, mode: 'insensitive' } : undefined,
      ...(query.when === 'upcoming' ? upcomingWhere() : {}),
      ...(query.when === 'past' ? pastWhere() : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        include,
        orderBy: { startsAt: query.when === 'past' ? 'desc' : 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toItem), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<EventItem> {
    const row = await this.prisma.event.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Event not found');
    return toItem(row);
  }

  async create(input: CreateEventInput, actor: RequestUser, context: RequestContext) {
    const slug = await uniqueSlug(
      input.title,
      async (s) =>
        !!(await this.prisma.event.findUnique({ where: { slug: s }, select: { id: true } })),
    );
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.event.create({
          data: {
            title: input.title,
            slug,
            description: input.description ?? null,
            venue: input.venue ?? null,
            startsAt: new Date(input.startsAt),
            endsAt: toDate(input.endsAt) ?? null,
            status: input.status ?? 'DRAFT',
            createdBy: actor.id,
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EVENT_CREATED,
          entityType: 'event',
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

  async update(id: string, input: UpdateEventInput, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.event.update({
          where: { id },
          data: {
            title: input.title,
            description: input.description,
            venue: input.venue,
            startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
            endsAt: toDate(input.endsAt),
            status: input.status,
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EVENT_UPDATED,
          entityType: 'event',
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
      await tx.event.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EVENT_DELETED,
          entityType: 'event',
          entityId: id,
          userId: actor.id,
          before: snapshot(before),
          context,
        },
        tx,
      );
    });
  }

  // --- Public -------------------------------------------------------------------------

  async listPublic(when: 'upcoming' | 'past', limit: number): Promise<PublicEvent[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        status: { in: ['PUBLISHED', 'CANCELLED'] },
        ...(when === 'upcoming' ? upcomingWhere() : pastWhere()),
      },
      include,
      orderBy: { startsAt: when === 'upcoming' ? 'asc' : 'desc' },
      take: limit,
    });
    return rows.map((r) => toPublic(toItem(r)));
  }

  async getPublic(slug: string): Promise<PublicEvent> {
    const row = await this.prisma.event.findFirst({
      where: { slug, status: { in: ['PUBLISHED', 'CANCELLED'] } },
      include,
    });
    if (!row) throw new NotFoundException('Event not found');
    return toPublic(toItem(row));
  }
}
