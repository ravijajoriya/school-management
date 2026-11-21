import { execFileSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

/** Brings the test database schema up to date once before all e2e test files run. */
export default function setup(project: TestProject) {
  // Global setup runs before `test.env` is applied to process.env, so read it from the config.
  const url = project.config.env?.DATABASE_URL as string | undefined;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against a non-test database: ${url}`);
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
