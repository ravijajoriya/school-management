import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  ROLE_CODES,
  type AuthUser,
  type PermissionCode,
  type UserStatus,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionCode[];
const KNOWN_PERMISSIONS = new Set<string>(ALL_PERMISSIONS);

export interface UserAccessProfile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  roles: string[];
  permissions: Set<PermissionCode>;
}

/** Loads a user together with the roles and effective permissions used for authorization. */
@Injectable()
export class UserAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async load(userId: string): Promise<UserAccessProfile | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        mustChangePassword: true,
        passwordChangedAt: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });
    if (!user) return null;

    const roles = user.roles.map((r) => r.role.code);
    const permissions = new Set<PermissionCode>();
    if (roles.includes(ROLE_CODES.ADMIN)) {
      // ADMIN always holds every permission, including ones added in later phases.
      ALL_PERMISSIONS.forEach((p) => permissions.add(p));
    }
    for (const { role } of user.roles) {
      for (const { permission } of role.permissions) {
        if (KNOWN_PERMISSIONS.has(permission.code))
          permissions.add(permission.code as PermissionCode);
      }
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      status: user.status as UserStatus,
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt,
      roles,
      permissions,
    };
  }

  static toAuthUser(profile: UserAccessProfile): AuthUser {
    return {
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      status: profile.status,
      mustChangePassword: profile.mustChangePassword,
      roles: profile.roles,
      permissions: [...profile.permissions].sort(),
    };
  }
}
