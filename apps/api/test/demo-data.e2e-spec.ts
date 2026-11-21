import request from 'supertest';
import { schoolDate } from '../src/common/utils/content.js';
import {
  DEMO_PASSWORD,
  activeDemoManifest,
  clearDemoData,
  seedDemoData,
} from '../src/database/demo/demo-data.js';
import {
  ADMIN,
  API,
  bearer,
  createTestApp,
  login,
  resetDatabase,
  type TestContext,
} from './helpers.js';

/** Row counts of every business table, to prove clear puts the database back as it was. */
async function snapshot(ctx: TestContext) {
  const p = ctx.prisma;
  const entries = await Promise.all(
    [
      ['years', p.academicYear.count()],
      ['subjects', p.subject.count()],
      ['sections', p.section.count()],
      ['classSubjects', p.classSubject.count()],
      ['assignments', p.teacherAssignment.count()],
      ['employees', p.employee.count()],
      ['students', p.student.count()],
      ['guardians', p.studentGuardian.count()],
      ['enrolments', p.studentEnrolment.count()],
      ['attendance', p.attendanceRecord.count()],
      ['leave', p.leaveRequest.count()],
      ['enquiries', p.admissionEnquiry.count()],
      ['followUps', p.enquiryFollowUp.count()],
      ['messages', p.contactMessage.count()],
      ['announcements', p.announcement.count()],
      ['events', p.event.count()],
      ['notices', p.internalNotice.count()],
      ['roles', p.role.count()],
      ['activeUsers', p.user.count({ where: { status: 'ACTIVE' } })],
      ['feeHeads', p.feeHead.count()],
      ['feePlans', p.feeStructure.count()],
      ['dues', p.studentFeeDue.count()],
      ['adjustments', p.feeAdjustment.count()],
      ['payments', p.payment.count()],
      ['receipts', p.receipt.count()],
      ['gradingScales', p.gradingScale.count()],
      ['exams', p.examination.count()],
      ['marks', p.markEntry.count()],
      ['timetables', p.timetable.count()],
      ['timetableEntries', p.timetableEntry.count()],
      ['vehicles', p.vehicle.count()],
      ['routes', p.transportRoute.count()],
      ['routeStops', p.routeStop.count()],
      ['riders', p.studentTransport.count()],
      ['complaints', p.complaint.count()],
      ['meetings', p.parentTeacherMeeting.count()],
      ['inventoryCategories', p.inventoryCategory.count()],
      ['inventoryItems', p.inventoryItem.count()],
      ['payrollRuns', p.payrollRun.count()],
      ['payrollRecords', p.payrollRecord.count()],
      ['payrollItems', p.payrollItem.count()],
      ['certificates', p.certificateIssue.count()],
      ['idCardBatches', p.idCardBatch.count()],
    ].map(async ([k, v]) => [k, await v] as const),
  );
  return Object.fromEntries(entries);
}

