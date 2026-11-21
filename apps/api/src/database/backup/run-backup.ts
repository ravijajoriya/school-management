/**
 * Backup CLI (see docs/runbooks/backup-restore.md).
 *   pnpm backup                           database dump + uploaded files + manifest → BACKUP_DIR
 *   pnpm backup:list                      backups in BACKUP_DIR, newest first
 *   pnpm backup:drill                     back up, restore into a scratch database, verify, clean up
 *   pnpm restore <backup-dir> [--target <postgres-url>] [--with-files] [--force]
 */
import 'dotenv/config';
import {
  compareCounts,
  createBackup,
  listBackups,
  restoreBackup,
  restoreDrill,
} from './backup-core.js';

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`${k} is not set`);
  return v;
};
const log = (m: string) => console.log(`• ${m}`);
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const common = {
    databaseUrl: env('DATABASE_URL'),
    storageDir: env('STORAGE_DIR', './storage'),
    backupDir: env('BACKUP_DIR', './backups'),
    keep: Number(env('BACKUP_KEEP', '14')),
    log,
  };

  switch (command) {
    case 'backup': {
      const { dir, manifest } = await createBackup(common);
      const rows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
      console.log(`\nBackup written to ${dir}`);
      console.log(
        `  ${Object.keys(manifest.tables).length} tables, ${rows} rows, dump ${mb(manifest.dump.bytes)}`,
      );
      console.log(`  ${manifest.files.count} uploaded files (${mb(manifest.files.bytes)})`);
      break;
    }
    case 'list': {
      const all = await listBackups(common.backupDir);
      if (!all.length) console.log('No backups yet.');
      for (const b of all)
        console.log(
          `${b.createdAt}  ${b.database.padEnd(28)} ${mb(b.bytes).padStart(9)}  ${b.dir}`,
        );
      break;
    }
    case 'restore': {
      const dir = args.find((a) => !a.startsWith('--') && a !== option('--target'));
      if (!dir)
        throw new Error(
          'Usage: pnpm restore <backup-dir> [--target <postgres-url>] [--with-files] [--force]',
        );
      if (process.env.NODE_ENV === 'production' && !flag('--force'))
        throw new Error('Refusing to restore with NODE_ENV=production without --force.');
      const result = await restoreBackup({
        dir,
        targetUrl: option('--target') ?? common.databaseUrl,
        force: flag('--force'),
        storageDir: flag('--with-files') ? common.storageDir : undefined,
        log,
      });
      report(result.mismatches);
      if (result.mismatches.length) process.exitCode = 1;
      break;
    }
    case 'drill': {
      const r = await restoreDrill(common);
      console.log(`\nRestore drill ${r.ok ? 'PASSED' : 'FAILED'} in ${r.seconds}s`);
      console.log(
        `  ${r.tables} tables and ${r.rows} rows compared; files ${r.files.ok ? 'match' : 'DO NOT match'}`,
      );
      report(r.mismatches);
      console.log(`  Report: ${r.backup}/drill-report.json`);
      if (!r.ok) process.exitCode = 1;
      break;
    }
    default:
      console.log('Usage: run-backup.ts <backup|list|restore|drill>');
      process.exitCode = 1;
  }
}

function report(mismatches: ReturnType<typeof compareCounts>['mismatches']) {
  if (!mismatches.length) return console.log('  Every table has the expected number of rows.');
  console.log('  Row count differences:');
  for (const m of mismatches)
    console.log(`    ${m.table}: expected ${m.expected ?? '—'}, found ${m.actual ?? '—'}`);
}

main().catch((e: unknown) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
