import { PERMISSION_DEFINITIONS, ROLE_CODES } from '@school/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { PasswordService } from '../../modules/auth/password.service.js';

export interface SeedAccount {
  fullName: string;
  email?: string;
  phone?: string;
  /** If omitted a temporary password is generated and reported once. */
  password?: string;
}

export interface SeedOptions {
  /** Created only if no user holds the ADMIN role yet. */
  admin?: SeedAccount;
  /** Optional demo/test teacher; created only if the identifier is not taken. */
  teacher?: SeedAccount;
  log?: (message: string) => void;
}

export interface SeedResult {
  permissions: number;
  createdAccounts: { role: string; identifier: string; temporaryPassword?: string }[];
}

const SYSTEM_ROLES = [
  {
    code: ROLE_CODES.ADMIN,
    name: 'Administrator',
    description: 'Full access to every module. Always holds every permission.',
  },
  {
    code: ROLE_CODES.TEACHER,
    name: 'Teacher',
    description: 'Teaching staff. Access is scoped to assigned classes and subjects.',
  },
] as const;

/**
 * Idempotent reference-data seed. Safe to run on every deployment:
 *  - upserts every permission defined in @school/shared
 *  - upserts the system roles and keeps ADMIN holding every permission
 *  - creates the first admin (and optional teacher) account if missing
 */
export async function seedDatabase(
  prisma: PrismaClient,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const log = options.log ?? (() => {});
  const passwords = new PasswordService();
  const result: SeedResult = { permissions: 0, createdAccounts: [] };

  for (const def of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { code: def.code },
      update: { name: def.name, module: def.module, description: def.description ?? null },
      create: {
        code: def.code,
        name: def.name,
        module: def.module,
        description: def.description ?? null,
      },
    });
  }
  result.permissions = PERMISSION_DEFINITIONS.length;
  log(`Permissions synced: ${result.permissions}`);

  const roleIds: Record<string, string> = {};
  for (const role of SYSTEM_ROLES) {
    const row = await prisma.role.upsert({
      where: { code: role.code },
      update: { isSystem: true },
      create: { ...role, isSystem: true },
      select: { id: true },
    });
    roleIds[role.code] = row.id;
  }

  const allPermissions = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: roleIds[ROLE_CODES.ADMIN], permissionId: p.id })),
    skipDuplicates: true,
  });
  log('System roles synced (ADMIN holds every permission)');

  const adminExists = await prisma.user.count({
    where: { roles: { some: { role: { code: ROLE_CODES.ADMIN } } } },
  });
  if (!adminExists && options.admin) {
    result.createdAccounts.push(
      await createAccount(
        prisma,
        passwords,
        options.admin,
        roleIds[ROLE_CODES.ADMIN],
        ROLE_CODES.ADMIN,
      ),
    );
  } else if (!adminExists) {
    log('No admin account exists and no SEED_ADMIN_* settings were given — skipping.');
  }

  if (options.teacher) {
    const taken = await prisma.user.count({
      where: {
        OR: [
          ...(options.teacher.email ? [{ email: options.teacher.email.toLowerCase() }] : []),
          ...(options.teacher.phone ? [{ phone: options.teacher.phone }] : []),
        ],
      },
    });
    if (!taken) {
      result.createdAccounts.push(
        await createAccount(
          prisma,
          passwords,
          options.teacher,
          roleIds[ROLE_CODES.TEACHER],
          ROLE_CODES.TEACHER,
        ),
      );
    }
  }

  return result;
}

async function createAccount(
  prisma: PrismaClient,
  passwords: PasswordService,
  account: SeedAccount,
  roleId: string,
  roleCode: string,
) {
  if (!account.email && !account.phone) {
    throw new Error(`Seed ${roleCode} account needs an email or phone`);
  }
  const temporaryPassword = account.password ? undefined : passwords.generateTemporaryPassword();
  const email = account.email?.trim().toLowerCase() || null;
  const phone = account.phone?.replace(/[\s-]/g, '') || null;
  await prisma.user.create({
    data: {
      fullName: account.fullName,
      email,
      phone,
      passwordHash: await passwords.hash(account.password ?? temporaryPassword!),
      mustChangePassword: true,
      roles: { create: { roleId } },
    },
  });
  return { role: roleCode, identifier: (email ?? phone)!, temporaryPassword };
}
