/**
 * Resets the TEST database for browser (Playwright) tests and seeds known accounts.
 *   tsx test/browser-seed.ts [--admin-pending]
 * --admin-pending keeps the admin's "must change password" flag set (first-login flow).
 * Refuses to run unless DATABASE_URL points at a database whose name ends in `_test`.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDatabase } from '../src/database/seed/seed.js';

export const BROWSER_ACCOUNTS = {
  admin: { fullName: 'E2E Admin', email: 'admin@e2e.local', password: 'Admin-Pass-1' },
  teacher: { fullName: 'E2E Teacher', email: 'teacher@e2e.local', password: 'Teacher-Pass-1' },
} as const;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to reset a non-test database: ${url}`);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await prisma.$transaction([
      prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" DISABLE TRIGGER USER'),
      prisma.$executeRawUnsafe(
        'TRUNCATE "audit_logs", "refresh_tokens", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE',
      ),
      prisma.$executeRawUnsafe('ALTER TABLE "audit_logs" ENABLE TRIGGER USER'),
    ]);
    await seedDatabase(prisma, {
      admin: BROWSER_ACCOUNTS.admin,
      teacher: BROWSER_ACCOUNTS.teacher,
    });
    const adminPending = process.argv.includes('--admin-pending');
    await prisma.user.updateMany({
      where: adminPending ? { email: { not: BROWSER_ACCOUNTS.admin.email } } : {},
      data: { mustChangePassword: false },
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
