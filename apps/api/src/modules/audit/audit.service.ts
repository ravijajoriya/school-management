import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, AuditLogItem, ListAuditLogsQuery, Paginated } from '@school/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';

export interface AuditEntry {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  context?: RequestContext;
}

type Db = PrismaService | Prisma.TransactionClient;

const toJson = (value: unknown) =>
  value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends an audit event. Pass a transaction client (`tx`) so the audit row commits or rolls
   * back together with the change it describes. Never put secrets (password hashes, tokens) in
   * `before`/`after`.
   */
  async log(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        userId: entry.userId ?? null,
        beforeJson: toJson(entry.before),
        afterJson: toJson(entry.after),
        reason: entry.reason ?? null,
        ipAddress: entry.context?.ipAddress ?? null,
        userAgent: entry.context?.userAgent ?? null,
      },
    });
  }

  /** Best-effort logging for events outside a transaction (e.g. failed logins). Never throws. */
  async logSafe(entry: AuditEntry): Promise<void> {
    try {
      await this.log(entry);
    } catch (error) {
      this.logger.error(`Failed to write audit event ${entry.action}: ${String(error)}`);
    }
  }

  async list(query: ListAuditLogsQuery): Promise<Paginated<AuditLogItem>> {
    const where: Prisma.AuditLogWhereInput = {
      action: query.action ? { contains: query.action, mode: 'insensitive' } : undefined,
      entityType: query.entityType,
      userId: query.userId,
      createdAt:
        query.from || query.to
          ? {
              gte: query.from ? new Date(`${query.from}T00:00:00`) : undefined,
              lt: query.to
                ? new Date(new Date(`${query.to}T00:00:00`).getTime() + 86_400_000)
                : undefined,
            }
          : undefined,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: { id: true, fullName: true } } },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        user: r.user,
        beforeJson: r.beforeJson,
        afterJson: r.afterJson,
        reason: r.reason,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}
