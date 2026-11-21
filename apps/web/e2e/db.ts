import { execFileSync } from 'node:child_process';
import { API_DIR, testDatabaseUrl } from './env.ts';

/** Must match apps/api/test/browser-seed.ts. */
export const ACCOUNTS = {
  admin: { fullName: 'E2E Admin', email: 'admin@e2e.local', password: 'Admin-Pass-1' },
  teacher: { fullName: 'E2E Teacher', email: 'teacher@e2e.local', password: 'Teacher-Pass-1' },
} as const;

/** Empties the test database and seeds the known accounts. */
export function resetDatabase(opts: { adminPending?: boolean } = {}) {
  execFileSync(
    'pnpm',
    ['exec', 'tsx', 'test/browser-seed.ts', ...(opts.adminPending ? ['--admin-pending'] : [])],
    { cwd: API_DIR, stdio: 'pipe', env: { ...process.env, DATABASE_URL: testDatabaseUrl() } },
  );
}
