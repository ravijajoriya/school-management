import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  ROLE_CODES,
  type CreateUserData,
  type ListUsersQuery,
  type Paginated,
  type PasswordResetResponse,
  SELF_SERVICE_PERMISSIONS,
  type PermissionCode,
  type UpdateUserData,
  type UserCreatedResponse,
  type UserListItem,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from '../auth/password.service.js';
import { TokenService } from '../auth/token.service.js';
import { UserAccessService } from '../auth/user-access.service.js';

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  roles: {
    select: { role: { select: { id: true, code: true, name: true } } },
    orderBy: { role: { name: 'asc' } },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toListItem(u: UserRow): UserListItem {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    status: u.status as UserListItem['status'],
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    roles: u.roles.map((r) => r.role),
  };
}

/** Audit snapshot of a user (never includes the password hash). */
const snapshot = (u: UserListItem) => ({
  fullName: u.fullName,
  email: u.email,
  phone: u.phone,
  status: u.status,
  roles: u.roles.map((r) => r.code),
});

/** A permission the actor lacks, ignoring teacher self-service permissions. */
const exceedsActor = (actor: RequestUser, code: PermissionCode) =>
  !SELF_SERVICE_PERMISSIONS.has(code) && !actor.permissions.has(code);

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly userAccess: UserAccessService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<UserListItem>> {
    const where: Prisma.UserWhereInput = {
      status: query.status,
      roles: query.roleId ? { some: { roleId: query.roleId } } : undefined,
      OR: query.search
        ? [
            { fullName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search.toLowerCase() } },
            { phone: { contains: query.search.replace(/[\s-]/g, '') } },
          ]
        : undefined,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { fullName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map(toListItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(id: string): Promise<UserListItem> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return toListItem(user);
  }

  async create(
    input: CreateUserData,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<UserCreatedResponse> {
    await this.assertCanAssignRoles(actor, await this.assertRolesExist(input.roleIds));
    const temporaryPassword = input.password
      ? undefined
      : this.passwords.generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(input.password ?? temporaryPassword!);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          passwordHash,
          mustChangePassword: true,
          roles: {
            create: input.roleIds.map((roleId) => ({ roleId, assignedBy: actor.id })),
          },
        },
        select: userSelect,
      });
      const item = toListItem(created);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.USER_CREATED,
          entityType: 'user',
          entityId: item.id,
          userId: actor.id,
          after: snapshot(item),
          context,
        },
        tx,
      );
      return item;
    });

    return { user, ...(temporaryPassword ? { temporaryPassword } : {}) };
  }

  async update(
    id: string,
    input: UpdateUserData,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<UserListItem> {
    const before = await this.get(id);
    await this.assertCanManageUser(actor, id);
    const deactivating = input.status !== undefined && input.status !== 'ACTIVE';

    if (deactivating && id === actor.id) {
      throw new BadRequestException(['status: You cannot deactivate or lock your own account']);
    }
    if (deactivating && before.roles.some((r) => r.code === ROLE_CODES.ADMIN)) {
      await this.assertAnotherActiveAdmin(id);
    }
    const nextEmail = input.email === undefined ? before.email : input.email;
    const nextPhone = input.phone === undefined ? before.phone : input.phone;
    if (!nextEmail && !nextPhone) {
      throw new BadRequestException(['email: A user needs an email or a phone number']);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = toListItem(
        await tx.user.update({
          where: { id },
          data: {
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            status: input.status,
          },
          select: userSelect,
        }),
      );
      if (deactivating) await this.tokens.revokeAllForUser(id, tx);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.USER_UPDATED,
          entityType: 'user',
          entityId: id,
          userId: actor.id,
          before: snapshot(before),
          after: snapshot(updated),
          context,
        },
        tx,
      );
      return updated;
    });
  }

  async setRoles(
    id: string,
    roleIds: string[],
    actor: RequestUser,
    context: RequestContext,
  ): Promise<UserListItem> {
    const before = await this.get(id);
    await this.assertCanManageUser(actor, id);
    const roles = await this.assertRolesExist(roleIds);
    await this.assertCanAssignRoles(actor, roles);
    const hadAdmin = before.roles.some((r) => r.code === ROLE_CODES.ADMIN);
    const keepsAdmin = roles.some((r) => r.code === ROLE_CODES.ADMIN);

    if (hadAdmin && !keepsAdmin) {
      if (id === actor.id) {
        throw new BadRequestException(['roleIds: You cannot remove the Admin role from yourself']);
      }
      await this.assertAnotherActiveAdmin(id);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: roleIds } } });
      const existing = new Set(before.roles.map((r) => r.id));
      const toAdd = roleIds.filter((rid) => !existing.has(rid));
      if (toAdd.length) {
        await tx.userRole.createMany({
          data: toAdd.map((roleId) => ({ userId: id, roleId, assignedBy: actor.id })),
        });
      }
      const updated = toListItem(
        await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.USER_ROLES_CHANGED,
          entityType: 'user',
          entityId: id,
          userId: actor.id,
          before: { roles: before.roles.map((r) => r.code) },
          after: { roles: updated.roles.map((r) => r.code) },
          context,
        },
        tx,
      );
      return updated;
    });
  }

  /** Admin-initiated reset: issues a temporary password, forces a change, ends all sessions. */
  async resetPassword(
    id: string,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<PasswordResetResponse> {
    await this.get(id);
    await this.assertCanManageUser(actor, id);
    const temporaryPassword = this.passwords.generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() },
      });
      await this.tokens.revokeAllForUser(id, tx);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
          entityType: 'user',
          entityId: id,
          userId: actor.id,
          context,
        },
        tx,
      );
    });
    return { temporaryPassword };
  }

  /*
   * Privilege-escalation guards. Holders of `roles.manage` (Admins) may do anything. Everyone
   * else may only assign roles, and manage users, whose permissions they already hold, and can
   * never grant or touch the ADMIN role. Self-service permissions (own class attendance, own
   * leave) are not counted, so a user manager can still manage teachers.
   */
  private async assertCanAssignRoles(
    actor: RequestUser,
    roles: { code: string; permissions: { permission: { code: string } }[] }[],
  ) {
    if (actor.permissions.has(PERMISSIONS.ROLES_MANAGE)) return;
    for (const role of roles) {
      const exceeds =
        role.code === ROLE_CODES.ADMIN ||
        role.permissions.some(({ permission }) =>
          exceedsActor(actor, permission.code as PermissionCode),
        );
      if (exceeds) {
        throw new ForbiddenException(`You cannot assign the ${role.code} role`);
      }
    }
  }

  private async assertCanManageUser(actor: RequestUser, targetUserId: string) {
    if (actor.permissions.has(PERMISSIONS.ROLES_MANAGE) || actor.id === targetUserId) return;
    const target = await this.userAccess.load(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    const exceeds =
      target.roles.includes(ROLE_CODES.ADMIN) ||
      [...target.permissions].some((p) => exceedsActor(actor, p));
    if (exceeds) {
      throw new ForbiddenException('You cannot manage a user with more access than you');
    }
  }

  private async assertRolesExist(roleIds: string[]) {
    const unique = [...new Set(roleIds)];
    const roles = await this.prisma.role.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        code: true,
        permissions: { select: { permission: { select: { code: true } } } },
      },
    });
    if (roles.length !== unique.length) {
      throw new BadRequestException(['roleIds: One or more selected roles do not exist']);
    }
    return roles;
  }

  /** Prevents locking the school out: at least one other active Admin must remain. */
  private async assertAnotherActiveAdmin(excludingUserId: string) {
    const others = await this.prisma.user.count({
      where: {
        id: { not: excludingUserId },
        status: 'ACTIVE',
        roles: { some: { role: { code: ROLE_CODES.ADMIN } } },
      },
    });
    if (others === 0) {
      throw new ConflictException('At least one active Admin must remain');
    }
  }
}
