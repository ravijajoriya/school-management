/**
 * CLI entry point for the reference-data seed.
 *   Development:  pnpm --filter @school/api db:seed
 *   Production:   pnpm --filter @school/api db:seed:prod   (after `nest build`)
 *
 * Reads DATABASE_URL and the optional SEED_* variables from the environment / .env.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { seedDatabase, type SeedAccount } from './seed.js';

function account(prefix: 'ADMIN' | 'TEACHER', defaultName: string): SeedAccount | undefined {
  const email = process.env[`SEED_${prefix}_EMAIL`];
  const phone = process.env[`SEED_${prefix}_PHONE`];
  if (!email && !phone) return undefined;
  return {
    fullName: process.env[`SEED_${prefix}_NAME`] || defaultName,
    email,
    phone,
    password: process.env[`SEED_${prefix}_PASSWORD`] || undefined,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const result = await seedDatabase(prisma, {
      admin: account('ADMIN', 'School Administrator'),
      teacher: account('TEACHER', 'Demo Teacher'),
      log: (m) => console.log(`• ${m}`),
    });
    for (const acc of result.createdAccounts) {
      console.log(`• Created ${acc.role} account: ${acc.identifier}`);
      if (acc.temporaryPassword) {
        console.log(`  Temporary password (shown once): ${acc.temporaryPassword}`);
      }
      console.log('  A password change is required at first login.');
    }
    console.log('Seed complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
