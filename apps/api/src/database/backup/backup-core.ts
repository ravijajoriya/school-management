import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface BackupManifest {
  version: 1;
  createdAt: string;
  database: string;
  serverVersion: string;
  pgDumpVersion: string;
  dump: { file: string; bytes: number; sha256: string };
  files: { included: boolean; count: number; bytes: number };
  /** Exact row count per table at backup time, used to verify every restore. */
  tables: Record<string, number>;
}

export interface Conn {
  host: string;
  port: string;
  user: string;
  database: string;
  password: string;
}

/** Splits a postgres URL so the password travels in PGPASSWORD, never on the command line. */
export function parseUrl(url: string): Conn {
  const u = new URL(url);
  return {
    host: u.hostname || 'localhost',
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    database: decodeURIComponent(u.pathname.slice(1)),
    password: decodeURIComponent(u.password),
  };
}

const connArgs = (c: Conn, db = c.database) => ['-h', c.host, '-p', c.port, '-U', c.user, '-d', db];
const pgEnv = (c: Conn) => ({ ...process.env, PGPASSWORD: c.password, PGCONNECT_TIMEOUT: '10' });

/** PG_BIN, then PATH, then Postgres.app. pg_dump must be at least the server's major version. */
export function pgTool(name: 'pg_dump' | 'pg_restore' | 'psql'): string {
  const candidates = [
    process.env.PG_BIN && join(process.env.PG_BIN, name),
    ...(process.env.PATH ?? '').split(':').map((d) => join(d, name)),
    `/Applications/Postgres.app/Contents/Versions/latest/bin/${name}`,
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(p));
  if (!found)
    throw new Error(`${name} not found. Install the PostgreSQL client tools or set PG_BIN.`);
  return found;
}

async function psql(c: Conn, sql: string, db = c.database): Promise<string> {
  const { stdout } = await run(
    pgTool('psql'),
    [...connArgs(c, db), '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    {
      env: pgEnv(c),
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return stdout.trim();
}

/** Exact row counts for every table in the public schema. */
export async function tableCounts(c: Conn, db = c.database): Promise<Record<string, number>> {
  const tables = (
    await psql(
      c,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1",
      db,
    )
  )
    .split('\n')
    .filter(Boolean);
  if (!tables.length) return {};
  const sql = tables.map((t) => `SELECT '${t}', count(*) FROM "${t}"`).join(' UNION ALL ');
  const out = await psql(c, sql, db);
  return Object.fromEntries(
    out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [t, n] = l.split('|');
        return [t, Number(n)];
      }),
  );
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function folderStats(dir: string): Promise<{ count: number; bytes: number }> {
  if (!existsSync(dir)) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    count++;
    bytes += (await stat(join(entry.parentPath, entry.name))).size;
  }
  return { count, bytes };
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);

