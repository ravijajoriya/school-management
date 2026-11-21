import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  ROLE_CODES,
  type CreateRoleInput,
  type PermissionItem,
  type RoleItem,
  type UpdateRoleInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AuditService } from '../audit/audit.service.js';

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  isSystem: true,
  _count: { select: { users: true } },
  permissions: { select: { permission: { select: { code: true } } } },
} satisfies Prisma.RoleSelect;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

function toItem(r: RoleRow): RoleItem {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissionsLocked: r.code === ROLE_CODES.ADMIN,
    userCount: r._count.users,
    permissionCodes: r.permissions.map((p) => p.permission.code).sort(),
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRoles(): Promise<RoleItem[]> {
    const rows = await this.prisma.role.findMany({
      select: roleSelect,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toItem);
  }

  async listPermissions(): Promise<PermissionItem[]> {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, name: true, module: true, description: true },
    });
  }

  async getRole(id: string): Promise<RoleItem> {
    const row = await this.prisma.role.findUnique({ where: { id }, select: roleSelect });
    if (!row) throw new NotFoundException('Role not found');
    return toItem(row);
  }

  async createRole(input: CreateRoleInput, actor: RequestUser, context: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const role = toItem(
        await tx.role.create({
          data: { code: input.code, name: input.name, description: input.description ?? null },
          select: roleSelect,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ROLE_CREATED,
          entityType: 'role',
          entityId: role.id,
          userId: actor.id,
          after: { code: role.code, name: role.name, description: role.description },
          context,
        },
        tx,
      );
      return role;
    });
  }

  async updateRole(
    id: string,
    input: UpdateRoleInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.getRole(id);
    if (before.isSystem) throw new BadRequestException('System roles cannot be renamed');
    return this.prisma.$transaction(async (tx) => {
      const role = toItem(
        await tx.role.update({
          where: { id },
          data: { name: input.name, description: input.description },
          select: roleSelect,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ROLE_UPDATED,
          entityType: 'role',
          entityId: id,
          userId: actor.id,
          before: { name: before.name, description: before.description },
          after: { name: role.name, description: role.description },
          context,
        },
        tx,
      );
      return role;
    });
  }

  async deleteRole(id: string, actor: RequestUser, context: RequestContext): Promise<void> {
    const role = await this.getRole(id);
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role.userCount > 0) {
      throw new ConflictException('Remove this role from all users before deleting it');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ROLE_DELETED,
          entityType: 'role',
          entityId: id,
          userId: actor.id,
          before: { code: role.code, name: role.name, permissions: role.permissionCodes },
          context,
        },
        tx,
      );
    });
  }

  async setPermissions(
    id: string,
    permissionCodes: string[],
    actor: RequestUser,
    context: RequestContext,
  ): Promise<RoleItem> {
    const before = await this.getRole(id);
    if (before.permissionsLocked) {
      throw new BadRequestException('The Admin role always has every permission');
    }
    const codes = [...new Set(permissionCodes)];
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    if (permissions.length !== codes.length) {
      const known = new Set(permissions.map((p) => p.code));
      throw new BadRequestException(
        codes.filter((c) => !known.has(c)).map((c) => `permissionCodes: Unknown permission ${c}`),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ roleId: id, permissionId: p.id })),
        });
      }
      const role = toItem(await tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect }));
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ROLE_PERMISSIONS_CHANGED,
          entityType: 'role',
          entityId: id,
          userId: actor.id,
          before: { permissions: before.permissionCodes },
          after: { permissions: role.permissionCodes },
          context,
        },
        tx,
      );
      return role;
    });
  }
}
