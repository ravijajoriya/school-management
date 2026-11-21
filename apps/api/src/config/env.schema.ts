import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

/**
 * Every environment variable the API reads. Validated once at startup;
 * the app refuses to boot if anything is missing or malformed.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /** Express "trust proxy" setting; set to the number of proxies in front of the API (e.g. 1). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // --- Authentication ---------------------------------------------------------
  /** HMAC secret for access tokens. At least 32 characters; generate with `openssl rand -base64 48`. */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('school-management-api'),
  JWT_AUDIENCE: z.string().default('school-management-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Send the refresh cookie only over HTTPS. Must be true in production. */
  COOKIE_SECURE: booleanString.default(false),
});

export type Env = z.infer<typeof envSchema>;
