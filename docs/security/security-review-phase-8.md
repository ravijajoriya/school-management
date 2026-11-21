# Security review: Phase 8

Date: 2026-11-22 · Scope: API (NestJS), web app (React), database (PostgreSQL), tooling · Reviewer: development team, with automated checks.

**Result:** no critical or high findings are open.

- One moderate dependency advisory has been fixed.
- Two hardening changes were made.
- Low-risk items accepted for now are listed at the end, with the reasons.

## How access is enforced

| Check                                                      | Result | Evidence                                                                                                                                               |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deny by default: a route without an access rule is refused | Pass   | `AccessGuard` fails closed. `test/security.e2e-spec.ts` checks that every route declares `@Public`, `@Authenticated` or `@RequirePermissions`.         |
| Public surface is minimal                                  | Pass   | Only login, refresh, logout, health checks, the enquiry and contact forms, and read-only website GETs are public. The test fails if the list changes.  |
| Every protected route needs a valid session                | Pass   | The same test calls more than 200 protected routes without a token: all return 401. Tampered tokens and Basic auth are rejected.                       |
| Permission checks on the server, not just hidden buttons   | Pass   | `@RequirePermissions` on routes, plus `actor.permissions.has()` inside services. Covered by e2e tests in every phase (403 cases).                      |
| Role escalation                                            | Pass   | A user can only grant permissions they hold themselves (`exceedsActor`, Phases 1 and 4). Covered by `access-control.e2e-spec.ts`.                      |
| Teacher scope                                              | Pass   | `TeacherScopeService` limits teachers to their own sections: attendance, marks, rosters, meetings, results. Tested per phase (403 for other sections). |
| Sessions                                                   | Pass   | Short-lived JWT (15 min), rotating refresh tokens in an httpOnly cookie, reuse detection, sessions revoked on password change and deactivation.        |
| Passwords                                                  | Pass   | Argon2id (Node crypto), forced change at first sign-in, 5 login attempts per minute per IP.                                                            |

## Data protection

| Check                       | Result     | Evidence                                                                                                                                                                                                                              |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL injection               | Pass       | Prisma throughout. Raw SQL uses tagged templates (parameterised). The only `executeRawUnsafe` calls are two constant `SET LOCAL` statements in the demo tool.                                                                         |
| XSS                         | Pass       | React escapes all output. No `dangerouslySetInnerHTML`. Certificate templates are plain text with placeholders, never HTML. CMS content is structured JSON.                                                                           |
| Spreadsheet (CSV) injection | Pass (new) | Exports prefix text starting with `= + - @` with `'`. Unit-tested in `export-format.spec.ts`.                                                                                                                                         |
| Uploads                     | Pass       | Size limits per endpoint. Documents and photos are checked by file signature (not by extension) and stored privately, served only through permission-checked endpoints with `no-store`. Imports accept only .csv or .xlsx up to 5 MB. |
| Protected records           | Pass       | Database triggers make payments, receipts, adjustments, final marks, approved or paid payroll, issued certificates and the audit log append-only or immutable.                                                                        |
| Audit trail                 | Pass       | Every change and every export or import is in `audit_logs`, which can't be updated or deleted (trigger).                                                                                                                              |
| Exports                     | Pass (new) | Allow-listed reports only, checked per report permission, audited, rate-limited, 20,000-row cap.                                                                                                                                      |
| Backups                     | Pass (new) | Checksummed. The password is never on the command line. `backups/` is git-ignored. Restore refuses a non-empty database without `--force`.                                                                                            |

## Transport and configuration

| Check             | Result | Evidence                                                                                                                                   |
| ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Security headers  | Pass   | helmet: HSTS, `nosniff`, frame options, no `x-powered-by`. Asserted in the security test.                                                  |
| CORS              | Pass   | Allow-list from `CORS_ORIGINS`; unknown origins are not echoed (tested).                                                                   |
| Production config | Fixed  | The API now **refuses to start** in production if `COOKIE_SECURE` isn't `true` or any CORS origin isn't `https://` (`env.schema.spec.ts`). |
| Secrets           | Pass   | Validated at startup (JWT secret of 32 characters or more). `.env` is never committed (only `.env.example`). No secrets in the repository. |
| Rate limits       | Pass   | Global 100 requests per minute per IP; login 5 a minute; public forms 5 per 10 minutes; exports 30 a minute; imports 20 a minute.          |
| API docs          | Pass   | Swagger is disabled in production.                                                                                                         |
| Error responses   | Pass   | A single exception filter: no stack traces or SQL in responses; request id for support.                                                    |

## Dependencies

| Finding                                                                                          | Severity | Action                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `uuid` below 11.1.1 via `exceljs` (GHSA-w5hq-g745-h8pq: missing buffer bounds check in v3/v5/v6) | Moderate | Fixed with a pnpm override to `^11.1.1`. exceljs only uses `v4()`, so it wasn't exploitable here. `pnpm audit --prod` is now clean. |

## Accepted for now (low risk)

| Item                                                                                          | Reason                                                                                                       | Revisit                                      |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| An .xlsx is unzipped in memory before the row limit applies                                   | Only users with `data_import.run` can upload, files are capped at 5 MB, and imports are rare and supervised. | If imports are opened to more roles.         |
| Rate limits are kept in memory per API instance                                               | A single API instance is planned.                                                                            | Phase 9, if more than one instance runs.     |
| No multi-factor authentication                                                                | Not in scope. Admin accounts are few, have strong passwords and short sessions.                              | After go-live, with the school.              |
| Student search needs `students.read` on screens that pick a student (transport, certificates) | Conservative: it never shows students to roles that shouldn't see them.                                      | If a role needs it without full read access. |

## Re-running the checks

```bash
pnpm --filter @school/api test:e2e   # includes security.e2e-spec.ts
pnpm audit --prod
```
