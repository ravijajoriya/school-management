/**
 * CLI for demo data (development only).
 *   pnpm demo:seed     add a realistic demo school to the database in DATABASE_URL
 *   pnpm demo:status   show whether demo data is present
 *   pnpm demo:clear    remove the demo data again (your own data is kept)
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { activeDemoManifest, clearDemoData, seedDemoData } from './demo-data.js';

async function main() {
  const command = process.argv[2];
  if (!['seed', 'clear', 'status'].includes(command ?? '')) {
    console.log('Usage: tsx src/database/demo/run-demo.ts <seed|clear|status>');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo data is for development only and is disabled when NODE_ENV=production.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = new URL(url);
  console.log(`Database: ${db.pathname.slice(1)} on ${db.hostname}:${db.port || 5432}\n`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    if (command === 'seed') {
      const { counts, logins } = await seedDemoData(prisma, (m) => console.log(`• ${m}`));
      console.log('\nDemo data added:');
      for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);
      console.log('\nDemo logins:');
      for (const l of logins)
        console.log(`  ${l.email.padEnd(20)} ${l.password}  ${l.role} — ${l.note}`);
      console.log('\nRemove it all again with:  pnpm demo:clear');
    } else if (command === 'clear') {
      const result = await clearDemoData(prisma, {
        storageDir: process.env.STORAGE_DIR ?? './storage',
        log: (m) => console.log(`• ${m}`),
      });
      if (!result.cleared) {
        console.log('No demo data found — nothing to remove.');
        return;
      }
      console.log('Demo data removed:');
      for (const [k, v] of Object.entries(result.removed)) console.log(`  ${k.padEnd(20)} ${v}`);
      if (result.kept.length) {
        console.log('\nKept on purpose:');
        for (const k of result.kept) console.log(`  - ${k}`);
      }
    } else {
      const m = await activeDemoManifest(prisma);
      if (!m) {
        console.log('No demo data present. Add it with:  pnpm demo:seed');
        return;
      }
      const [students, staff, sections] = await Promise.all([
        prisma.student.count({ where: { id: { in: m.studentIds } } }),
        prisma.employee.count({ where: { id: { in: m.employeeIds } } }),
        prisma.section.count({ where: { id: { in: m.sectionIds } } }),
      ]);
      console.log(`Demo data present (added ${new Date(m.seededAt).toLocaleString('en-IN')}):`);
      console.log(`  students ${students} · staff ${staff} · sections ${sections}`);
      console.log('\nRemove it with:  pnpm demo:clear');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
