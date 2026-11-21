# ADR 0009: Phase 8 (reports and hardening)

Status: accepted · Date: 2026-11-22

Migration: `024_performance_indexes`. Phase 8 adds no tables.

## Decisions taken with the project owner

| Question       | Decision                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export formats | **CSV and Excel (.xlsx).** PDF is not generated on the server; receipts, report cards, payslips, certificates, ID cards and registers already have print layouts that the browser saves as PDF. |
| Data migration | **Import tool** for students with guardians and class, staff, and opening fee balances. Every import has a dry run and a reconciliation.                                                        |
| Backups        | **Scripts plus a tested drill.** Scheduling and off-site copies are set up on the real server in Phase 9.                                                                                       |

## Dashboard and reports

- `GET /reports/overview` returns the whole admin dashboard in one request. The dashboard used to make five or more.
  - Each section is computed only if the user holds its permission; otherwise it is `null`.
  - It reuses the same services as the detailed screens, so the numbers always agree.
- **New report: class strength.** Per section it gives boys, girls and other, total against capacity, joiners and leavers this year, and transport riders.
- **Reports & Exports** (Admin → Administration) shows class strength and every download the user may make in one place.

## Exports

- There are 15 approved exports (`REPORT_EXPORTS` in `@school/shared`). Each names the permission it needs, which is the same permission as the screen it comes from. Anything not on the list can't be exported.
- `GET /reports/exports/:key?format=csv|xlsx&…`:
  - Validates the report's own parameters and checks the permission on the server.
  - Is rate-limited to 30 a minute per user.
  - Caps an export at 20,000 rows.
  - Writes an audit entry (`report.exported`) recording who exported, which report, the format, the filters and the row count. Every file that leaves the system is traceable.
- **Files reuse the screen's service** (students list, fee dues, results and so on), so a download always matches what the user sees.
- **Formula injection is blocked.** Spreadsheet apps run cells that start with `= + - @` as formulas, so text such as names and notes is prefixed with `'`. Numbers are written as real numbers.
- **CSV files open correctly in Excel:** they carry a UTF-8 byte-order mark, so ₹ and Hindi names display properly.
- **Excel files are ready to use:** a title, filter notes, a bold frozen header row and rupee-formatted columns.

## Data import

- **Imports:**
  - **Students:** guardians and enrolment in the current year's section.
  - **Staff.**
  - **Opening fee balances:** each becomes a one-off due under a new `OPENING` fee head.
- **Files:** .xlsx or .csv (5 MB, 5,000 rows). Headers are matched loosely ("Guardian Phone" = `guardian_phone`). Dates may be DD/MM/YYYY or YYYY-MM-DD. Gender may be M or F.
- **Same rules as the screens:** every row is validated with the same Zod schemas as data typed in by hand.
- **Checked against the file and the database before anything is saved:**
  - Unknown class or section.
  - Duplicate admission numbers or roll numbers.
  - Codes that already exist.
  - A student who already has an opening balance (so importing a file twice is refused).
- **Dry run first:** "Check file" saves nothing and lists every problem with its row and column.
- **All or nothing:** an import commits in one transaction. If any row is wrong, nothing is saved.
- **Reconciliation:** the result compares file totals with what is now in the database. Examples: students per section, number of guardians, rupee total of opening balances.
- **Audit:** one `data_import.committed` audit entry per import (type, file, rows, created). This entry also drives "Past imports".
- **Permissions:** the new `data_import.run`, plus the permission behind the data: `students.manage`, `employees.manage` or `fees.configure`.

## Performance

- **Migration 024** adds eight indexes:
  - Foreign keys that queries or triggers actually filter on: the class teacher in teacher scope, fee head, grading scale (the grade-band trigger), salary component, route stop, timetable and assignment subject.
  - Audit logs by action and time.
- **Not indexed on purpose:** "who did it" foreign keys pointing at users are never filtered on, and users are never deleted, so indexing them would only slow down writes.
- **Performance test:** `test/performance.e2e-spec.ts` loads the full demo school and times the 16 heaviest screens and exports. The budget is 1.5 s each; local timings are 5–26 ms. Scaling about 30 times to a 1,500-student school stays well under a second.

## Security review

See [security review (Phase 8)](../security/security-review-phase-8.md). Changes made:

- **Production settings:** the API refuses to start in production unless `COOKIE_SECURE=true` and every `CORS_ORIGINS` entry is `https://`.
- **Dependency fix:** an override fixes `uuid` (GHSA-w5hq-g745-h8pq, pulled in by exceljs). `pnpm audit --prod` is clean.
- **New automated security test:**
  - Every route must declare an access rule.
  - The public routes must match a reviewed list.
  - Every protected route (more than 200) must return 401 without a token.
  - Security headers and CORS are checked.
- **Rate limits:** added on exports and imports.

## Backup and restore

- **Commands:**
  - `pnpm backup`: `pg_dump` in custom format, plus a copy of the uploaded files. A `manifest.json` records the exact row count of every table and the dump's SHA-256. The newest `BACKUP_KEEP` backups (default 14) are kept.
  - `pnpm restore <dir>`: checks the checksum, refuses a database that already holds data unless `--force`, restores in one transaction and compares every table's row count with the manifest. `--with-files` puts the uploads back.
  - `pnpm backup:drill`: backs up, restores into a scratch `<db>_restore_drill` database, compares every table and the files, writes `drill-report.json`, then drops the scratch database. The live database is never touched.
- **Database password:** passed in `PGPASSWORD`, never on the command line.
- **Backup files:** `backups/` is git-ignored because backups contain personal data.
- **First drill on the development database:** passed. 61 tables and 3,205 rows matched, the files matched, and it took 1.6 s.

Runbook: [backup-restore.md](../runbooks/backup-restore.md). Import runbook: [data-migration.md](../runbooks/data-migration.md). UAT script: [uat-checklist.md](../uat/uat-checklist.md).
