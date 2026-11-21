import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ACCESS_RULE_KEY,
  ALLOW_PENDING_PASSWORD_KEY,
  type AccessRule,
} from '../decorators/access.decorators.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { UserAccessService } from '../../modules/auth/user-access.service.js';

/** Error code returned when the user must change their password before doing anything else. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Global, deny-by-default guard. See access.decorators.ts for the rules.
 * Order of checks: route rule → bearer token → session alive → user active →
 * token newer than last password change → pending password change → permissions.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly userAccess: UserAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE_KEY, targets);

    if (!rule) {
      // A route without an explicit access rule is a programming error: fail closed.
      this.logger.warn(
        `Denied: no access rule on ${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new ForbiddenException('Access denied');
    }
    if (rule.type === 'public') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request);
    if (!token) throw new UnauthorizedException('Authentication required');

    const claims = await this.tokens.verifyAccessToken(token);
    const [profile, sessionActive] = await Promise.all([
      this.userAccess.load(claims.sub),
      this.tokens.isSessionActive(claims.sid),
    ]);

    if (!profile || !sessionActive) throw new UnauthorizedException('Session has ended');
    if (profile.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
    if (
      profile.passwordChangedAt &&
      claims.iat < Math.floor(profile.passwordChangedAt.getTime() / 1000)
    ) {
      throw new UnauthorizedException('Session has ended');
    }

    request.user = {
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      status: profile.status,
      mustChangePassword: profile.mustChangePassword,
      roles: profile.roles,
      permissions: profile.permissions,
      sessionId: claims.sid,
    };

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_KEY,
      targets,
    );
    if (profile.mustChangePassword && !allowPending) {
      throw new ForbiddenException({
        statusCode: 403,
        error: PASSWORD_CHANGE_REQUIRED,
        message: 'You must change your password before continuing',
      });
    }

    if (rule.type === 'permissions') {
      const missing = rule.permissions.filter((p) => !profile.permissions.has(p));
      if (missing.length > 0) {
        throw new ForbiddenException('You do not have permission to perform this action');
      }
    }
    return true;
  }

  private extractBearer(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
