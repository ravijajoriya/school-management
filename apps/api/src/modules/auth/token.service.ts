import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_ACTIONS } from '@school/shared';
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.schema.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import { AuditService } from '../audit/audit.service.js';

export interface AccessTokenClaims {
  /** User id */
  sub: string;
  /** Session (refresh-token family) id */
  sid: string;
  /** Issued-at, seconds since epoch */
  iat: number;
}

export interface IssuedRefreshToken {
  /** Raw token — goes into the httpOnly cookie only. Never stored or logged. */
  token: string;
  expiresAt: Date;
  familyId: string;
}

/** A rotated token presented again within this window is treated as a concurrent request from
 *  another tab, not as theft: the request is rejected but the session is kept. */
const ROTATION_GRACE_MS = 30_000;

type Db = PrismaService | Prisma.TransactionClient;

/** Thrown when another request (usually another browser tab) has just rotated the same token.
 *  The client should retry once; the session itself is not revoked. */
export class RefreshTokenRaceError extends UnauthorizedException {
  constructor() {
    super('Refresh token already rotated');
  }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;
  private readonly issuer: string;
  private readonly audience: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlMs: number;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    this.secret = new TextEncoder().encode(config.get('JWT_ACCESS_SECRET', { infer: true }));
    this.issuer = config.get('JWT_ISSUER', { infer: true });
    this.audience = config.get('JWT_AUDIENCE', { infer: true });
    this.accessTtlSeconds = config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    this.refreshTtlMs = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000;
  }

  // --- Access tokens ------------------------------------------------------------

  signAccessToken(userId: string, sessionId: string): Promise<string> {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !payload.iat) {
        throw new UnauthorizedException('Invalid access token');
      }
      return { sub: payload.sub, sid: payload.sid, iat: payload.iat };
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        throw new UnauthorizedException('Access token expired');
      }
      throw new UnauthorizedException('Invalid access token');
    }
  }

  // --- Refresh tokens -----------------------------------------------------------

  /** Starts a new login session (token family). */
  async issueRefreshToken(
    userId: string,
    context: RequestContext,
    db: Db = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const { id: _id, ...issued } = await this.createRefreshToken(userId, randomUUID(), context, db);
    return issued;
  }

  /**
   * Exchanges a refresh token for a new one in the same family (rotation).
   * Replaying an already-rotated token outside the grace window revokes the whole family.
   */
  async rotateRefreshToken(
    rawToken: string,
    context: RequestContext,
  ): Promise<{ userId: string; next: IssuedRefreshToken }> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!current) throw new UnauthorizedException('Invalid refresh token');

    if (current.revokedAt || current.replacedById) {
      const rotatedRecently =
        current.replacedById &&
        current.revokedAt &&
        Date.now() - current.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (rotatedRecently) {
        throw new RefreshTokenRaceError();
      }
      if (current.replacedById) {
        // A token that was legitimately rotated is being used again: likely stolen.
        await this.revokeFamily(current.familyId);
        await this.audit.logSafe({
          action: AUDIT_ACTIONS.REFRESH_TOKEN_REUSED,
          entityType: 'refresh_token',
          entityId: current.id,
          userId: current.userId,
          after: { familyId: current.familyId },
          context,
        });
      }
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (current.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    return this.prisma.$transaction(async (tx) => {
      const { id: nextId, ...next } = await this.createRefreshToken(
        current.userId,
        current.familyId,
        context,
        tx,
      );
      // Conditional update: only one concurrent request can win the rotation.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null, replacedById: null },
        data: { revokedAt: new Date(), replacedById: nextId },
      });
      if (count !== 1) throw new RefreshTokenRaceError();
      return { userId: current.userId, next };
    });
  }

  /** Revokes the session the raw token belongs to (logout). Unknown tokens are ignored. */
  async revokeByRawToken(rawToken: string): Promise<{ userId: string; familyId: string } | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      select: { userId: true, familyId: true },
    });
    if (!row) return null;
    await this.revokeFamily(row.familyId);
    return row;
  }

  revokeFamily(familyId: string, db: Db = this.prisma) {
    return db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ends every session of a user (password change/reset, deactivation, role change). */
  revokeAllForUser(userId: string, db: Db = this.prisma) {
    return db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** A session is alive while its family still has an unrevoked, unexpired token. */
  async isSessionActive(familyId: string): Promise<boolean> {
    const live = await this.prisma.refreshToken.findFirst({
      where: { familyId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return live !== null;
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    context: RequestContext,
    db: Db,
  ): Promise<IssuedRefreshToken & { id: string }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    const row = await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
      },
      select: { id: true },
    });
    return { id: row.id, token, expiresAt, familyId };
  }
}
