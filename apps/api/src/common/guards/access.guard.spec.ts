import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessGuard } from './access.guard.js';
import {
  ACCESS_RULE_KEY,
  ALLOW_PENDING_PASSWORD_KEY,
  type AccessRule,
} from '../decorators/access.decorators.js';
import type { TokenService } from '../../modules/auth/token.service.js';
import type {
  UserAccessService,
  UserAccessProfile,
} from '../../modules/auth/user-access.service.js';

function makeContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers } as never;
  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(
  metadata: { rule?: AccessRule; allowPending?: boolean },
  profile: Partial<UserAccessProfile> | null = {},
  sessionActive = true,
) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) =>
      key === ACCESS_RULE_KEY
        ? metadata.rule
        : key === ALLOW_PENDING_PASSWORD_KEY
          ? metadata.allowPending
          : undefined,
    ),
  } as unknown as Reflector;
  const tokens = {
    verifyAccessToken: vi
      .fn()
      .mockResolvedValue({ sub: 'u1', sid: 's1', iat: Math.floor(Date.now() / 1000) }),
    isSessionActive: vi.fn().mockResolvedValue(sessionActive),
  } as unknown as TokenService;
  const userAccess = {
    load: vi.fn().mockResolvedValue(
      profile === null
        ? null
        : {
            id: 'u1',
            fullName: 'U',
            email: 'u@x.y',
            phone: null,
            status: 'ACTIVE',
            mustChangePassword: false,
            passwordChangedAt: null,
            roles: ['TEACHER'],
            permissions: new Set(),
            ...profile,
          },
    ),
  } as unknown as UserAccessService;
  return new AccessGuard(reflector, tokens, userAccess);
}

const auth = { authorization: 'Bearer token' };

describe('AccessGuard', () => {
  it('denies routes that declare no access rule (fail closed)', async () => {
    await expect(makeGuard({}).canActivate(makeContext(auth))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows @Public routes without a token', async () => {
    await expect(makeGuard({ rule: { type: 'public' } }).canActivate(makeContext())).resolves.toBe(
      true,
    );
  });

  it('requires a bearer token on authenticated routes', async () => {
    await expect(
      makeGuard({ rule: { type: 'authenticated' } }).canActivate(makeContext()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects ended sessions and inactive users', async () => {
    const rule: AccessRule = { type: 'authenticated' };
    await expect(
      makeGuard({ rule }, {}, false).canActivate(makeContext(auth)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      makeGuard({ rule }, { status: 'LOCKED' }).canActivate(makeContext(auth)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens issued before the last password change', async () => {
    const guard = makeGuard(
      { rule: { type: 'authenticated' } },
      { passwordChangedAt: new Date(Date.now() + 60_000) },
    );
    await expect(guard.canActivate(makeContext(auth))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('blocks users with a pending password change unless the route allows it', async () => {
    const rule: AccessRule = { type: 'authenticated' };
    await expect(
      makeGuard({ rule }, { mustChangePassword: true }).canActivate(makeContext(auth)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      makeGuard({ rule, allowPending: true }, { mustChangePassword: true }).canActivate(
        makeContext(auth),
      ),
    ).resolves.toBe(true);
  });

  it('requires every listed permission', async () => {
    const rule: AccessRule = { type: 'permissions', permissions: ['users.read', 'users.update'] };
    await expect(
      makeGuard({ rule }, { permissions: new Set(['users.read']) }).canActivate(makeContext(auth)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      makeGuard({ rule }, { permissions: new Set(['users.read', 'users.update']) }).canActivate(
        makeContext(auth),
      ),
    ).resolves.toBe(true);
  });
});
