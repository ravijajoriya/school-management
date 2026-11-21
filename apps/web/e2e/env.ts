import { config as loadEnv } from 'dotenv';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_DIR = fileURLToPath(new URL('../../api', import.meta.url));
export const API_PORT = 3100;
export const WEB_PORT = 5174;

/**
 * Browser tests use the same dedicated test database as the API e2e tests:
 * TEST_DATABASE_URL, or DATABASE_URL from apps/api/.env with `_test` appended to the db name.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base =
    process.env.DATABASE_URL ??
    loadEnv({ path: `${API_DIR}/.env`, quiet: true }).parsed?.DATABASE_URL;
  if (!base) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL in apps/api/.env)');
  const url = new URL(base);
  if (!url.pathname.endsWith('_test')) url.pathname = `${url.pathname}_test`;
  return url.toString();
}

/** Environment for the API process started by Playwright. */
export function apiTestEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: String(API_PORT),
    DATABASE_URL: testDatabaseUrl(),
    JWT_ACCESS_SECRET: 'browser-e2e-secret-that-is-at-least-32-characters',
    CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
    COOKIE_SECURE: 'false',
    LOG_LEVEL: 'fatal',
    STORAGE_DIR: join(tmpdir(), 'school-management-browser-e2e-storage'),
  };
}
