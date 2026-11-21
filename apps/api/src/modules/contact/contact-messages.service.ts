import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type ContactMessageItem,
  type ContactMessageStatus,
  type ListContactMessagesQuery,
  type Paginated,
  type PublicContactMessageInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { paginated } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

const include = { handler: { select: { id: true, fullName: true } } } as const;
type Row = Prisma.ContactMessageGetPayload<{ include: typeof include }>;

function toItem(r: Row): ContactMessageItem {
  return {
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    message: r.message,
    status: r.status as ContactMessageStatus,
    createdAt: r.createdAt.toISOString(),
    handledBy: r.handler,
    handledAt: r.handledAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ContactMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Bots that fill the honeypot get a success response but nothing is stored. */
  async submitPublic(input: PublicContactMessageInput, context: RequestContext): Promise<void> {
    if (input.website) return;
    await this.prisma.contactMessage.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        message: input.message,
        createdIp: context.ipAddress,
      },
    });
  }

  async list(query: ListContactMessagesQuery): Promise<Paginated<ContactMessageItem>> {
    const where: Prisma.ContactMessageWhereInput = {
      status: query.status,
      OR: query.search
        ? [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search.toLowerCase() } },
            { phone: { contains: query.search.replace(/[\s-]/g, '') } },
            { message: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contactMessage.count({ where }),
      this.prisma.contactMessage.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toItem), total, query.page, query.pageSize);
  }

  async countNew(): Promise<number> {
    return this.prisma.contactMessage.count({ where: { status: 'NEW' } });
  }

  async updateStatus(
    id: string,
    status: ContactMessageStatus,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<ContactMessageItem> {
    const before = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Message not found');
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.contactMessage.update({
          where: { id },
          data: {
            status,
            handledBy: status === 'NEW' ? null : actor.id,
            handledAt: status === 'NEW' ? null : new Date(),
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.CONTACT_MESSAGE_UPDATED,
          entityType: 'contact_message',
          entityId: id,
          userId: actor.id,
          before: { status: before.status },
          after: { status },
          context,
        },
        tx,
      );
      return item;
    });
  }
}
