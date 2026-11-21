import { describe, expect, it } from 'vitest';
import { envSchema } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/school',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
};

describe('environment validation', () => {
  it('accepts development defaults', () => {
    expect(envSchema.parse(base)).toMatchObject({ NODE_ENV: 'development', COOKIE_SECURE: false });
  });

  it('refuses insecure production settings', () => {
    const r = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'http://school.example',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join('.')).sort()).toEqual([
      'COOKIE_SECURE',
      'CORS_ORIGINS',
    ]);
  });

  it('accepts secure production settings', () => {
    const r = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'true',
      CORS_ORIGINS: 'https://school.example, https://www.school.example',
    });
    expect(r.success).toBe(true);
  });

  it('rejects short JWT secrets', () => {
    expect(envSchema.safeParse({ ...base, JWT_ACCESS_SECRET: 'short' }).success).toBe(false);
  });
});
