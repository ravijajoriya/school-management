import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PermissionCode } from '@school/shared';
import type { Request } from 'express';
import type { RequestUser } from '../http/request-user.js';

/*
 * Access rules (enforced by AccessGuard, which is global):
 *   - Every route is DENIED unless it declares exactly how it may be reached:
 *       @Public()                         no authentication
 *       @Authenticated()                  any signed-in, active user
 *       @RequirePermissions('users.read') signed-in user holding ALL listed permissions
 *   - Users who must change their password can only reach routes marked
 *     @AllowPendingPasswordChange().
 */

export const ACCESS_RULE_KEY = 'access:rule';
export const ALLOW_PENDING_PASSWORD_KEY = 'access:allowPendingPasswordChange';

export type AccessRule =
  | { type: 'public' }
  | { type: 'authenticated' }
  | { type: 'permissions'; permissions: PermissionCode[] };

export const Public = () => SetMetadata(ACCESS_RULE_KEY, { type: 'public' } satisfies AccessRule);

export const Authenticated = () =>
  SetMetadata(ACCESS_RULE_KEY, { type: 'authenticated' } satisfies AccessRule);

export const RequirePermissions = (...permissions: [PermissionCode, ...PermissionCode[]]) =>
  SetMetadata(ACCESS_RULE_KEY, { type: 'permissions', permissions } satisfies AccessRule);

export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** Injects the authenticated user. Only use on routes that are not @Public(). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.user as RequestUser;
});
