import request from 'supertest';
import { schoolDate } from '../src/common/utils/content.js';
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

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('Attendance & leave (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
  let teacherUserId: string;
  let teacherEmployeeId: string;
  let yearId: string;
  let sectionA: string;
  let sectionB: string;
  /** Enrolment ids in Class 1 – A (Aarav, Bhavya, Chirag) and one in Class 1 – B (Dev). */
  let enrolA: string[];
  let enrolB: string;
  let studentA: string;
  let studentB: string;

  const today = schoolDate();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  const month = today.slice(0, 7);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const api = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, token = admin) =>
    request(ctx.http)
      [method](API + path)
      .set(bearer(token));

  const register = async (firstName: string, sectionId: string) => {
    const student = (
      await api('post', '/students')
        .send({
          firstName,
          lastName: 'Sharma',
          dateOfBirth: '2019-05-10',
          guardians: [
            {
              fullName: 'Ramesh Sharma',
              relationship: 'FATHER',
              phone: '9829012345',
              isPrimary: true,
            },
          ],
          enrolment: { academicYearId: yearId, sectionId, enrolmentDate: addDays(today, -60) },
        })
        .expect(201)
    ).body;
    return { studentId: student.id as string, enrolmentId: student.enrolments[0].id as string };
  };

  const mark = (
    token: string,
    date: string,
    entries: { enrolmentId: string; status: string; remarks?: string }[],
    extra: object = {},
    sectionId = sectionA,
  ) => api('put', '/attendance/sheet', token).send({ sectionId, date, entries, ...extra });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    const t = await login(ctx.http, TEACHER.email, TEACHER.password);
    teacher = t.token;
    teacherUserId = t.body.user.id;

    // A year that always contains yesterday, today and tomorrow.
    const y = Number(today.slice(0, 4));
    yearId = (
      await api('post', '/academic-years')
        .send({
          name: `${y}-${y + 1}`,
          startDate: addDays(today, -60),
          endDate: addDays(today, 60),
        })
        .expect(201)
    ).body.id;
    await api('post', `/academic-years/${yearId}/activate`).expect(200);

    teacherEmployeeId = (
      await api('post', '/employees')
        .send({
          firstName: 'Sunita',
          lastName: 'Verma',
          designation: 'PRT',
          joiningDate: '2020-06-01',
        })
        .expect(201)
    ).body.id;
    await api('patch', `/employees/${teacherEmployeeId}/user`)
      .send({ userId: teacherUserId })
      .expect(200);

    const class1 = await ctx.prisma.class.findFirstOrThrow({ where: { name: 'Class 1' } });
    const section = (name: string, classTeacherId?: string) =>
      api('post', '/sections')
        .send({ academicYearId: yearId, classId: class1.id, name, classTeacherId })
        .expect(201);
    sectionA = (await section('A', teacherEmployeeId)).body.id;
    sectionB = (await section('B')).body.id;

    const a = await register('Aarav', sectionA);
    const b = await register('Bhavya', sectionA);
    const c = await register('Chirag', sectionA);
    const d = await register('Dev', sectionB);
    enrolA = [a.enrolmentId, b.enrolmentId, c.enrolmentId];
    enrolB = d.enrolmentId;
    studentA = b.studentId;
    studentB = d.studentId;
  });

  it('gives teachers the self-service permissions without opening the admin portal', async () => {
    const me = (await login(ctx.http, TEACHER.email, TEACHER.password)).body.user;
    expect([...me.permissions].sort()).toEqual([
      'attendance.mark_assigned',
      'leave.apply',
      'marks.enter_assigned',
      'meetings.schedule_own',
    ]);
  });

  describe('marking', () => {
    it('lets the class teacher mark the whole class today, then fix one student', async () => {
      const sections = (await api('get', '/attendance/my-sections', teacher).expect(200)).body;
      expect(sections).toEqual([
        expect.objectContaining({ sectionId: sectionA, total: 3, markedToday: 0, today }),
      ]);

      const empty = (
        await api('get', `/attendance/sheet?sectionId=${sectionA}&date=${today}`, teacher).expect(
          200,
        )
      ).body;
      expect(empty).toMatchObject({ canEdit: true, requiresReason: false, isToday: true });
      expect(empty.rows.map((r: { status: unknown }) => r.status)).toEqual([null, null, null]);

      const first = await mark(teacher, today, [
        { enrolmentId: enrolA[0], status: 'PRESENT' },
        { enrolmentId: enrolA[1], status: 'ABSENT', remarks: 'Fever' },
        { enrolmentId: enrolA[2], status: 'LATE' },
      ]).expect(200);
      expect(first.body).toEqual({ created: 3, updated: 0, unchanged: 0 });

      // Individual marking uses the same endpoint with one entry.
      const fix = await mark(teacher, today, [
        { enrolmentId: enrolA[1], status: 'PRESENT' },
      ]).expect(200);
      expect(fix.body).toEqual({ created: 0, updated: 1, unchanged: 0 });
      const again = await mark(teacher, today, [
        { enrolmentId: enrolA[1], status: 'PRESENT' },
      ]).expect(200);
      expect(again.body).toEqual({ created: 0, updated: 0, unchanged: 1 });

      const sheet = (
        await api('get', `/attendance/sheet?sectionId=${sectionA}&date=${today}`, teacher).expect(
          200,
        )
      ).body;
      expect(sheet.summary).toEqual({ total: 3, marked: 3, present: 2, absent: 0, late: 1 });
      const bhavya = sheet.rows.find((r: { enrolmentId: string }) => r.enrolmentId === enrolA[1]);
      expect(bhavya).toMatchObject({
        status: 'PRESENT',
        updatedBy: 'Test Teacher',
        correctionReason: null,
      });

      expect(
        (await api('get', '/attendance/my-sections', teacher).expect(200)).body[0].markedToday,
      ).toBe(3);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'attendance.marked' } })).toBe(2);
    });

    it('limits teachers to their own class and to today', async () => {
      await api('get', `/attendance/sheet?sectionId=${sectionB}&date=${today}`, teacher).expect(
        403,
      );
      await mark(teacher, today, [{ enrolmentId: enrolB, status: 'PRESENT' }], {}, sectionB).expect(
        403,
      );

      const past = await mark(teacher, yesterday, [
        { enrolmentId: enrolA[0], status: 'PRESENT' },
      ]).expect(403);
      expect(past.body.message).toMatch(/only the office/i);
      const view = (
        await api(
          'get',
          `/attendance/sheet?sectionId=${sectionA}&date=${yesterday}`,
          teacher,
        ).expect(200)
      ).body;
      expect(view).toMatchObject({ canEdit: false, lockedReason: expect.stringMatching(/office/) });

      await mark(teacher, tomorrow, [{ enrolmentId: enrolA[0], status: 'PRESENT' }]).expect(403);
      await mark(admin, tomorrow, [{ enrolmentId: enrolA[0], status: 'PRESENT' }]).expect(403);

      // A student from another section, a duplicate entry and an out-of-year date are refused.
      await mark(teacher, today, [{ enrolmentId: enrolB, status: 'PRESENT' }]).expect(400);
      await mark(teacher, today, [
        { enrolmentId: enrolA[0], status: 'PRESENT' },
        { enrolmentId: enrolA[0], status: 'ABSENT' },
      ]).expect(400);
      await mark(admin, addDays(today, -90), [
        { enrolmentId: enrolA[0], status: 'PRESENT' },
      ]).expect(400);

      // A student who joined later is not on earlier sheets.
      await ctx.prisma.studentEnrolment.update({
        where: { id: enrolA[2] },
        data: { enrolmentDate: new Date(`${today}T00:00:00Z`) },
      });
      const earlier = (
        await api('get', `/attendance/sheet?sectionId=${sectionA}&date=${yesterday}`).expect(200)
      ).body;
      expect(earlier.rows).toHaveLength(2);
      await mark(admin, yesterday, [{ enrolmentId: enrolA[2], status: 'PRESENT' }], {
        correctionReason: 'Back-dated entry',
      }).expect(400);
    });

    it('lets the office correct past days only with a reason, and keeps the trail', async () => {
      const noReason = await mark(admin, yesterday, [
        { enrolmentId: enrolA[0], status: 'ABSENT' },
      ]).expect(400);
      expect(noReason.body.message[0]).toMatch(/^correctionReason:/);

      await mark(
        admin,
        yesterday,
        enrolA.map((enrolmentId) => ({ enrolmentId, status: 'PRESENT' })),
        { correctionReason: 'Class teacher was on leave' },
      ).expect(200);
      const fixed = await mark(admin, yesterday, [{ enrolmentId: enrolA[0], status: 'ABSENT' }], {
        correctionReason: 'Parent confirmed the child was ill',
      }).expect(200);
      expect(fixed.body).toEqual({ created: 0, updated: 1, unchanged: 0 });

      const row = await ctx.prisma.attendanceRecord.findFirstOrThrow({
        where: { studentEnrolmentId: enrolA[0] },
      });
      expect(row).toMatchObject({
        status: 'ABSENT',
        correctionReason: 'Parent confirmed the child was ill',
      });
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'attendance.corrected', reason: 'Parent confirmed the child was ill' },
      });
      expect(audit.beforeJson).toEqual({
        changed: [{ student: 'Aarav Sharma', status: 'PRESENT' }],
      });

      // Same-day changes by the office need no reason.
      await mark(teacher, today, [{ enrolmentId: enrolA[0], status: 'PRESENT' }]).expect(200);
      await mark(admin, today, [{ enrolmentId: enrolA[0], status: 'LATE' }]).expect(200);
    });

    it('freezes attendance once the academic year is closed', async () => {
      await mark(teacher, today, [{ enrolmentId: enrolA[0], status: 'PRESENT' }]).expect(200);
      const y = Number(today.slice(0, 4));
      const next = (
        await api('post', '/academic-years')
          .send({
            name: `${y + 1}-${y + 2}`,
            startDate: addDays(today, 61),
            endDate: addDays(today, 400),
          })
          .expect(201)
      ).body;
      await api('post', `/academic-years/${next.id}/activate`).expect(200);
      const res = await mark(admin, today, [{ enrolmentId: enrolA[0], status: 'ABSENT' }], {
        correctionReason: 'Late correction',
      }).expect(403);
      expect(res.body.message).toMatch(/closed/);
    });
  });

  describe('reports', () => {
    beforeEach(async () => {
      await mark(
        admin,
        yesterday,
        enrolA.map((enrolmentId) => ({ enrolmentId, status: 'PRESENT' })),
        {
          correctionReason: 'Entered from the paper register',
        },
      ).expect(200);
      await mark(teacher, today, [
        { enrolmentId: enrolA[0], status: 'PRESENT' },
        { enrolmentId: enrolA[1], status: 'ABSENT', remarks: 'Fever' },
        { enrolmentId: enrolA[2], status: 'LATE' },
      ]).expect(200);
    });

    it('builds the daily school-wide report', async () => {
      const daily = (await api('get', `/attendance/reports/daily?date=${today}`).expect(200)).body;
      expect(daily.rows).toEqual([
        expect.objectContaining({
          sectionId: sectionA,
          classTeacher: 'Sunita Verma',
          total: 3,
          marked: 3,
          present: 1,
          absent: 1,
          late: 1,
          percentage: 66.7,
        }),
        expect.objectContaining({ sectionId: sectionB, total: 1, marked: 0, percentage: null }),
      ]);
      expect(daily.sectionsNotMarked).toBe(1);
      expect(daily.totals).toMatchObject({ total: 4, marked: 3 });
      await api('get', `/attendance/reports/daily?date=${today}`, teacher).expect(403);
    });

    it('builds the class register, monthly summary and student report', async () => {
      const register = (
        await api(
          'get',
          `/attendance/reports/register?sectionId=${sectionA}&month=${month}`,
          teacher,
        ).expect(200)
      ).body;
      const bhavya = register.rows.find(
        (r: { enrolmentId: string }) => r.enrolmentId === enrolA[1],
      );
      expect(bhavya.days[today]).toBe('ABSENT');
      expect(register.workingDays).toContain(today);
      await api(
        'get',
        `/attendance/reports/register?sectionId=${sectionB}&month=${month}`,
        teacher,
      ).expect(403);

      const monthly = (await api('get', `/attendance/reports/monthly?month=${month}`).expect(200))
        .body;
      const rowA = monthly.rows.find((r: { sectionId: string }) => r.sectionId === sectionA);
      expect(rowA).toMatchObject({ students: 3 });
      expect(rowA.workingDays).toBeGreaterThanOrEqual(1);

      const summary = (await api('get', `/attendance/students/${studentA}`, teacher).expect(200))
        .body;
      expect(summary.totals).toMatchObject({ absent: 1, present: 1, marked: 2, percentage: 50 });
      expect(summary.recent).toEqual([{ date: today, status: 'ABSENT', remarks: 'Fever' }]);
      await api('get', `/attendance/students/${studentB}`, teacher).expect(403);
      await api('get', `/attendance/students/${studentB}`).expect(200);
    });
  });

  describe('leave', () => {
    const apply = (token: string, startDate: string, endDate: string, leaveType = 'CASUAL') =>
      api('post', '/leave-requests/mine', token).send({
        leaveType,
        startDate,
        endDate,
        reason: 'Family function in Jaipur',
      });

    it('runs the request → approve/reject → cancel workflow', async () => {
      const req = (await apply(teacher, addDays(today, 3), addDays(today, 4)).expect(201)).body;
      expect(req).toMatchObject({ status: 'PENDING', days: 2, canCancel: true });
      await apply(teacher, addDays(today, 4), addDays(today, 6)).expect(409);
      await apply(teacher, addDays(today, 5), addDays(today, 4)).expect(400);

      expect((await api('get', '/leave-requests/summary').expect(200)).body.pending).toBe(1);
      const pending = (await api('get', '/leave-requests?status=PENDING').expect(200)).body;
      expect(pending.items).toHaveLength(1);
      await api('get', '/leave-requests', teacher).expect(403);
      await api('post', `/leave-requests/${req.id}/approve`, teacher).send({}).expect(403);

      await api('post', `/leave-requests/${req.id}/reject`).send({}).expect(400);
      const approved = (
        await api('post', `/leave-requests/${req.id}/approve`)
          .send({ remarks: 'Enjoy' })
          .expect(200)
      ).body;
      expect(approved).toMatchObject({
        status: 'APPROVED',
        reviewedBy: { fullName: 'Test Admin' },
      });
      await api('post', `/leave-requests/${req.id}/reject`)
        .send({ remarks: 'Too late' })
        .expect(409);

      // Approved leave that has not started can still be cancelled by the teacher.
      const cancelled = (
        await api('post', `/leave-requests/mine/${req.id}/cancel`, teacher).expect(200)
      ).body;
      expect(cancelled.status).toBe('CANCELLED');

      // Leave covering today: shows in the summary and on the daily report, and cannot be cancelled.
      const sick = (await apply(teacher, today, today, 'SICK').expect(201)).body;
      await api('post', `/leave-requests/${sick.id}/approve`).send({}).expect(200);
      await api('post', `/leave-requests/mine/${sick.id}/cancel`, teacher).expect(400);
      const summary = (await api('get', '/leave-requests/summary').expect(200)).body;
      expect(summary.onLeaveToday).toEqual([
        expect.objectContaining({ fullName: 'Sunita Verma', leaveType: 'SICK' }),
      ]);
      const daily = (await api('get', `/attendance/reports/daily?date=${today}`).expect(200)).body;
      expect(daily.rows[0].classTeacherOnLeave).toBe(true);

      const mine = (await api('get', '/leave-requests/mine', teacher).expect(200)).body;
      expect(mine.map((r: { status: string }) => r.status).sort()).toEqual([
        'APPROVED',
        'CANCELLED',
      ]);
      expect(await ctx.prisma.auditLog.count({ where: { action: { startsWith: 'leave.' } } })).toBe(
        5,
      );
    });

    it('needs a linked staff record and forbids reviewing your own request', async () => {
      const unlinked = await api('get', '/leave-requests/mine').expect(403);
      expect(unlinked.body.message).toMatch(/not linked/);

      const adminUser = await ctx.prisma.user.findFirstOrThrow({ where: { email: ADMIN.email } });
      const emp = (
        await api('post', '/employees')
          .send({ firstName: 'Office', designation: 'Principal', joiningDate: '2015-04-01' })
          .expect(201)
      ).body;
      await api('patch', `/employees/${emp.id}/user`).send({ userId: adminUser.id }).expect(200);
      const own = (await apply(admin, addDays(today, 10), addDays(today, 10)).expect(201)).body;
      await api('post', `/leave-requests/${own.id}/approve`).send({}).expect(403);
    });

    it('rejects overlapping active requests in the database itself', async () => {
      await apply(teacher, addDays(today, 3), addDays(today, 5)).expect(201);
      await expect(
        ctx.prisma.leaveRequest.create({
          data: {
            employeeId: teacherEmployeeId,
            leaveType: 'CASUAL',
            startDate: new Date(`${addDays(today, 5)}T00:00:00Z`),
            endDate: new Date(`${addDays(today, 7)}T00:00:00Z`),
            reason: 'Bypassing the API',
          },
        }),
      ).rejects.toThrow();
    });
  });
});
