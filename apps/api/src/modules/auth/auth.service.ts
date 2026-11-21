import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type AuthResponse,
  type ChangePasswordInput,
  type LoginInput,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { TokenService, type IssuedRefreshToken } from './token.service.js';
import { UserAccessService } from './user-access.service.js';

export interface SessionResult {
  response: AuthResponse;
  refreshToken: IssuedRefreshToken;
}

const INVALID_CREDENTIALS = 'Invalid email/phone or password';

/** Normalises the login identifier the same way user records are stored. */
export function normaliseIdentifier(identifier: string): { email?: string; phone?: string } {
  const value = identifier.trim();
  return value.includes('@')
    ? { email: value.toLowerCase() }
    : { phone: value.replace(/[\s-]/g, '') };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly userAccess: UserAccessService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, context: RequestContext): Promise<SessionResult> {
    const where = normaliseIdentifier(input.identifier);
    const user = await this.prisma.user.findFirst({
      where,
      select: { id: true, passwordHash: true, status: true },
    });

    if (!user) {
      await this.passwords.verifyDummy(input.password);
      await this.audit.logSafe({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        after: { reason: 'unknown_identifier', identifier: maskIdentifier(input.identifier) },
        context,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.audit.logSafe({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        after: { reason: 'wrong_password' },
        context,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (user.status !== 'ACTIVE') {
      await this.audit.logSafe({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        after: { reason: `status_${user.status.toLowerCase()}` },
        context,
      });
      throw new UnauthorizedException(
        user.status === 'LOCKED'
          ? 'This account is locked. Please contact the school administrator.'
          : 'This account is inactive. Please contact the school administrator.',
      );
    }

    // Transparently upgrade hashes created with older parameters.
    const newHash = this.passwords.needsRehash(user.passwordHash)
      ? await this.passwords.hash(input.password)
      : undefined;

    const refreshToken = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), ...(newHash ? { passwordHash: newHash } : {}) },
      });
      const issued = await this.tokens.issueRefreshToken(user.id, context, tx);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
          after: { sessionId: issued.familyId },
          context,
        },
        tx,
      );
      return issued;
    });

    return { response: await this.buildResponse(user.id, refreshToken.familyId), refreshToken };
  }

  async refresh(rawToken: string | undefined, context: RequestContext): Promise<SessionResult> {
    if (!rawToken) throw new UnauthorizedException('No active session');
    const { userId, next } = await this.tokens.rotateRefreshToken(rawToken, context);

    const profile = await this.userAccess.load(userId);
    if (!profile || profile.status !== 'ACTIVE') {
      await this.tokens.revokeFamily(next.familyId);
      throw new UnauthorizedException('Account is not active');
    }
    return { response: await this.buildResponse(userId, next.familyId), refreshToken: next };
  }

  async logout(rawToken: string | undefined, context: RequestContext): Promise<void> {
    if (!rawToken) return;
    const session = await this.tokens.revokeByRawToken(rawToken);
    if (session) {
      await this.audit.logSafe({
        action: AUDIT_ACTIONS.LOGOUT,
        entityType: 'user',
        entityId: session.userId,
        userId: session.userId,
        after: { sessionId: session.familyId },
        context,
      });
    }
  }

  async me(userId: string) {
    const profile = await this.userAccess.load(userId);
    if (!profile) throw new UnauthorizedException('Session has ended');
    return UserAccessService.toAuthUser(profile);
  }

  /**
   * Changes the user's own password. All existing sessions (including the current one) are ended
   * and a fresh session is returned, so stolen tokens stop working immediately.
   */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext,
  ): Promise<SessionResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      throw new BadRequestException(['currentPassword: Current password is incorrect']);
    }

    const passwordHash = await this.passwords.hash(input.newPassword);
    const refreshToken = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      });
      await this.tokens.revokeAllForUser(userId, tx);
      const issued = await this.tokens.issueRefreshToken(userId, context, tx);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PASSWORD_CHANGED,
          entityType: 'user',
          entityId: userId,
          userId,
          context,
        },
        tx,
      );
      return issued;
    });

    return { response: await this.buildResponse(userId, refreshToken.familyId), refreshToken };
  }

  private async buildResponse(userId: string, sessionId: string): Promise<AuthResponse> {
    const profile = await this.userAccess.load(userId);
    if (!profile) throw new UnauthorizedException('Session has ended');
    return {
      accessToken: await this.tokens.signAccessToken(userId, sessionId),
      expiresIn: this.tokens.accessTtlSeconds,
      user: UserAccessService.toAuthUser(profile),
    };
  }
}

/** Keeps failed-login audit rows useful without storing full unknown identifiers. */
function maskIdentifier(identifier: string): string {
  const value = identifier.trim();
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return value.length > 4 ? `${'*'.repeat(value.length - 4)}${value.slice(-4)}` : '****';
}
