# RBSE School Website & Management System

Public Website + Admin Portal + Teacher Portal for a single-branch RBSE school (Nursery – Class 12).
Built phase by phase per `RBSE_School_Management_Phase_by_Phase_Developer_Flow.pdf`.

## Stack

| Layer    | Tech                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| Runtime  | Node.js 26.13 LTS, pnpm 12 workspaces, Turborepo                                    |
| API      | NestJS 12 (ESM), Prisma 7.10 + `@prisma/adapter-pg`, Zod 4, Pino, Swagger, Terminus |
| Database | PostgreSQL 18                                                                       |
| Web      | React 19, Vite 8, React Router 8, TanStack Query 5, React Hook Form, Tailwind CSS 4 |
| Quality  | TypeScript (strict), oxlint, Vitest, Prettier                                       |

## Layout

```
apps/api         NestJS API  (prisma/schema/*.prisma = one schema file per domain)
apps/web         React app   (public site, /admin, /teacher route groups)
packages/shared  Permission codes, role codes and Zod schemas shared by API and web
docs/            design mock-ups, ADRs, ERD, phase notes
```

## Getting started

```bash
nvm use                                   # Node 26.13 (see .nvmrc)
pnpm install                              # also generates the Prisma client
cp apps/api/.env.example apps/api/.env    # then set DATABASE_URL, JWT_ACCESS_SECRET, SEED_ADMIN_*
pnpm --filter @school/api prisma:migrate  # apply migrations to your local DB
pnpm --filter @school/api db:seed         # roles, permissions, classes, starter website pages, first admin
pnpm dev                                  # API on :3000, web on :5173
```

- Web: http://localhost:5173 — public website; staff login at `/login`, portals at `/admin` and `/teacher`
- Uploaded images are stored in `apps/api/storage/` locally (`STORAGE_DIR`; git-ignored)
- API docs (Swagger): http://localhost:3000/api/v1/docs
- Health: `/api/v1/health/live`, `/api/v1/health/ready`

The seed creates accounts only if they don't exist and prints each temporary password **once**;
the user must change it at first sign-in. Forgot a password? An admin resets it from **Admin → Users**.

## Tests

| Command                              | What it runs                                                   |
| ------------------------------------ | -------------------------------------------------------------- |
| `pnpm test`                          | API unit tests + web component tests (Vitest, jsdom)           |
| `pnpm test:e2e`                      | API end-to-end tests, then browser tests (one after the other) |
| `pnpm --filter @school/api test:e2e` | API end-to-end tests only (Supertest against a real database)  |
| `pnpm --filter @school/web test:e2e` | Browser tests only (Playwright + Chromium)                     |

End-to-end tests use a **separate database**: `TEST_DATABASE_URL`, or your `DATABASE_URL` with `_test`
appended to the database name (create it once: `createdb school_management_test`). Migrations are
applied automatically, and the tests refuse to run against a database whose name doesn't end in
`_test`. Browser tests start their own API (port 3100) and web server (port 5174), so they can run
while `pnpm dev` is running. First time only: `pnpm --filter @school/web exec playwright install chromium`.

**CI** (`.github/workflows/ci.yml`) runs all of the above on every pull request and on `main`,
against PostgreSQL 18.

## Docs

- `docs/adr/` — design decisions (0001 baseline, 0002 authentication & authorization, 0003 website/CMS/admissions, 0004 academics/staff/students, 0005 attendance & leave)
- `docs/erd/` — entity-relationship diagrams per phase
- `docs/design/` — approved UI designs

## Common commands

| Command                                       | What it does                             |
| --------------------------------------------- | ---------------------------------------- |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Run across all packages                  |
| `pnpm test` / `pnpm test:e2e`                 | Unit tests / API end-to-end tests        |
| `pnpm --filter @school/api db:seed`           | Sync roles & permissions, create admin   |
| `pnpm --filter @school/api prisma:migrate`    | Create/apply a migration in development  |
| `pnpm --filter @school/api prisma:deploy`     | Apply migrations on staging / production |
| `pnpm --filter @school/api prisma:studio`     | Browse the database                      |

## Database rules

- Never edit a migration that has been applied outside your machine — add a new one.
- Constraints Prisma can't express (CHECKs, triggers, partial and expression indexes, sequences) are
  appended by hand to the generated `migration.sql` — create with `prisma migrate dev --create-only`,
  edit, then apply. Each one is noted with a `/// SQL:` comment on the field in `prisma/schema`.
- If `migrate dev` refuses to run non-interactively (e.g. a data-loss warning), generate the SQL with
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` into a new
  `prisma/migrations/<timestamp>_<name>/migration.sql`, add the hand-written SQL, then `prisma:deploy`.
- Uploaded student/staff documents and photos are private: stored under `private/` in `STORAGE_DIR`
  and served only through permission-checked API endpoints (never a public URL).
- No cascade deletes on historical records (students, enrolments, attendance, marks, payments, receipts).
