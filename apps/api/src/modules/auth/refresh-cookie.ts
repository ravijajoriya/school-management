import type { CookieOptions } from 'express';

export const REFRESH_COOKIE = 'sm_rt';

/**
 * The refresh token lives only in an httpOnly cookie:
 *  - httpOnly: unreadable by JavaScript (XSS cannot steal it)
 *  - sameSite=strict: not sent on cross-site requests (CSRF)
 *  - path: only sent to the auth endpoints, not to every API call
 */
export function refreshCookieOptions(
  apiPrefix: string,
  secure: boolean,
  expiresAt?: Date,
): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: `/${apiPrefix.replace(/^\/+|\/+$/g, '')}/auth`,
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}
