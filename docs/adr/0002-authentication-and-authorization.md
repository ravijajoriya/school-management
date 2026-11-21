# ADR 0002 — Authentication & authorization (Phase 1)

Status: accepted · Date: 2026-11-21

## Authentication

| Decision                                                           | Detail / reason                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing: **Argon2id** via Node's built-in `crypto.argon2` | OWASP parameters (m=19 MiB, t=2, p=1), stored as standard PHC strings. No native add-on to compile. Hashes with weaker parameters are upgraded on next login.                                                                                                         |
| Password policy                                                    | ≥ 8 characters, at least one letter and one number (`passwordSchema` in `@school/shared`).                                                                                                                                                                            |
| Access token                                                       | HS256 JWT (`jose`), 15 min, claims `sub` (user) + `sid` (session). Held **in memory only** by the web app — never in localStorage.                                                                                                                                    |
| Refresh token                                                      | 32 random bytes, 7-day lifetime, stored **only as a SHA-256 hash**. Sent as cookie `sm_rt`: `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` in production.                                                                                               |
| Rotation + reuse detection                                         | Every refresh issues a new token in the same family. Re-using a rotated token revokes the whole family (session) and writes `auth.refresh_token_reused`. A 30 s grace window treats near-simultaneous refreshes from two tabs as a race, not theft.                   |
| Immediate revocation                                               | Each request checks that the user is `ACTIVE`, the session (token family) is still alive, and the token was issued after `password_changed_at`. Logout, deactivation, admin password reset and password change take effect on the next request, not after 15 minutes. |
| No email/SMS (out of scope)                                        | "Forgot password" = an admin resets it: a one-time temporary password is shown once and the user must change it at next login (`must_change_password`). The same flag forces first-login password setup.                                                              |
| Login identifier                                                   | Email (case-insensitive, stored lower-case) **or** phone (spaces/dashes stripped). Unknown identifier and wrong password return the same message and similar timing.                                                                                                  |
| Rate limits                                                        | Login and change-password: 5/min/IP. Refresh: 30/min/IP. Everything else: 100/min/IP. `TRUST_PROXY` must be set correctly behind a load balancer.                                                                                                                     |

## Authorization

| Decision                       | Detail / reason                                                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deny by default**            | A single global `AccessGuard`. A route is unreachable unless it declares `@Public()`, `@Authenticated()` or `@RequirePermissions(...)`. Missing declarations fail closed and are logged. |
| Permissions loaded per request | Role/permission changes apply on the user's next request; nothing is cached in the token.                                                                                                |
| ADMIN                          | Always holds every permission (including permissions added in later phases); its permission set cannot be edited.                                                                        |
| Custom roles                   | Admins can create sub-roles (e.g. Accountant) and pick their permissions, as the developer flow allows.                                                                                  |
| Privilege-escalation guard     | Without `roles.manage`, a user may only assign roles — and manage users — whose permissions they already hold, and can never grant or touch ADMIN.                                       |
| Lock-out protection            | Nobody can deactivate/lock themselves or remove their own ADMIN role; at least one active Admin must always remain.                                                                      |
| Pending password change        | Users with `must_change_password` can only call `/auth/me`, `/auth/change-password` and logout.                                                                                          |
| Teacher scope                  | Phase 1 teachers have no admin permissions. Class/subject scoping comes from `teacher_assignments` in Phase 3.                                                                           |

## Audit events (append-only `audit_logs`)

`auth.login_succeeded`, `auth.login_failed` (identifier masked), `auth.logout`, `auth.refresh_token_reused`,
`auth.password_changed`, `user.created`, `user.updated`, `user.roles_changed`, `user.password_reset`,
`role.created`, `role.updated`, `role.deleted`, `role.permissions_changed`. Before/after snapshots never
contain password hashes or tokens. Privileged changes write their audit row in the same transaction.

## Seeding

`pnpm --filter @school/api db:seed` (dev) / `db:seed:prod` (after build) is idempotent: syncs
permissions from `@school/shared`, the ADMIN and TEACHER system roles, and creates the first admin from
`SEED_ADMIN_*` only if no admin exists. Run it on every deployment.
