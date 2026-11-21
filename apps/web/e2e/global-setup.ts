import { execFileSync } from 'node:child_process';
import { API_DIR, testDatabaseUrl } from './env.ts';

/** Applies migrations to the test database once before the browser tests start. */
export default function globalSetup() {
  const url = testDatabaseUrl();
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run browser tests against a non-test database: ${url}`);
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: API_DIR,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