/** pg_dump (custom format) + a copy of uploaded files + a manifest with row counts and checksum. */
export async function createBackup(opts: {
  databaseUrl: string;
  storageDir: string;
  backupDir: string;
  keep: number;
  log: (m: string) => void;
}): Promise<{ dir: string; manifest: BackupManifest }> {
  const c = parseUrl(opts.databaseUrl);
  const dir = resolve(opts.backupDir, `${c.database}_${stamp()}`);
  await mkdir(dir, { recursive: true });
  const dumpFile = join(dir, 'database.dump');
  opts.log(`Dumping ${c.database} on ${c.host}:${c.port} …`);
  const tables = await tableCounts(c);
  await run(
    pgTool('pg_dump'),
    [...connArgs(c), '--format=custom', '--no-owner', '--no-privileges', '--file', dumpFile],
    {
      env: pgEnv(c),
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const storage = resolve(opts.storageDir);
  const included = existsSync(storage);
  if (included) {
    opts.log(`Copying uploaded files from ${storage} …`);
    await cp(storage, join(dir, 'storage'), { recursive: true });
  }
  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    database: c.database,
    serverVersion: await psql(c, 'SHOW server_version'),
    pgDumpVersion: (await run(pgTool('pg_dump'), ['--version'])).stdout.trim(),
    dump: {
      file: 'database.dump',
      bytes: (await stat(dumpFile)).size,
      sha256: await sha256(dumpFile),
    },
    files: { included, ...(await folderStats(join(dir, 'storage'))) },
    tables,
  };
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await prune(opts.backupDir, c.database, opts.keep, opts.log);
  return { dir, manifest };
}

/** Keeps the newest `keep` backups of this database. */
async function prune(backupDir: string, database: string, keep: number, log: (m: string) => void) {
  const all = (await listBackups(backupDir)).filter((b) => b.database === database);
  for (const old of all.slice(keep)) {
    await rm(old.dir, { recursive: true, force: true });
    log(`Removed old backup ${old.dir}`);
  }
}

export async function listBackups(backupDir: string) {
  const root = resolve(backupDir);
  if (!existsSync(root)) return [];
  const out: { dir: string; database: string; createdAt: string; bytes: number }[] = [];
  for (const name of await readdir(root)) {
    const file = join(root, name, 'manifest.json');
    if (!existsSync(file)) continue;
    const m = JSON.parse(await readFile(file, 'utf8')) as BackupManifest;
    out.push({
      dir: join(root, name),
      database: m.database,
      createdAt: m.createdAt,
      bytes: m.dump.bytes,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readManifest(dir: string): Promise<BackupManifest> {
  return JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as BackupManifest;
}

/** Table-by-table comparison of a database against a manifest. */
export function compareCounts(expected: Record<string, number>, actual: Record<string, number>) {
  const tables = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  const rows = tables.map((t) => ({
    table: t,
    expected: expected[t] ?? null,
    actual: actual[t] ?? null,
  }));
  return { rows, mismatches: rows.filter((r) => r.expected !== r.actual) };
}

/**
 * Restores a backup into `targetUrl`. Refuses a database that already holds data unless `force`.
 * Verifies the checksum before and the row counts after.
 */
export async function restoreBackup(opts: {
  dir: string;
  targetUrl: string;
  force: boolean;
  storageDir?: string;
  log: (m: string) => void;
}) {
  const manifest = await readManifest(opts.dir);
  const dumpFile = join(opts.dir, manifest.dump.file);
  if ((await sha256(dumpFile)) !== manifest.dump.sha256)
    throw new Error('Checksum mismatch: the backup file is damaged.');
  const c = parseUrl(opts.targetUrl);
  const existing = await tableCounts(c);
  const hasData = (existing.users ?? 0) > 0;
  if (hasData && !opts.force)
    throw new Error(
      `${c.database} already contains data. Restore into an empty database, or pass --force to replace it.`,
    );
  opts.log(`Restoring ${manifest.database} (${manifest.createdAt}) into ${c.database} …`);
  await run(
    pgTool('pg_restore'),
    [
      ...connArgs(c),
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      '--single-transaction',
      dumpFile,
    ],
    { env: pgEnv(c), maxBuffer: 16 * 1024 * 1024 },
  );
  const check = compareCounts(manifest.tables, await tableCounts(c));
  if (opts.storageDir && manifest.files.included) {
    const target = resolve(opts.storageDir);
    if (existsSync(target)) await rename(target, `${target}.before-restore-${stamp()}`);
    await cp(join(opts.dir, 'storage'), target, { recursive: true });
    opts.log(`Uploaded files restored to ${target}`);
  }
  return { manifest, ...check };
}

/**
 * The drill: back up, restore into a scratch database, compare every table's row count and the
 * uploaded files, then drop the scratch copy. Nothing in the live database is touched.
 */
export async function restoreDrill(opts: {
  databaseUrl: string;
  storageDir: string;
  backupDir: string;
  keep: number;
  log: (m: string) => void;
}) {
  const started = Date.now();
  const { dir, manifest } = await createBackup(opts);
  const live = parseUrl(opts.databaseUrl);
  const scratch = `${live.database}_restore_drill`;
  await psql(live, `DROP DATABASE IF EXISTS "${scratch}"`, 'postgres');
  await psql(live, `CREATE DATABASE "${scratch}"`, 'postgres');
  const scratchUrl = new URL(opts.databaseUrl);
  scratchUrl.pathname = `/${scratch}`;
  const tmpFiles = join(dir, '.drill-files');
  try {
    const result = await restoreBackup({
      dir,
      targetUrl: scratchUrl.toString(),
      force: false,
      storageDir: tmpFiles,
      log: opts.log,
    });
    const files = await folderStats(tmpFiles);
    const filesOk =
      !manifest.files.included ||
      (files.count === manifest.files.count && files.bytes === manifest.files.bytes);
    const report = {
      at: new Date().toISOString(),
      backup: dir,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      tables: result.rows.length,
      rows: Object.values(manifest.tables).reduce((a, b) => a + b, 0),
      mismatches: result.mismatches,
      files: { expected: manifest.files, restored: files, ok: filesOk },
      ok: result.mismatches.length === 0 && filesOk,
    };
    await writeFile(join(dir, 'drill-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await rm(tmpFiles, { recursive: true, force: true });
    await psql(live, `DROP DATABASE IF EXISTS "${scratch}"`, 'postgres');
  }
}
