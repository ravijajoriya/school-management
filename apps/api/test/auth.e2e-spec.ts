import request from 'supertest';
import {
  ADMIN,
  API,
  TEACHER,
  bearer,
  cookiePair,
  createTestApp,
  login,
  refreshCookie,
  resetDatabase,
  type TestContext,
} from './helpers.js';

describe('Auth (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma, { passwordChanged: false });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const auditActions = async () =>
    (await ctx.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.action);

  describe('login', () => {
    it('rejects requests without a token on protected routes', async () => {
      const res = await request(ctx.http).get(`${API}/users`).expect(401);
      expect(res.body.message).toBe('Authentication required');
    });

    it('rejects a wrong password and an unknown identifier with the same message', async () => {
      const wrong = await request(ctx.http)
        .post(`${API}/auth/login`)
        .send({ identifier: ADMIN.email, password: 'wrong-password-1' })
        .expect(401);
      const unknown = await request(ctx.http)
        .post(`${API}/auth/login`)
        .send({ identifier: 'nobody@test.local', password: 'whatever-1' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
      expect(await auditActions()).toEqual(['auth.login_failed', 'auth.login_failed']);
    });

    it('validates the request body', async () => {
      const res = await request(ctx.http).post(`${API}/auth/login`).send({}).expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^identifier:/),
          expect.stringMatching(/^password:/),
        ]),
      );
    });

    it('logs in case-insensitively by email and sets a secure refresh cookie', async () => {
      const res = await request(ctx.http)
        .post(`${API}/auth/login`)
        .send({ identifier: ADMIN.email.toUpperCase(), password: ADMIN.password })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        email: ADMIN.email,
        roles: ['ADMIN'],
        mustChangePassword: true,
      });
      expect(res.body.user.permissions).toContain('users.read');
      expect(res.body).not.toHaveProperty('refreshToken');

      const cookie = refreshCookie(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(await auditActions()).toEqual(['auth.login_succeeded']);
    });

    it('refuses inactive accounts even with the right password', async () => {
      await ctx.prisma.user.update({
        where: { email: TEACHER.email },
        data: { status: 'INACTIVE' },
      });
      const res = await request(ctx.http)
        .post(`${API}/auth/login`)
        .send({ identifier: TEACHER.email, password: TEACHER.password })
        .expect(401);
      expect(res.body.message).toMatch(/inactive/i);
    });
  });

  describe('forced password change', () => {
    it('blocks everything except /auth/me and change-password until the password is changed', async () => {
      const { token } = await login(ctx.http, ADMIN.email, ADMIN.password);

      const blocked = await request(ctx.http).get(`${API}/users`).set(bearer(token)).expect(403);
      expect(blocked.body.error).toBe('PASSWORD_CHANGE_REQUIRED');
      await request(ctx.http).get(`${API}/auth/me`).set(bearer(token)).expect(200);

      const changed = await request(ctx.http)
        .post(`${API}/auth/change-password`)
        .set(bearer(token))
        .send({ currentPassword: ADMIN.password, newPassword: 'Brand-New-Pass-2' })
        .expect(200);
      expect(changed.body.user.mustChangePassword).toBe(false);

      // The old access token belongs to a session that was ended by the password change.
      await request(ctx.http).get(`${API}/auth/me`).set(bearer(token)).expect(401);
      // The fresh session works and the block is lifted.
      await request(ctx.http).get(`${API}/users`).set(bearer(changed.body.accessToken)).expect(200);
      // The old password no longer works; the new one does.
      await request(ctx.http)
        .post(`${API}/auth/login`)
        .send({ identifier: ADMIN.email, password: ADMIN.password })
        .expect(401);
      await login(ctx.http, ADMIN.email, 'Brand-New-Pass-2');
    });

    it('rejects a wrong current password and a weak new password', async () => {
      const { token } = await login(ctx.http, ADMIN.email, ADMIN.password);
      const wrong = await request(ctx.http)
        .post(`${API}/auth/change-password`)
        .set(bearer(token))
        .send({ currentPassword: 'not-it-123', newPassword: 'Brand-New-Pass-2' })
        .expect(400);
      expect(wrong.body.message).toEqual(['currentPassword: Current password is incorrect']);

      const weak = await request(ctx.http)
        .post(`${API}/auth/change-password`)
        .set(bearer(token))
        .send({ currentPassword: ADMIN.password, newPassword: 'short' })
        .expect(400);
      expect(weak.body.message.join(' ')).toMatch(/at least 8 characters/);
    });
  });

  describe('refresh tokens', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const { cookie } = await login(ctx.http, ADMIN.email, ADMIN.password);
      const res = await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(cookie))
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(cookiePair(refreshCookie(res))).not.toBe(cookiePair(cookie));
    });

    it('treats an immediate replay as a concurrent tab and keeps the session', async () => {
      const { cookie } = await login(ctx.http, ADMIN.email, ADMIN.password);
      const first = await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(cookie))
        .expect(200);
      await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(cookie))
        .expect(401);
      // The newer token is still valid.
      await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(refreshCookie(first)))
        .expect(200);
    });

    it('revokes the whole session when a rotated token is reused later (theft detection)', async () => {
      const { cookie, token } = await login(ctx.http, ADMIN.email, ADMIN.password);
      const rotated = await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(cookie))
        .expect(200);

      // Move the rotation outside the grace window.
      await ctx.prisma.refreshToken.updateMany({
        where: { replacedById: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      const reuse = await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(cookie))
        .expect(401);
      expect(reuse.body.message).toBe('Refresh token revoked');
      // Both the attacker's and the legitimate user's tokens are now dead.
      await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(refreshCookie(rotated)))
        .expect(401);
      await request(ctx.http).get(`${API}/auth/me`).set(bearer(token)).expect(401);
      expect(await auditActions()).toContain('auth.refresh_token_reused');
    });

    it('returns 401 without a cookie', async () => {
      await request(ctx.http).post(`${API}/auth/refresh`).expect(401);
    });
  });

  describe('logout', () => {
    it('ends the session immediately and clears the cookie', async () => {
      const { cookie, token } = await login(ctx.http, ADMIN.email, ADMIN.password);
      const res = await request(ctx.http)
        .post(`${API}/auth/logout`)
        .set('Cookie', cookiePair(cookie))
        .expect(204);
      expect(refreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
      await request(ctx.http).get(`${API}/auth/me`).set(bearer(token)).expect(401);
      await request(ctx.http)
        .post(`${API}/auth/refresh`)
        .set('Cookie', cookiePair(cookie))
        .expect(401);
      expect(await auditActions()).toEqual(['auth.login_succeeded', 'auth.logout']);
    });
  });
});
