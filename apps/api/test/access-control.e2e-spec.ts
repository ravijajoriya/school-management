import request from 'supertest';
import {
  ADMIN,
  API,
  TEACHER,
  bearer,
  createTestApp,
  login,
  resetDatabase,
  type TestContext,
} from './helpers.js';

describe('Users, roles & permissions (e2e)', () => {
  let ctx: TestContext;
  let adminToken: string;
  let teacherToken: string;
  let roleIds: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    adminToken = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    teacherToken = (await login(ctx.http, TEACHER.email, TEACHER.password)).token;
    const roles = await ctx.prisma.role.findMany({ select: { id: true, code: true } });
    roleIds = Object.fromEntries(roles.map((r) => [r.code, r.id]));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const adminId = async () =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } })).id;
  const teacherId = async () =>
    (await ctx.prisma.user.findUniqueOrThrow({ where: { email: TEACHER.email } })).id;

  describe('permission enforcement', () => {
    it.each([
      ['GET', '/users'],
      ['POST', '/users'],
      ['GET', '/roles'],
      ['GET', '/permissions'],
      ['GET', '/audit-logs'],
    ])('teacher gets 403 on %s %s', async (method, path) => {
      const req =
        method === 'GET'
          ? request(ctx.http).get(API + path)
          : request(ctx.http)
              .post(API + path)
              .send({});
      const res = await req.set(bearer(teacherToken)).expect(403);
      expect(res.body.message).toMatch(/permission/i);
    });

    it('any signed-in user can read their own profile', async () => {
      const res = await request(ctx.http)
        .get(`${API}/auth/me`)
        .set(bearer(teacherToken))
        .expect(200);
      expect(res.body).toMatchObject({
        email: TEACHER.email,
        roles: ['TEACHER'],
        permissions: ['attendance.mark_assigned', 'leave.apply', 'marks.enter_assigned'],
      });
    });

    it('rejects tampered tokens', async () => {
      const tampered = `${adminToken.slice(0, -4)}abcd`;
      await request(ctx.http).get(`${API}/users`).set(bearer(tampered)).expect(401);
    });
  });

  describe('users', () => {
    it('admin lists and searches users', async () => {
      const all = await request(ctx.http).get(`${API}/users`).set(bearer(adminToken)).expect(200);
      expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      const found = await request(ctx.http)
        .get(`${API}/users?search=teach`)
        .set(bearer(adminToken))
        .expect(200);
      expect(found.body.items.map((u: { email: string }) => u.email)).toEqual([TEACHER.email]);
    });

    it('creates a user with a one-time temporary password that must be changed', async () => {
      const res = await request(ctx.http)
        .post(`${API}/users`)
        .set(bearer(adminToken))
        .send({
          fullName: 'Asha Verma',
          email: 'Asha@Test.local',
          phone: '98765 43210',
          roleIds: [roleIds.TEACHER],
        })
        .expect(201);
      expect(res.body.user).toMatchObject({
        email: 'asha@test.local',
        phone: '9876543210',
        mustChangePassword: true,
        roles: [expect.objectContaining({ code: 'TEACHER' })],
      });
      expect(res.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);

      const session = await login(ctx.http, '98765-43210', res.body.temporaryPassword);
      expect(session.body.user.mustChangePassword).toBe(true);

      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.created' },
      });
      expect(JSON.stringify(audit.afterJson)).not.toMatch(/password/i);
    });

    it('returns 409 for a duplicate email and 400 for invalid input', async () => {
      const dup = await request(ctx.http)
        .post(`${API}/users`)
        .set(bearer(adminToken))
        .send({ fullName: 'Copy', email: TEACHER.email, roleIds: [roleIds.TEACHER] })
        .expect(409);
      expect(dup.body.message).toEqual(['email: This email address is already in use']);

      const invalid = await request(ctx.http)
        .post(`${API}/users`)
        .set(bearer(adminToken))
        .send({ fullName: 'X', roleIds: [] })
        .expect(400);
      expect(invalid.body.message.length).toBeGreaterThanOrEqual(2);
    });

    it('deactivating a user ends their session immediately', async () => {
      await request(ctx.http)
        .patch(`${API}/users/${await teacherId()}`)
        .set(bearer(adminToken))
        .send({ status: 'INACTIVE' })
        .expect(200);
      await request(ctx.http).get(`${API}/auth/me`).set(bearer(teacherToken)).expect(401);
    });

    it('prevents admins from locking themselves out', async () => {
      const self = await adminId();
      const deactivate = await request(ctx.http)
        .patch(`${API}/users/${self}`)
        .set(bearer(adminToken))
        .send({ status: 'LOCKED' })
        .expect(400);
      expect(deactivate.body.message[0]).toMatch(/your own account/);

      const demote = await request(ctx.http)
        .put(`${API}/users/${self}/roles`)
        .set(bearer(adminToken))
        .send({ roleIds: [roleIds.TEACHER] })
        .expect(400);
      expect(demote.body.message[0]).toMatch(/from yourself/);
    });

    it('admin password reset forces a change and ends existing sessions', async () => {
      const res = await request(ctx.http)
        .post(`${API}/users/${await teacherId()}/reset-password`)
        .set(bearer(adminToken))
        .expect(200);
      await request(ctx.http).get(`${API}/auth/me`).set(bearer(teacherToken)).expect(401);
      const session = await login(ctx.http, TEACHER.email, res.body.temporaryPassword);
      expect(session.body.user.mustChangePassword).toBe(true);
    });
  });

  describe('privilege escalation', () => {
    let hrToken: string;

    beforeEach(async () => {
      // A custom "HR" role that may manage users but not roles.
      const role = await request(ctx.http)
        .post(`${API}/roles`)
        .set(bearer(adminToken))
        .send({ code: 'hr_officer', name: 'HR Officer' })
        .expect(201);
      expect(role.body.code).toBe('HR_OFFICER');
      await request(ctx.http)
        .put(`${API}/roles/${role.body.id}/permissions`)
        .set(bearer(adminToken))
        .send({ permissionCodes: ['users.read', 'users.create', 'users.update'] })
        .expect(200);
      const hr = await request(ctx.http)
        .post(`${API}/users`)
        .set(bearer(adminToken))
        .send({
          fullName: 'HR Person',
          email: 'hr@test.local',
          password: 'Hr-Pass-123',
          roleIds: [role.body.id],
        })
        .expect(201);
      await ctx.prisma.user.update({
        where: { id: hr.body.user.id },
        data: { mustChangePassword: false },
      });
      hrToken = (await login(ctx.http, 'hr@test.local', 'Hr-Pass-123')).token;
    });

    it('a user manager cannot grant the ADMIN role', async () => {
      await request(ctx.http)
        .post(`${API}/users`)
        .set(bearer(hrToken))
        .send({ fullName: 'Sneaky', email: 'sneaky@test.local', roleIds: [roleIds.ADMIN] })
        .expect(403);
      await request(ctx.http)
        .put(`${API}/users/${await teacherId()}/roles`)
        .set(bearer(hrToken))
        .send({ roleIds: [roleIds.ADMIN] })
        .expect(403);
    });

    it('a user manager cannot reset an admin password or edit an admin', async () => {
      await request(ctx.http)
        .post(`${API}/users/${await adminId()}/reset-password`)
        .set(bearer(hrToken))
        .expect(403);
      await request(ctx.http)
        .patch(`${API}/users/${await adminId()}`)
        .set(bearer(hrToken))
        .send({ fullName: 'Hacked' })
        .expect(403);
    });

    it('a user manager can still manage users with less access (e.g. teachers)', async () => {
      await request(ctx.http)
        .post(`${API}/users/${await teacherId()}/reset-password`)
        .set(bearer(hrToken))
        .expect(200);
    });

    it('deactivation needs the users.deactivate permission', async () => {
      await request(ctx.http)
        .patch(`${API}/users/${await teacherId()}`)
        .set(bearer(hrToken))
        .send({ status: 'INACTIVE' })
        .expect(403);
    });
  });

  describe('roles', () => {
    it('lists roles with permissions and user counts', async () => {
      const res = await request(ctx.http).get(`${API}/roles`).set(bearer(adminToken)).expect(200);
      const admin = res.body.find((r: { code: string }) => r.code === 'ADMIN');
      expect(admin).toMatchObject({ isSystem: true, permissionsLocked: true, userCount: 1 });
      expect(admin.permissionCodes).toContain('roles.manage');
    });

    it('protects the ADMIN role and system roles', async () => {
      await request(ctx.http)
        .put(`${API}/roles/${roleIds.ADMIN}/permissions`)
        .set(bearer(adminToken))
        .send({ permissionCodes: [] })
        .expect(400);
      await request(ctx.http)
        .delete(`${API}/roles/${roleIds.TEACHER}`)
        .set(bearer(adminToken))
        .expect(400);
    });

    it('granting a permission to TEACHER takes effect on the next request', async () => {
      await request(ctx.http).get(`${API}/users`).set(bearer(teacherToken)).expect(403);
      await request(ctx.http)
        .put(`${API}/roles/${roleIds.TEACHER}/permissions`)
        .set(bearer(adminToken))
        .send({ permissionCodes: ['users.read'] })
        .expect(200);
      await request(ctx.http).get(`${API}/users`).set(bearer(teacherToken)).expect(200);
    });

    it('rejects unknown permission codes and deleting a role in use', async () => {
      const bad = await request(ctx.http)
        .put(`${API}/roles/${roleIds.TEACHER}/permissions`)
        .set(bearer(adminToken))
        .send({ permissionCodes: ['nope.nothing'] })
        .expect(400);
      expect(bad.body.message).toEqual(['permissionCodes: Unknown permission nope.nothing']);

      const role = await request(ctx.http)
        .post(`${API}/roles`)
        .set(bearer(adminToken))
        .send({ code: 'LIBRARIAN', name: 'Librarian' })
        .expect(201);
      await request(ctx.http)
        .put(`${API}/users/${await teacherId()}/roles`)
        .set(bearer(adminToken))
        .send({ roleIds: [roleIds.TEACHER, role.body.id] })
        .expect(200);
      await request(ctx.http)
        .delete(`${API}/roles/${role.body.id}`)
        .set(bearer(adminToken))
        .expect(409);
    });
  });

  describe('audit logs', () => {
    it('records privileged actions and lets admins filter them', async () => {
      await request(ctx.http)
        .post(`${API}/users/${await teacherId()}/reset-password`)
        .set(bearer(adminToken))
        .expect(200);
      const res = await request(ctx.http)
        .get(`${API}/audit-logs?action=password_reset`)
        .set(bearer(adminToken))
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({
        action: 'user.password_reset',
        user: { fullName: 'Test Admin' },
      });
    });

    it('cannot be modified, even directly in the database', async () => {
      await expect(ctx.prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    });
  });
});
