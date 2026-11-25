import request from 'supertest';
import { schoolDate } from '../src/common/utils/content.js';
import { isoWeekday, scheduleDate } from '../src/modules/academics/teacher-schedule.js';
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

describe('Teacher panel: holidays, class order and class attendance (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
  let yearId: string;
  let secA: string;
  let secB: string;
  let secC: string;
  let teacherEmp: string;
  let enA: string[];
  const today = schoolDate();

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

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    const t = await login(ctx.http, TEACHER.email, TEACHER.password);
    teacher = t.token;
    const y = Number(today.slice(0, 4));
    yearId = (
      await api('post', '/academic-years')
        .send({
          name: `${y}-${y + 1}`,
          startDate: addDays(today, -60),
          endDate: addDays(today, 120),
        })
        .expect(201)
    ).body.id;
    await api('post', `/academic-years/${yearId}/activate`).expect(200);
    teacherEmp = (
      await api('post', '/employees')
        .send({
          firstName: 'Anil',
          lastName: 'Meena',
          designation: 'TGT',
          joiningDate: '2015-07-01',
        })
        .expect(201)
    ).body.id;
    await api('patch', `/employees/${teacherEmp}/user`)
      .send({ userId: t.body.user.id })
      .expect(200);
    const classId = async (name: string) =>
      (await ctx.prisma.class.findFirstOrThrow({ where: { name } })).id;
    const mkSection = async (cls: string, name: string, classTeacherId?: string) =>
      (
        await api('post', '/sections')
          .send({ academicYearId: yearId, classId: await classId(cls), name, classTeacherId })
          .expect(201)
      ).body.id as string;
    secA = await mkSection('Class 8', 'A', teacherEmp); // class teacher, no lessons
    secB = await mkSection('Class 6', 'B');
    secC = await mkSection('Class 7', 'C');
    const maths = (await api('post', '/subjects').send({ name: 'Mathematics' }).expect(201)).body
      .id;
    const timetable = async (
      sectionId: string,
      cls: string,
      period: number,
      start: string,
      end: string,
    ) => {
      const [cs] = (
        await api('put', '/class-subjects')
          .send({
            academicYearId: yearId,
            classId: await classId(cls),
            subjects: [{ subjectId: maths }],
          })
          .expect(200)
      ).body;
      await api('post', '/teacher-assignments')
        .send({ academicYearId: yearId, employeeId: teacherEmp, sectionId, classSubjectId: cs.id })
        .expect(201);
      const tt = (await api('post', '/timetables').send({ sectionId, name: 'Main' }).expect(201))
        .body;
      await api('put', `/timetables/${tt.id}/entries`)
        .send({
          entries: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            periodNumber: period,
            startTime: start,
            endTime: end,
            classSubjectId: cs.id,
            teacherEmployeeId: teacherEmp,
          })),
        })
        .expect(200);
      await api('post', `/timetables/${tt.id}/publish`).expect(200);
    };
    await timetable(secB, 'Class 6', 2, '08:50', '09:30');
    await timetable(secC, 'Class 7', 1, '08:00', '08:40');
    enA = [];
    for (const firstName of ['Aarav', 'Bhavya']) {
      const s = (
        await api('post', '/students')
          .send({
            firstName,
            lastName: 'Sharma',
            dateOfBirth: '2012-05-14',
            guardians: [
              {
                fullName: 'Ramesh Sharma',
                relationship: 'FATHER',
                phone: '9829012345',
                isPrimary: true,
              },
            ],
            enrolment: {
              academicYearId: yearId,
              sectionId: secA,
              enrolmentDate: addDays(today, -30),
            },
          })
          .expect(201)
      ).body;
      enA.push(s.enrolments[0].id);
    }
  });

  it('manages holidays: office only, inside the year, never overlapping', async () => {
    const h = (
      await api('post', '/holidays')
        .send({
          academicYearId: yearId,
          name: 'Diwali break',
          startDate: addDays(today, 10),
          endDate: addDays(today, 14),
        })
        .expect(201)
    ).body;
    expect(h).toMatchObject({ name: 'Diwali break', days: 5 });
    const overlap = await api('post', '/holidays')
      .send({
        academicYearId: yearId,
        name: 'Overlap',
        startDate: addDays(today, 14),
        endDate: addDays(today, 15),
      })
      .expect(409);
    expect(overlap.body.message).toEqual([
      'startDate: This overlaps another holiday in the same year',
    ]);
    await api('post', '/holidays')
      .send({
        academicYearId: yearId,
        name: 'Too late',
        startDate: addDays(today, 200),
        endDate: addDays(today, 200),
      })
      .expect(400);
    await api('post', '/holidays')
      .send({
        academicYearId: yearId,
        name: 'Backwards',
        startDate: addDays(today, 5),
        endDate: addDays(today, 4),
      })
      .expect(400);
    await api('post', '/holidays', teacher)
      .send({
        academicYearId: yearId,
        name: 'Teacher',
        startDate: addDays(today, 20),
        endDate: addDays(today, 20),
      })
      .expect(403);
    // Teachers can read them (their timetable shows holidays).
    const listed = (
      await api('get', `/holidays?from=${today}&to=${addDays(today, 30)}`, teacher).expect(200)
    ).body;
    expect(listed.map((x: { name: string }) => x.name)).toEqual(['Diwali break']);
    await api('patch', `/holidays/${h.id}`)
      .send({
        academicYearId: yearId,
        name: 'Diwali',
        startDate: addDays(today, 10),
        endDate: addDays(today, 11),
      })
      .expect(200);
    await api('delete', `/holidays/${h.id}`).expect(204);
    expect((await api('get', '/holidays').expect(200)).body).toEqual([]);
  });

  it('locks attendance on a holiday until the holiday is removed', async () => {
    const h = (
      await api('post', '/holidays')
        .send({ academicYearId: yearId, name: 'Founders’ Day', startDate: today, endDate: today })
        .expect(201)
    ).body;
    const sheet = (
      await api('get', `/attendance/sheet?sectionId=${secA}&date=${today}`, teacher).expect(200)
    ).body;
    expect(sheet).toMatchObject({
      canEdit: false,
      lockedReason: "Founders’ Day is a school holiday, so attendance isn't taken.",
    });
    await api('put', '/attendance/sheet', teacher)
      .send({
        sectionId: secA,
        date: today,
        entries: enA.map((enrolmentId) => ({ enrolmentId, status: 'PRESENT' })),
      })
      .expect(403);
    await api('delete', `/holidays/${h.id}`).expect(204);
    await api('put', '/attendance/sheet', teacher)
      .send({
        sectionId: secA,
        date: today,
        entries: enA.map((enrolmentId) => ({ enrolmentId, status: 'PRESENT' })),
      })
      .expect(200);
  });

  it('orders My classes: class-teacher class first, then by period, with the day’s periods', async () => {
    const list = (await api('get', '/teacher/sections', teacher).expect(200)).body as {
      sectionId: string;
      isClassTeacher: boolean;
      periods: { periodNumber: number; startTime: string; subjectName: string }[];
      scheduleDate: string;
      scheduleIsToday: boolean;
    }[];
    expect(list.map((s) => s.sectionId)).toEqual([secA, secC, secB]);
    const expectedDay = scheduleDate(today, new Set([1, 2, 3, 4, 5, 6]), []);
    expect(list[0]).toMatchObject({ isClassTeacher: true, periods: [], scheduleDate: expectedDay });
    expect(list[1].periods).toEqual([
      {
        periodNumber: 1,
        startTime: '08:00',
        endTime: '08:40',
        subjectName: 'Mathematics',
        roomLabel: null,
      },
    ]);
    expect(list[2].periods[0]).toMatchObject({ periodNumber: 2, startTime: '08:50' });
    expect(list[0].scheduleIsToday).toBe(isoWeekday(today) !== 7);

    // A holiday on the schedule day moves the schedule to the next school day.
    await api('post', '/holidays')
      .send({
        academicYearId: yearId,
        name: 'Holiday',
        startDate: expectedDay,
        endDate: expectedDay,
      })
      .expect(201);
    const after = (await api('get', '/teacher/sections', teacher).expect(200)).body;
    expect(after[0].scheduleDate).toBe(
      scheduleDate(today, new Set([1, 2, 3, 4, 5, 6]), [
        { startDate: expectedDay!, endDate: expectedDay! },
      ]),
    );
    expect(after[0].scheduleIsToday).toBe(false);
  });

  it('shows today’s attendance and this month’s % on the class list', async () => {
    let roster = (await api('get', `/teacher/sections/${secA}/students`, teacher).expect(200)).body;
    expect(
      roster.map((r: { attendanceToday: string | null; monthPercent: number | null }) => [
        r.attendanceToday,
        r.monthPercent,
      ]),
    ).toEqual([
      [null, null],
      [null, null],
    ]);
    await api('put', '/attendance/sheet', teacher)
      .send({
        sectionId: secA,
        date: today,
        entries: [
          { enrolmentId: enA[0], status: 'LATE' },
          { enrolmentId: enA[1], status: 'ABSENT' },
        ],
      })
      .expect(200);
    roster = (await api('get', `/teacher/sections/${secA}/students`, teacher).expect(200)).body;
    expect(
      roster.map((r: { fullName: string; attendanceToday: string; monthPercent: number }) => [
        r.fullName,
        r.attendanceToday,
        r.monthPercent,
      ]),
    ).toEqual([
      ['Aarav Sharma', 'LATE', 100],
      ['Bhavya Sharma', 'ABSENT', 0],
    ]);
  });

  it('adds the section id to timetable entries', async () => {
    const tt = (await api('get', '/timetables/mine', teacher).expect(200)).body;
    expect(new Set(tt.entries.map((e: { sectionId: string }) => e.sectionId))).toEqual(
      new Set([secB, secC]),
    );
  });
});
