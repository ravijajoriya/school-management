# Runbook: backup and restore

Who: the person running the server. Needs the PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) at the same major version as the server, or newer. Run the commands from the repository root, with the API's `.env` in place.

| Setting        | Default                     | Meaning                                                     |
| -------------- | --------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL` | from `.env`                 | Database to back up (or restore into, unless `--target`)    |
| `STORAGE_DIR`  | `./storage`                 | Uploaded documents and photos                               |
| `BACKUP_DIR`   | `./backups` (in `apps/api`) | Where backups are written                                   |
| `BACKUP_KEEP`  | `14`                        | Newest backups kept per database; older ones are deleted    |
| `PG_BIN`       | (PATH)                      | Folder holding the PostgreSQL tools, if they're not on PATH |

Backups contain personal data (students, guardians, staff, fees). Keep them encrypted, off the web server's public folders, and never in git (`backups/` is git-ignored).

## Take a backup

```bash
pnpm backup
```

This creates `backups/<database>_<date>_<time>/` containing:

- `database.dump`: the whole database (`pg_dump` custom format)
- `storage/`: a copy of every uploaded file
- `manifest.json`: when and from where, the SHA-256 of the dump, file count and size, and the **exact row count of every table**

`pnpm backup:list` shows the backups, newest first.

**Production (Phase 9):** run `pnpm backup` every night from cron or a systemd timer. Copy each backup folder to storage that is off the server and encrypted. Keep 14 daily backups plus one per month for a year.

## Test that backups work (the drill)

```bash
pnpm backup:drill
```

The drill:

1. Takes a fresh backup.
2. Restores it into a scratch database, `<database>_restore_drill`.
3. Compares every table's row count with the manifest, and checks the restored files.
4. Writes `drill-report.json` next to the backup.
5. Drops the scratch database.

The live database is never changed. The command fails (exit code 1) if anything differs.

Run the drill **monthly** and after any database upgrade, and record the result in the go-live log.

Last drill: 2026-11-22, development database. **PASSED**: 61 tables, 3,205 rows, files matched, 1.6 s.

## Restore

> Restoring replaces data. Stop the API first (so nobody writes during the restore) and take a backup of the current state if it still works.

1. Choose the backup: `pnpm backup:list`.
2. Restore. Pick the line that matches your situation:

   ```bash
   # Into a NEW, empty database (preferred: then point DATABASE_URL at it):
   createdb school_management_restored
   pnpm restore apps/api/backups/<folder> --target postgresql://user:pass@host:5432/school_management_restored --with-files

   # Over the existing database (only when it is broken or must be rolled back):
   pnpm restore apps/api/backups/<folder> --force --with-files
   ```

   - The restore checks the dump's checksum first and runs in a single transaction: it either fully succeeds or changes nothing.
   - It then compares every table's row count with the manifest and prints any difference.
   - `--with-files` puts the uploaded files back into `STORAGE_DIR`. The current folder is kept as `storage.before-restore-<time>`.
   - It refuses to restore over a database that already holds data unless you pass `--force`, and with `NODE_ENV=production` it always requires `--force`.

3. Start the API. Then check:
   - Sign in.
   - Open a student with documents.
   - Open today's fee collection.
   - Open the audit log.

## If something goes wrong

| Symptom                             | Fix                                                                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg_dump not found`                 | Install the PostgreSQL client tools, or set `PG_BIN` to their folder (Postgres.app: `/Applications/Postgres.app/Contents/Versions/latest/bin`). |
| `server version mismatch`           | Use client tools of the server's major version or newer.                                                                                        |
| `Checksum mismatch`                 | The backup file is damaged. Use an older backup and investigate the storage.                                                                    |
| `already contains data`             | You are restoring over a live database. Use `--target` with an empty database, or `--force` deliberately.                                       |
| Row count differences after restore | Don't use the restored database. Keep both, and investigate before retrying with another backup.                                                |