describe('Demo data seed & clear (e2e)', () => {
  let ctx: TestContext;
  let admin: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const api = (method: 'get' | 'post' | 'put' | 'patch', path: string, token = admin) =>
    request(ctx.http)
      [method](API + path)
      .set(bearer(token));

  it('adds a usable demo school and removes exactly that data again', async () => {
    // Some real data of the user's own that must survive.
    await api('post', '/employees')
      .send({
        firstName: 'Real',
        lastName: 'Teacher',
        designation: 'PRT',
        joiningDate: '2020-06-01',
      })
      .expect(201);
    await api('post', '/subjects').send({ name: 'Hindi' }).expect(201); // demo must reuse, not delete
    await api('post', '/fees/heads').send({ code: 'TUITION', name: 'Tuition fee' }).expect(201);
    const before = await snapshot(ctx);

    const { counts, logins } = await seedDemoData(ctx.prisma);
    expect(counts.students).toBe(49);
    expect(counts.sections).toBe(6);
    expect(counts.payments).toBeGreaterThan(0);
    expect(counts.exams).toBeGreaterThan(0);
    // Every seeded timetable is published and free of teacher clashes.
    const timetables = await ctx.prisma.timetable.findMany({ where: { status: 'PUBLISHED' } });
    expect(timetables).toHaveLength(6);
    for (const tt of timetables) {
      expect((await api('get', `/timetables/${tt.id}/clashes`).expect(200)).body).toEqual([]);
    }
    await expect(seedDemoData(ctx.prisma)).rejects.toThrow(/already present/);

    // Phase 7: operations demo content, checked through the API as a demo teacher.
    expect(counts.transportRiders).toBeGreaterThan(0);
    expect(counts.complaints).toBe(3);
    expect(counts.payrollEntries).toBe(9);
    const anil = (await login(ctx.http, 'anil@demo.local', DEMO_PASSWORD)).token;
    const meetings = (await api('get', '/meetings?status=SCHEDULED', anil).expect(200)).body;
    expect(meetings.total).toBe(2);
    const [slip] = (await api('get', '/payroll/mine', anil).expect(200)).body;
    expect(slip).toMatchObject({ status: 'PAID', net: 32000 + 5500 + 4800 - 3840 - 200 });
    // A meeting scheduled while testing goes away with the demo data too.
    const { studentEnrolmentId } = await ctx.prisma.parentTeacherMeeting.findUniqueOrThrow({
      where: { id: meetings.items[0].id },
    });
    await api('post', '/meetings', anil)
      .send({
        enrolmentId: studentEnrolmentId,
        meetingAt: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      })
      .expect(201);

    // The demo works through the real API: a demo teacher marks today; the office reviews.
    const sunita = (await login(ctx.http, logins[0].email, DEMO_PASSWORD)).token;
    const [mine] = (await api('get', '/attendance/my-sections', sunita).expect(200)).body;
    expect(mine).toMatchObject({ className: 'Class 1', sectionName: 'A', total: 8 });
    const sheet = (
      await api(
        'get',
        `/attendance/sheet?sectionId=${mine.sectionId}&date=${schoolDate()}`,
        sunita,
      ).expect(200)
    ).body;
    await api('put', '/attendance/sheet', sunita)
      .send({
        sectionId: mine.sectionId,
        date: schoolDate(),
        entries: sheet.rows.map((r: { enrolmentId: string }) => ({
          enrolmentId: r.enrolmentId,
          status: 'PRESENT',
        })),
      })
      .expect(200);
    expect((await api('get', '/leave-requests?status=PENDING').expect(200)).body.total).toBe(2);

    // Fees: the demo ledger reconciles, and a payment recorded while testing is removed too.
    const studentId = sheet.rows[0].studentId;
    const ledger = (await api('get', `/fees/students/${studentId}/ledger`).expect(200)).body;
    const t = ledger.totals;
    expect(Math.round((t.billed + t.fines - t.reductions - t.paid) * 100)).toBe(
      Math.round(t.balance * 100),
    );
    const open = ledger.dues.find((d: { balance: number }) => d.balance > 0);
    await api('post', '/fees/payments')
      .send({
        enrolmentId: ledger.enrolment.id,
        paymentDate: schoolDate(),
        amountReceived: open.balance,
        paymentMode: 'CASH',
        allocations: [{ dueId: open.id, amount: open.balance }],
      })
      .expect(201);

    // Test data created on top of the demo — a converted demo enquiry — is removed with it.
    const enquiry = await ctx.prisma.admissionEnquiry.findFirstOrThrow({
      where: { referenceNumber: 'DEMO-ENQ-0001' },
    });
    await api('post', `/enquiries/${enquiry.id}/convert`)
      .send({
        firstName: 'Vivaan',
        lastName: 'Khandelwal',
        dateOfBirth: '2020-01-01',
        guardian: { fullName: 'Rohit Khandelwal', relationship: 'FATHER', phone: '9414100000' },
        enrolment: {
          academicYearId: (await activeDemoManifest(ctx.prisma))!.academicYearId,
          sectionId: mine.sectionId,
          enrolmentDate: schoolDate(),
        },
      })
      .expect(201);

    const result = await clearDemoData(ctx.prisma);
    expect(result.cleared).toBe(true);
    // Sunita and Anil signed in, so the (unchangeable) audit log refers to them: kept but deactivated.
    expect(result.kept).toEqual([
      expect.stringMatching(/sunita@demo.local.*deactivated/),
      expect.stringMatching(/anil@demo.local.*deactivated/),
    ]);
    expect(await snapshot(ctx)).toEqual(before);
    expect(await ctx.prisma.feeHead.findUnique({ where: { code: 'TUITION' } })).not.toBeNull();
    expect(await activeDemoManifest(ctx.prisma)).toBeNull();
    await request(ctx.http)
      .post(`${API}/auth/login`)
      .send({ identifier: logins[0].email, password: DEMO_PASSWORD })
      .expect(401);

    // Clearing twice is harmless, and the demo can be added again (re-using the kept login).
    expect((await clearDemoData(ctx.prisma)).cleared).toBe(false);
    await seedDemoData(ctx.prisma);
    await login(ctx.http, logins[0].email, DEMO_PASSWORD);
    await clearDemoData(ctx.prisma);
    expect(await snapshot(ctx)).toEqual(before);
  });

  it('refuses to clear when one of your own students is also in a demo class', async () => {
    await seedDemoData(ctx.prisma);
    const m = (await activeDemoManifest(ctx.prisma))!;
    const year = await ctx.prisma.academicYear.findFirstOrThrow({ where: { isActive: true } });
    const class3 = await ctx.prisma.class.findFirstOrThrow({ where: { name: 'Class 3' } });
    // One of your own students (not a demo one) with a past enrolment in your own class and a
    // current enrolment in a demo class: clearing must stop rather than delete their history.
    const student = await ctx.prisma.student.create({
      data: { admissionNumber: 'OWN-1', firstName: 'Own', dateOfBirth: new Date('2018-01-01') },
    });
    const demoSection = await ctx.prisma.section.findUniqueOrThrow({
      where: { id: m.sectionIds[0] },
    });
    const prevYear = await ctx.prisma.academicYear.create({
      data: {
        name: '2001-2002',
        startDate: new Date('2001-04-01'),
        endDate: new Date('2002-03-31'),
      },
    });
    const oldSection = await ctx.prisma.section.create({
      data: { academicYearId: prevYear.id, classId: class3.id, name: 'A' },
    });
    await ctx.prisma.studentEnrolment.create({
      data: {
        studentId: student.id,
        academicYearId: prevYear.id,
        classId: class3.id,
        sectionId: oldSection.id,
        enrolmentDate: new Date('2001-04-01'),
      },
    });
    await ctx.prisma.studentEnrolment.create({
      data: {
        studentId: student.id,
        academicYearId: year.id,
        classId: demoSection.classId,
        sectionId: demoSection.id,
        enrolmentDate: new Date(`${schoolDate()}T00:00:00Z`),
      },
    });
    await expect(clearDemoData(ctx.prisma)).rejects.toThrow(/Own .*OWN-1/);
    expect(await activeDemoManifest(ctx.prisma)).not.toBeNull(); // nothing was removed
  });
});
