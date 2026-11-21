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
pnpm --filter @school/api db:seed         # roles, permissions, first admin (prints a temporary password)
pnpm dev                                  # API on :3000, web on :5173
```

- Web: http://localhost:5173 — staff login at `/login`, portals at `/admin` and `/teacher`
- API docs (Swagger): http://localhost:3000/api/v1/docs
- Health: `/api/v1/health/live`, `/api/v1/health/ready`

The seed creates accounts only if they don't exist and prints each temporary password **once**;
the user must change it at first sign-in. Forgot a password? An admin resets it from **Admin → Users**.

## Tests

- `pnpm test` — unit tests.
- `pnpm test:e2e` — API end-to-end tests against a separate database. It uses `TEST_DATABASE_URL`,
  or your `DATABASE_URL` with `_test` appended to the database name (create it once:
  `createdb school_management_test`). Migrations are applied automatically; the tests refuse to run
  against a database whose name doesn't end in `_test`.

## Docs

- `docs/adr/` — design decisions (0001 baseline, 0002 authentication & authorization)
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
- Constraints Prisma can't express (CHECKs, triggers, partial indexes) are appended by hand to the
  generated `migration.sql` — create with `prisma migrate dev --create-only`, edit, then apply.
- No cascade deletes on historical records (students, enrolments, attendance, marks, payments, receipts).
