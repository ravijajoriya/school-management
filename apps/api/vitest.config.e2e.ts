import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

/**
 * End-to-end tests run against a dedicated database, never the development one.
 * TEST_DATABASE_URL wins; otherwise DATABASE_URL from .env is reused with a `_test` suffix
 * on the database name (e.g. school_management -> school_management_test).
 */
function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? loadEnv({ quiet: true }).parsed?.DATABASE_URL;
  if (!base) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL in .env) for e2e tests');
  const url = new URL(base);
  if (!url.pathname.endsWith('_test')) url.pathname = `${url.pathname}_test`;
  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Test files share one database: run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'e2e-test-secret-that-is-at-least-32-characters-long',
      ACCESS_TOKEN_TTL_SECONDS: '900',
      REFRESH_TOKEN_TTL_DAYS: '7',
      COOKIE_SECURE: 'false',
      LOG_LEVEL: 'fatal',
    },
  },
});
