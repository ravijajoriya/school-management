import {
  DEFAULT_CERTIFICATE_TEMPLATES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_SALARY_COMPONENTS,
  idCardLayoutSchema,
  PAGE_CONTENT_SCHEMAS,
  PAGE_KEYS,
  PERMISSION_DEFINITIONS,
  ROLE_CODES,
} from '@school/shared';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { PasswordService } from '../../modules/auth/password.service.js';
import { DEFAULT_CLASSES, DEFAULT_PAGES } from './default-content.js';

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
 *  - grants DEFAULT_ROLE_PERMISSIONS (e.g. TEACHER → attendance.mark_assigned) only when a
 *    permission is created for the first time, so later edits under Roles are never undone
 *  - creates the first admin (and optional teacher) account if missing
 *  - creates the class catalogue and starter website pages if missing (never overwrites edits)
 */
export async function seedDatabase(
  prisma: PrismaClient,
  options: SeedOptions = {},
): Promise<SeedResult> {
  const log = options.log ?? (() => {});
  const passwords = new PasswordService();
  const result: SeedResult = { permissions: 0, createdAccounts: [] };

  const existingCodes = new Set(
    (await prisma.permission.findMany({ select: { code: true } })).map((p) => p.code),
  );
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

  for (const [roleCode, codes] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const fresh = codes.filter((c) => !existingCodes.has(c));
    if (!fresh.length || !roleIds[roleCode]) continue;
    const perms = await prisma.permission.findMany({
      where: { code: { in: [...fresh] } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: roleIds[roleCode], permissionId: p.id })),
      skipDuplicates: true,
    });
    log(`Default permissions granted to ${roleCode}: ${fresh.join(', ')}`);
  }

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

  await seedClasses(prisma, log);
  await seedWebsitePages(prisma, log);
  await seedOperationDefaults(prisma, log);

  return result;
}

async function seedClasses(prisma: PrismaClient, log: (m: string) => void) {
  const existing = await prisma.class.count();
  if (existing > 0) return;
  await prisma.class.createMany({
    data: DEFAULT_CLASSES.map((name, levelOrder) => ({ name, levelOrder })),
  });
  log(`Classes created: ${DEFAULT_CLASSES.join(', ')}`);
}

/** Starter content is published immediately so the public site works out of the box. */
async function seedWebsitePages(prisma: PrismaClient, log: (m: string) => void) {
  const admin = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: ROLE_CODES.ADMIN } } } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!admin) {
    log('Website pages skipped: they need an admin account as the author.');
    return;
  }
  const created: string[] = [];
  for (const key of PAGE_KEYS) {
    const exists = await prisma.websitePage.findUnique({
      where: { pageKey: key },
      select: { id: true },
    });
    if (exists) continue;
    const page = DEFAULT_PAGES[key];
    // Fail loudly if the starter content ever drifts from the schema.
    const content = PAGE_CONTENT_SCHEMAS[key].parse(page.content) as object;
    await prisma.websitePage.create({
      data: {
        pageKey: key,
        title: page.title,
        contentJson: content,
        publishedContentJson: content,
        publishedAt: new Date(),
        status: 'PUBLISHED',
        updatedBy: admin.id,
      },
    });
    created.push(key);
  }
  if (created.length) log(`Website pages created: ${created.join(', ')}`);
}

/**
 * Phase 7 starter set-up (only when none exists yet): salary components, the TC / Bonafide /
 * Character certificate templates and one student and one staff ID card design. All editable.
 */
async function seedOperationDefaults(prisma: PrismaClient, log: (m: string) => void) {
  if ((await prisma.salaryComponent.count()) === 0) {
    await prisma.salaryComponent.createMany({
      data: DEFAULT_SALARY_COMPONENTS.map((c, sortOrder) => ({ ...c, sortOrder })),
    });
    log(`Salary components created: ${DEFAULT_SALARY_COMPONENTS.length.toString()}`);
  }
  if ((await prisma.idCardTemplate.count()) === 0) {
    const layout = idCardLayoutSchema.parse({});
    await prisma.idCardTemplate.createMany({
      data: [
        { name: 'Student ID card', audience: 'STUDENT', layout },
        {
          name: 'Staff ID card',
          audience: 'STAFF',
          layout: { ...layout, color: '#7a2e2e', showGuardianPhone: false },
        },
      ],
    });
    log('ID card templates created');
  }
  if ((await prisma.certificateTemplate.count()) === 0) {
    const admin = await prisma.user.findFirst({
      where: { roles: { some: { role: { code: ROLE_CODES.ADMIN } } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin)
      return log('Certificate templates skipped: they need an admin account as the author.');
    await prisma.certificateTemplate.createMany({
      data: DEFAULT_CERTIFICATE_TEMPLATES.map((t) => ({ ...t, updatedBy: admin.id })),
    });
    log('Certificate templates created: TC, Bonafide, Character');
  }
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
