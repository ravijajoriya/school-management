import { DEFAULT_GRADE_BANDS } from '@school/shared';
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

describe('Examinations, results & timetable (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
  let yearId: string;
  let classId: string;
  let secA: string;
  let secB: string;
  let teacherEmp: string;
  let otherEmp: string;
  let cs: { maths: string; science: string; computer: string };
  /** Enrolments: A1, A2, A3 in section A; B1 in section B. */
  let en: Record<'A1' | 'A2' | 'A3' | 'B1', string>;
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
          startDate: addDays(today, -90),
          endDate: addDays(today, 200),
        })
        .expect(201)
    ).body.id;
    await api('post', `/academic-years/${yearId}/activate`).expect(200);
    classId = (await ctx.prisma.class.findFirstOrThrow({ where: { name: 'Class 10' } })).id;
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
    otherEmp = (
      await api('post', '/employees')
        .send({
          firstName: 'Neha',
          lastName: 'Agarwal',
          designation: 'TGT',
          joiningDate: '2016-07-01',
        })
        .expect(201)
    ).body.id;
    secA = (
      await api('post', '/sections')
        .send({ academicYearId: yearId, classId, name: 'A', classTeacherId: teacherEmp })
        .expect(201)
    ).body.id;
    secB = (
      await api('post', '/sections')
        .send({ academicYearId: yearId, classId, name: 'B' })
        .expect(201)
    ).body.id;
    const subj = async (name: string) =>
      (await api('post', '/subjects').send({ name }).expect(201)).body.id;
    const [m, s, c] = [await subj('Mathematics'), await subj('Science'), await subj('Computer')];
    const set = (
      await api('put', '/class-subjects')
        .send({
          academicYearId: yearId,
          classId,
          subjects: [{ subjectId: m }, { subjectId: s }, { subjectId: c, subjectType: 'OPTIONAL' }],
        })
        .expect(200)
    ).body as { id: string; subject: { name: string } }[];
    const byName = (n: string) => set.find((x) => x.subject.name === n)!.id;
    cs = { maths: byName('Mathematics'), science: byName('Science'), computer: byName('Computer') };
    await api('post', '/teacher-assignments')
      .send({
        academicYearId: yearId,
        employeeId: teacherEmp,
        sectionId: secA,
        classSubjectId: cs.maths,
      })
      .expect(201);
    const reg = async (firstName: string, sectionId: string) =>
      (
        await api('post', '/students')
          .send({
            firstName,
            lastName: 'Sharma',
            dateOfBirth: '2011-05-10',
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
      ).body.enrolments[0].id as string;
    en = {
      A1: await reg('Aarav', secA),
      A2: await reg('Bhavya', secA),
      A3: await reg('Chirag', secA),
      B1: await reg('Dev', secB),
    };
    await api('post', '/exams/grading-scales')
      .send({ name: 'Standard 8-point', bands: DEFAULT_GRADE_BANDS })
      .expect(201);
  });

  /** Half-yearly: Maths 100; Science Theory 70 (pass 23) + Practical 30 (pass 10); Computer 50 (optional). */
  const setUpExam = async () => {
    const exam = (
      await api('post', '/exams')
        .send({
          academicYearId: yearId,
          classId,
          name: 'Half-yearly',
          examType: 'HALF_YEARLY',
          startDate: addDays(today, -10),
          endDate: addDays(today, -5),
        })
        .expect(201)
    ).body;
    const withSubjects = (
      await api('put', `/exams/${exam.id}/subjects`)
        .send({
          subjects: [
            { classSubjectId: cs.maths, maxMarks: 100 },
            { classSubjectId: cs.science, componentName: 'Theory', maxMarks: 70, passMarks: 23 },
            { classSubjectId: cs.science, componentName: 'Practical', maxMarks: 30, passMarks: 10 },
            { classSubjectId: cs.computer, maxMarks: 50 },
          ],
        })
        .expect(200)
    ).body;
    const id = (label: string) =>
      withSubjects.subjects.find((s: { label: string }) => s.label === label).id as string;
    return {
      examId: exam.id as string,
      maths: id('Mathematics'),
      sciT: id('Science — Theory'),
      sciP: id('Science — Practical'),
      comp: id('Computer'),
    };
  };

  const enter = (
    examSubjectId: string,
    sectionId: string,
    entries: { enrolmentId: string; marks: number | null; isAbsent?: boolean }[],
    token = admin,
  ) => api('put', '/exams/marks/sheet', token).send({ examSubjectId, sectionId, entries });
  const submitAndApprove = async (examSubjectId: string, sectionId: string) => {
    await api('post', '/exams/marks/submit').send({ examSubjectId, sectionId }).expect(200);
    await api('post', '/exams/marks/review')
      .send({ examSubjectId, sectionId, decision: 'APPROVE' })
      .expect(200);
  };

  it('runs the marks workflow with teacher scope, submission and approval', async () => {
    const e = await setUpExam();
    await api('post', '/exams')
      .send({ academicYearId: yearId, classId, name: 'Half-yearly', examType: 'HALF_YEARLY' })
      .expect(409);
    await api('post', `/exams/${e.examId}/status`).send({ status: 'MARKS_ENTRY' }).expect(400); // must be scheduled first
    await api('post', `/exams/${e.examId}/status`).send({ status: 'SCHEDULED' }).expect(200);
    await enter(e.maths, secA, [{ enrolmentId: en.A1, marks: 50 }], teacher).expect(403); // not open yet
    await api('post', `/exams/${e.examId}/status`).send({ status: 'MARKS_ENTRY' }).expect(200);
    await api('put', `/exams/${e.examId}/subjects`)
      .send({ subjects: [{ classSubjectId: cs.maths, maxMarks: 50 }] })
      .expect(400);

    // The Maths teacher of 10 A — not Science, not section B.
    const sheet = (
      await api(
        'get',
        `/exams/marks/sheet?examSubjectId=${e.maths}&sectionId=${secA}`,
        teacher,
      ).expect(200)
    ).body;
    expect(sheet).toMatchObject({ canEdit: true, summary: { students: 3, notEntered: 3 } });
    await api(
      'get',
      `/exams/marks/sheet?examSubjectId=${e.sciT}&sectionId=${secA}`,
      teacher,
    ).expect(403);
    await enter(e.maths, secB, [{ enrolmentId: en.B1, marks: 50 }], teacher).expect(403);

    await enter(e.maths, secA, [{ enrolmentId: en.A1, marks: 101 }], teacher).expect(400);
    await enter(
      e.maths,
      secA,
      [
        { enrolmentId: en.A1, marks: 90 },
        { enrolmentId: en.A2, marks: 30 },
      ],
      teacher,
    ).expect(200);
    await api('post', '/exams/marks/submit', teacher)
      .send({ examSubjectId: e.maths, sectionId: secA })
      .expect(400); // Chirag missing
    expect(
      (
        await enter(
          e.maths,
          secA,
          [{ enrolmentId: en.A3, marks: null, isAbsent: true }],
          teacher,
        ).expect(200)
      ).body,
    ).toEqual({ saved: 1, cleared: 0 });
    await api('post', '/exams/marks/submit', teacher)
      .send({ examSubjectId: e.maths, sectionId: secA })
      .expect(200);
    await enter(e.maths, secA, [{ enrolmentId: en.A2, marks: 35 }], teacher).expect(400); // already submitted

    // Teachers cannot approve; the office returns it, the teacher fixes and resubmits.
    await api('post', '/exams/marks/review', teacher)
      .send({ examSubjectId: e.maths, sectionId: secA, decision: 'APPROVE' })
      .expect(403);
    await api('post', '/exams/marks/review')
      .send({
        examSubjectId: e.maths,
        sectionId: secA,
        decision: 'RETURN',
        remarks: 'Check Bhavya',
      })
      .expect(200);
    await enter(e.maths, secA, [{ enrolmentId: en.A2, marks: 32 }], teacher).expect(200);
    await api('post', '/exams/marks/submit', teacher)
      .send({ examSubjectId: e.maths, sectionId: secA })
      .expect(200);
    await api('post', '/exams/marks/review')
      .send({ examSubjectId: e.maths, sectionId: secA, decision: 'APPROVE' })
      .expect(200);

    const tasks = (await api('get', '/exams/marks/my-tasks', teacher).expect(200)).body;
    expect(tasks).toEqual([
      expect.objectContaining({
        subjectLabel: 'Mathematics',
        sectionName: 'A',
        entered: 3,
        status: 'APPROVED',
      }),
    ]);
    const after = (
      await api(
        'get',
        `/exams/marks/sheet?examSubjectId=${e.maths}&sectionId=${secA}`,
        teacher,
      ).expect(200)
    ).body;
    expect(after.rows.find((r: { enrolmentId: string }) => r.enrolmentId === en.A2)).toMatchObject({
      marks: 32,
      status: 'APPROVED',
      approvedBy: 'Test Admin',
    });
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'marks.returned', reason: 'Check Bhavya' },
      }),
    ).toBe(1);
  });

  it('finalises only complete, approved marks, then locks results and computes them correctly', async () => {
    const e = await setUpExam();
    await api('post', `/exams/${e.examId}/status`).send({ status: 'SCHEDULED' }).expect(200);
    await api('post', `/exams/${e.examId}/status`).send({ status: 'MARKS_ENTRY' }).expect(200);
    await enter(e.maths, secA, [
      { enrolmentId: en.A1, marks: 90 },
      { enrolmentId: en.A2, marks: 30 },
      { enrolmentId: en.A3, marks: null, isAbsent: true },
    ]).expect(200);
    await enter(e.sciT, secA, [
      { enrolmentId: en.A1, marks: 60 },
      { enrolmentId: en.A2, marks: 40 },
      { enrolmentId: en.A3, marks: 50 },
    ]).expect(200);
    await enter(e.sciP, secA, [
      { enrolmentId: en.A1, marks: 25 },
      { enrolmentId: en.A2, marks: 20 },
      { enrolmentId: en.A3, marks: 9 },
    ]).expect(200);
    await enter(e.comp, secA, [{ enrolmentId: en.A1, marks: 40 }]).expect(200); // optional: only Aarav took it

    const early = await api('post', `/exams/${e.examId}/finalize`).expect(400);
    expect(early.body.message.join(' ')).toMatch(/not yet approved/);
    for (const s of [e.maths, e.sciT, e.sciP, e.comp]) await submitAndApprove(s, secA);
    const missingB = await api('post', `/exams/${e.examId}/finalize`).expect(400);
    expect(missingB.body.message.join(' ')).toMatch(/Class 10 – B: 1 student\(s\) without marks/);
    await enter(e.maths, secB, [{ enrolmentId: en.B1, marks: 70 }]).expect(200);
    await enter(e.sciT, secB, [{ enrolmentId: en.B1, marks: 50 }]).expect(200);
    await enter(e.sciP, secB, [{ enrolmentId: en.B1, marks: 20 }]).expect(200);
    for (const s of [e.maths, e.sciT, e.sciP]) await submitAndApprove(s, secB);

    // Results before finalising are previews; compute and check them.
    const res = (
      await api('get', `/exams/results?examinationId=${e.examId}&sectionId=${secA}`).expect(200)
    ).body;
    const [aarav, bhavya, chirag] = res.students;
    // Aarav: 90 + (60+25) + 40 = 215 / 250 = 86% → A2, pass, first division, rank 1
    expect(aarav).toMatchObject({
      fullName: 'Aarav Sharma',
      obtained: 215,
      max: 250,
      percentage: 86,
      grade: 'A2',
      result: 'PASS',
      division: 'First division',
      rank: 1,
    });
    // Bhavya: Maths 30 < 33 → fail; Computer not taken → left out (max 200)
    expect(bhavya).toMatchObject({ obtained: 90, max: 200, result: 'FAIL', rank: null });
    expect(bhavya.subjects.map((s: { subjectName: string }) => s.subjectName)).toEqual([
      'Mathematics',
      'Science',
    ]);
    // Chirag: absent in Maths and practical 9 < 10 → fail
    expect(chirag).toMatchObject({ result: 'FAIL' });
    expect(chirag.subjects[1].components[1]).toMatchObject({
      name: 'Practical',
      obtained: 9,
      pass: 10,
      passed: false,
    });
    const maths = res.subjects.find(
      (s: { subjectName: string }) => s.subjectName === 'Mathematics',
    );
    expect(maths).toMatchObject({ appeared: 3, passed: 1, passPercent: 33.3, highest: 90 });
    expect(res.overall).toMatchObject({ students: 3, passed: 1, failed: 2, incomplete: 0 });

    const final = (await api('post', `/exams/${e.examId}/finalize`).expect(200)).body;
    expect(final.status).toBe('FINALIZED');
    expect(final.gradingScale.name).toBe('Standard 8-point');
    expect(await ctx.prisma.markEntry.count({ where: { status: 'FINAL' } })).toBe(13);

    // Locked: API and database both refuse changes.
    await enter(e.maths, secA, [{ enrolmentId: en.A2, marks: 40 }]).expect(403);
    await api('post', `/exams/${e.examId}/status`).send({ status: 'SCHEDULED' }).expect(400);
    await api('patch', `/exams/${e.examId}`).send({ name: 'Renamed' }).expect(400);
    const mark = await ctx.prisma.markEntry.findFirstOrThrow({
      where: { studentEnrolmentId: en.A2 },
    });
    await expect(
      ctx.prisma.markEntry.update({ where: { id: mark.id }, data: { marksObtained: '99.00' } }),
    ).rejects.toThrow();
    await expect(ctx.prisma.markEntry.delete({ where: { id: mark.id } })).rejects.toThrow();
    await expect(
      ctx.prisma.examination.update({ where: { id: e.examId }, data: { name: 'x' } }),
    ).rejects.toThrow();
    const scale = (await api('get', '/exams/grading-scales').expect(200)).body[0];
    expect(scale.locked).toBe(true);
    await api('put', `/exams/grading-scales/${scale.id}`)
      .send({ name: 'Changed', bands: DEFAULT_GRADE_BANDS })
      .expect(400);
    await expect(
      ctx.prisma.gradeBand.deleteMany({ where: { gradingScaleId: scale.id } }),
    ).rejects.toThrow();

    // Report card (class teacher can see their own section only).
    const card = (await api('get', `/exams/${e.examId}/report-cards/${en.A1}`, teacher).expect(200))
      .body;
    expect(card).toMatchObject({
      exam: { final: true },
      classTeacher: 'Anil Meena',
      sectionSize: 3,
      result: { percentage: 86, rank: 1 },
    });
    await api('get', `/exams/results?examinationId=${e.examId}&sectionId=${secB}`, teacher).expect(
      403,
    );
    await api('get', `/exams/${e.examId}/report-cards/${en.B1}`, teacher).expect(403);
  });

  it('validates grading scales and exam set-up', async () => {
    const gap = await api('post', '/exams/grading-scales')
      .send({
        name: 'Broken',
        bands: [
          { minPercentage: 0, maxPercentage: 50, gradeLabel: 'B' },
          { minPercentage: 60, maxPercentage: 100, gradeLabel: 'A' },
        ],
      })
      .expect(400);
    expect(gap.body.message.join(' ')).toMatch(/no gaps or overlaps/);
    const otherClass = await ctx.prisma.class.findFirstOrThrow({ where: { name: 'Class 9' } });
    const subj = await ctx.prisma.subject.findFirstOrThrow({ where: { name: 'Mathematics' } });
    const foreign = await ctx.prisma.classSubject.create({
      data: { academicYearId: yearId, classId: otherClass.id, subjectId: subj.id },
    });
    const exam = (
      await api('post', '/exams')
        .send({ academicYearId: yearId, classId, name: 'Unit test 1', examType: 'UNIT_TEST' })
        .expect(201)
    ).body;
    await api('put', `/exams/${exam.id}/subjects`)
      .send({ subjects: [{ classSubjectId: foreign.id, maxMarks: 25 }] })
      .expect(400);
    await api('put', `/exams/${exam.id}/subjects`)
      .send({ subjects: [{ classSubjectId: cs.maths, maxMarks: 25, passMarks: 30 }] })
      .expect(400);
    await api('post', '/exams', teacher)
      .send({ academicYearId: yearId, classId, name: 'x', examType: 'UNIT_TEST' })
      .expect(403);
  });

  it('publishes timetables only without teacher clashes and shows each teacher their week', async () => {
    const lesson = (
      dayOfWeek: number,
      periodNumber: number,
      startTime: string,
      endTime: string,
      extra: object = {},
    ) => ({
      dayOfWeek,
      periodNumber,
      startTime,
      endTime,
      ...extra,
    });
    const ttA = (
      await api('post', '/timetables').send({ sectionId: secA, name: 'Term 1' }).expect(201)
    ).body;
    await api('put', `/timetables/${ttA.id}/entries`)
      .send({
        entries: [
          lesson(1, 1, '08:00', '08:40', {
            classSubjectId: cs.maths,
            teacherEmployeeId: teacherEmp,
            roomLabel: '101',
          }),
          lesson(1, 2, '08:40', '09:20', {
            classSubjectId: cs.science,
            teacherEmployeeId: otherEmp,
          }),
          lesson(1, 3, '09:20', '09:40', { isBreak: true }),
        ],
      })
      .expect(200);
    // A subject from another class is refused; a break cannot have a teacher.
    const otherClass = await ctx.prisma.class.findFirstOrThrow({ where: { name: 'Class 9' } });
    const subj = await ctx.prisma.subject.findFirstOrThrow({ where: { name: 'Science' } });
    const foreign = await ctx.prisma.classSubject.create({
      data: { academicYearId: yearId, classId: otherClass.id, subjectId: subj.id },
    });
    await api('put', `/timetables/${ttA.id}/entries`)
      .send({ entries: [lesson(1, 1, '08:00', '08:40', { classSubjectId: foreign.id })] })
      .expect(400);
    await api('put', `/timetables/${ttA.id}/entries`)
      .send({
        entries: [lesson(1, 1, '08:00', '08:40', { isBreak: true, teacherEmployeeId: teacherEmp })],
      })
      .expect(400);
    await api('post', `/timetables/${ttA.id}/publish`).expect(200);
    await api('put', `/timetables/${ttA.id}/entries`).send({ entries: [] }).expect(400); // published = frozen

    // 10 B wants the same teacher at an overlapping time → blocked with a clear message.
    const ttB = (
      await api('post', '/timetables').send({ sectionId: secB, name: 'Term 1' }).expect(201)
    ).body;
    await api('put', `/timetables/${ttB.id}/entries`)
      .send({
        entries: [
          lesson(1, 1, '08:20', '09:00', {
            classSubjectId: cs.maths,
            teacherEmployeeId: teacherEmp,
          }),
        ],
      })
      .expect(200);
    const clashes = (await api('get', `/timetables/${ttB.id}/clashes`).expect(200)).body;
    expect(clashes).toEqual([
      expect.objectContaining({ kind: 'TEACHER', dayOfWeek: 1, periodNumber: 1 }),
    ]);
    const blocked = await api('post', `/timetables/${ttB.id}/publish`).expect(409);
    expect(blocked.body.message[0]).toMatch(
      /Anil Meena is already teaching Class 10 – A on Monday period 1/,
    );
    await api('put', `/timetables/${ttB.id}/entries`)
      .send({
        entries: [
          lesson(1, 4, '09:40', '10:20', {
            classSubjectId: cs.maths,
            teacherEmployeeId: teacherEmp,
          }),
        ],
      })
      .expect(200);
    await api('post', `/timetables/${ttB.id}/publish`).expect(200);

    // A new version for 10 A (copied) replaces the old one when published.
    const v2 = (
      await api('post', '/timetables')
        .send({ sectionId: secA, name: 'Term 2', copyFromId: ttA.id })
        .expect(201)
    ).body;
    expect(v2.entries).toHaveLength(3);
    await api('post', `/timetables/${v2.id}/publish`).expect(200);
    const list = (
      await api('get', `/timetables?academicYearId=${yearId}&sectionId=${secA}`).expect(200)
    ).body;
    expect(
      list.map((t: { name: string; status: string }) => `${t.name}:${t.status}`).sort(),
    ).toEqual(['Term 1:ARCHIVED', 'Term 2:PUBLISHED']);
    await expect(
      ctx.prisma.timetable.update({ where: { id: ttA.id }, data: { status: 'PUBLISHED' } }),
    ).rejects.toThrow();

    const mine = (await api('get', '/timetables/mine', teacher).expect(200)).body;
    expect(
      mine.entries.map(
        (x: { sectionName: string; startTime: string }) => `${x.sectionName} ${x.startTime}`,
      ),
    ).toEqual(['A 08:00', 'B 09:40']);
    await api('post', '/timetables', teacher).send({ sectionId: secA, name: 'x' }).expect(403);
  });
});
