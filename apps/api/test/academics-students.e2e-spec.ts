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

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe('Academic structure, staff & students (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
  let classIds: Record<string, string>;
  let yearId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    teacher = (await login(ctx.http, TEACHER.email, TEACHER.password)).token;
    const classes = await ctx.prisma.class.findMany();
    classIds = Object.fromEntries(classes.map((c) => [c.name, c.id]));
    yearId = (await createYear('2026-2027', '2026-04-01', '2027-03-31')).id;
    await api('post', `/academic-years/${yearId}/activate`).expect(200);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const api = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, token = admin) =>
    request(ctx.http)
      [method](API + path)
      .set(bearer(token));

  const createYear = async (name: string, startDate: string, endDate: string) =>
    (await api('post', '/academic-years').send({ name, startDate, endDate }).expect(201)).body;

  const createSection = async (
    className: string,
    name: string,
    extra: object = {},
    year = yearId,
  ) =>
    (
      await api('post', '/sections')
        .send({ academicYearId: year, classId: classIds[className], name, ...extra })
        .expect(201)
    ).body;

  const guardian = (overrides: object = {}) => ({
    fullName: 'Ramesh Sharma',
    relationship: 'FATHER',
    phone: '98290 12345',
    isPrimary: true,
    ...overrides,
  });

  const register = async (firstName: string, sectionId?: string, extra: object = {}) =>
    (
      await api('post', '/students')
        .send({
          firstName,
          lastName: 'Sharma',
          dateOfBirth: '2016-05-10',
          gender: 'MALE',
          guardians: [guardian()],
          ...(sectionId
            ? { enrolment: { academicYearId: yearId, sectionId, enrolmentDate: '2026-04-01' } }
            : {}),
          ...extra,
        })
        .expect(201)
    ).body;

  describe('academic years', () => {
    it('validates names and dates and prevents overlaps', async () => {
      const bad = await api('post', '/academic-years')
        .send({ name: '2027-2029', startDate: '2027-04-01', endDate: '2027-03-01' })
        .expect(400);
      expect(bad.body.message.join(' ')).toMatch(
        /second year must follow.*End date must be after/s,
      );
      const overlap = await api('post', '/academic-years')
        .send({ name: '2027-2028', startDate: '2027-01-01', endDate: '2027-12-31' })
        .expect(400);
      expect(overlap.body.message[0]).toMatch(/overlap with academic year 2026-2027/);
    });

    it('keeps exactly one active year; activating the next closes the current one', async () => {
      const next = await createYear('2027-2028', '2027-04-01', '2028-03-31');
      await api('post', `/academic-years/${next.id}/activate`).expect(200);
      const years = (await api('get', '/academic-years').expect(200)).body;
      expect(years.map((y: { name: string; status: string }) => `${y.name}:${y.status}`)).toEqual([
        '2027-2028:ACTIVE',
        '2026-2027:CLOSED',
      ]);
      const active = await api('get', '/academic-years/active', teacher).expect(200);
      expect(active.body.name).toBe('2027-2028');

      // A closed year is read-only.
      const res = await api('post', '/sections')
        .send({ academicYearId: yearId, classId: classIds['Class 1'], name: 'Z' })
        .expect(400);
      expect(res.body.message).toMatch(/closed/);
    });

    it('copies sections and subjects into a new year', async () => {
      await createSection('Class 1', 'A', { capacity: 40 });
      await createSection('Class 1', 'B');
      const math = (
        await api('post', '/subjects').send({ code: 'math', name: 'Mathematics' }).expect(201)
      ).body;
      expect(math.code).toBe('MATH');
      // Subject names are unique regardless of case.
      const dupName = await api('post', '/subjects').send({ name: 'mathematics' }).expect(409);
      expect(dupName.body.message).toEqual(['name: This name is already in use']);
      await api('put', '/class-subjects')
        .send({
          academicYearId: yearId,
          classId: classIds['Class 1'],
          subjects: [{ subjectId: math.id }],
        })
        .expect(200);

      const next = await createYear('2027-2028', '2027-04-01', '2028-03-31');
      const copied = await api('post', `/academic-years/${next.id}/copy-structure`)
        .send({ fromAcademicYearId: yearId })
        .expect(200);
      expect(copied.body).toEqual({ sections: 2, classSubjects: 1 });
      const structure = (
        await api('get', `/academic-structure?academicYearId=${next.id}`).expect(200)
      ).body;
      const class1 = structure.find((c: { class: { name: string } }) => c.class.name === 'Class 1');
      expect(class1.sections.map((s: { name: string }) => s.name)).toEqual(['A', 'B']);
      expect(class1.subjects[0].subject.name).toBe('Mathematics');
    });

    it('rejects duplicate section names with a clear message', async () => {
      await createSection('Class 2', 'A');
      const dup = await api('post', '/sections')
        .send({ academicYearId: yearId, classId: classIds['Class 2'], name: 'a' })
        .expect(409);
      expect(dup.body.message).toEqual([
        'name: A section with this name already exists for this class',
      ]);
    });
  });

  describe('staff, logins & teacher assignments', () => {
    it('creates employees with automatic codes and a linked login', async () => {
      const emp = (
        await api('post', '/employees')
          .send({
            firstName: 'Meera',
            lastName: 'Joshi',
            phone: '9829000001',
            joiningDate: '2024-06-01',
            designation: 'TGT Mathematics',
          })
          .expect(201)
      ).body;
      expect(emp.employeeCode).toMatch(/^EMP-\d{4}$/);
      const teacherRole = await ctx.prisma.role.findUniqueOrThrow({ where: { code: 'TEACHER' } });
      const loginRes = await api('post', `/employees/${emp.id}/create-login`)
        .send({ roleIds: [teacherRole.id] })
        .expect(201);
      expect(loginRes.body.temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);
      const detail = (await api('get', `/employees/${emp.id}`).expect(200)).body;
      expect(detail.user.phone).toBe('9829000001');
      await api('post', `/employees/${emp.id}/create-login`)
        .send({ roleIds: [teacherRole.id] })
        .expect(409);
    });

    it('only assigns a subject to a section of the same class', async () => {
      const emp = (
        await api('post', '/employees')
          .send({ firstName: 'Anil', joiningDate: '2024-06-01', designation: 'PRT' })
          .expect(201)
      ).body;
      const s5 = await createSection('Class 5', 'A');
      const s6 = await createSection('Class 6', 'A');
      const sci = (await api('post', '/subjects').send({ name: 'Science' }).expect(201)).body;
      const [cs5] = (
        await api('put', '/class-subjects')
          .send({
            academicYearId: yearId,
            classId: classIds['Class 5'],
            subjects: [{ subjectId: sci.id }],
          })
          .expect(200)
      ).body;

      const wrong = await api('post', '/teacher-assignments')
        .send({
          academicYearId: yearId,
          employeeId: emp.id,
          sectionId: s6.id,
          classSubjectId: cs5.id,
        })
        .expect(400);
      expect(wrong.body.message[0]).toMatch(/not taught in the section's class/);
      await api('post', '/teacher-assignments')
        .send({
          academicYearId: yearId,
          employeeId: emp.id,
          sectionId: s5.id,
          classSubjectId: cs5.id,
        })
        .expect(201);
      const dup = await api('post', '/teacher-assignments')
        .send({
          academicYearId: yearId,
          employeeId: emp.id,
          sectionId: s5.id,
          classSubjectId: cs5.id,
        })
        .expect(409);
      expect(dup.body.message[0]).toMatch(/already assigned/);

      // A subject with assignments can't be removed from the class.
      await api('put', '/class-subjects')
        .send({ academicYearId: yearId, classId: classIds['Class 5'], subjects: [] })
        .expect(409);
    });

    it('scopes the teacher portal to assigned sections only', async () => {
      const teacherUser = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: TEACHER.email },
      });
      const emp = (
        await api('post', '/employees')
          .send({
            firstName: 'Test',
            lastName: 'Teacher',
            joiningDate: '2024-06-01',
            designation: 'PRT',
          })
          .expect(201)
      ).body;
      await api('patch', `/employees/${emp.id}/user`).send({ userId: teacherUser.id }).expect(200);
      const mine = await createSection('Class 3', 'A', { classTeacherId: emp.id });
      const other = await createSection('Class 3', 'B');
      await register('Aarav', mine.id);
      await register('Kabir', other.id);

      const sections = (await api('get', '/teacher/sections', teacher).expect(200)).body;
      expect(sections).toEqual([
        expect.objectContaining({
          sectionId: mine.id,
          className: 'Class 3',
          isClassTeacher: true,
          studentCount: 1,
        }),
      ]);
      const roster = (
        await api('get', `/teacher/sections/${mine.id}/students`, teacher).expect(200)
      ).body;
      expect(roster.map((r: { fullName: string }) => r.fullName)).toEqual(['Aarav Sharma']);
      expect(roster[0].guardian.phone).toBe('9829012345');
      await api('get', `/teacher/sections/${other.id}/students`, teacher).expect(403);
    });
  });

  describe('students & enrolments', () => {
    it('registers a student with guardians and enrolment in one step', async () => {
      const section = await createSection('Class 4', 'A');
      const student = await register('Diya', section.id);
      expect(student.admissionNumber).toMatch(/^ADM-\d{4}-\d{5}$/);
      expect(student.guardians).toHaveLength(1);
      expect(student.enrolments[0]).toMatchObject({
        className: 'Class 4',
        sectionName: 'A',
        status: 'ACTIVE',
      });

      const bad = await api('post', '/students')
        .send({
          firstName: 'X',
          dateOfBirth: '2016-01-01',
          guardians: [guardian({ isPrimary: false })],
        })
        .expect(400);
      expect(bad.body.message).toEqual([
        'guardians: Mark exactly one guardian as the primary contact',
      ]);
    });

    it('searches by name, admission number or guardian phone and filters by section', async () => {
      const a = await createSection('Class 4', 'A');
      const b = await createSection('Class 4', 'B');
      await register('Diya', a.id);
      await register('Ishaan', b.id, { guardians: [guardian({ phone: '9001122334' })] });
      await register('Unplaced');

      const byPhone = (await api('get', '/students?search=90011-22334').expect(200)).body;
      expect(byPhone.items.map((s: { firstName: string }) => s.firstName)).toEqual(['Ishaan']);
      const bySection = (await api('get', `/students?sectionId=${a.id}`).expect(200)).body;
      expect(bySection.items.map((s: { firstName: string }) => s.firstName)).toEqual(['Diya']);
      const notEnrolled = (await api('get', '/students?notEnrolled=true').expect(200)).body;
      expect(notEnrolled.items.map((s: { firstName: string }) => s.firstName)).toEqual([
        'Unplaced',
      ]);
    });

    it('enforces section capacity, unique roll numbers and one enrolment per year', async () => {
      const small = await createSection('Class 7', 'A', { capacity: 1 });
      const s1 = await register('First', small.id);
      const second = await register('Second');
      const full = await api('post', `/students/${second.id}/enrolments`)
        .send({ academicYearId: yearId, sectionId: small.id, enrolmentDate: '2026-04-02' })
        .expect(409);
      expect(full.body.message).toMatch(/Section A is full \(1\/1\)/);

      const big = await createSection('Class 7', 'B');
      await api('post', `/students/${second.id}/enrolments`)
        .send({
          academicYearId: yearId,
          sectionId: big.id,
          rollNumber: '1',
          enrolmentDate: '2026-04-02',
        })
        .expect(201);
      const again = await api('post', `/students/${second.id}/enrolments`)
        .send({ academicYearId: yearId, sectionId: big.id, enrolmentDate: '2026-04-02' })
        .expect(409);
      expect(again.body.message).toEqual([
        'academicYearId: The student is already enrolled in this academic year',
      ]);

      // Move First into B with the same roll number → clash.
      const clash = await api('patch', `/enrolments/${s1.enrolments[0].id}`)
        .send({ sectionId: big.id, rollNumber: '1' })
        .expect(409);
      expect(clash.body.message).toEqual([
        'rollNumber: This roll number is already used in the section',
      ]);
    });

    it('assigns roll numbers alphabetically', async () => {
      const section = await createSection('Class 8', 'A');
      await register('Zoya', section.id);
      await register('Aditi', section.id);
      await api('post', `/sections/${section.id}/assign-roll-numbers`)
        .send({ order: 'NAME' })
        .expect(200);
      const enrolments = await ctx.prisma.studentEnrolment.findMany({
        where: { sectionId: section.id },
        include: { student: true },
        orderBy: { rollNumber: 'asc' },
      });
      expect(enrolments.map((e) => `${e.rollNumber}:${e.student.firstName}`)).toEqual([
        '1:Aditi',
        '2:Zoya',
      ]);
    });
  });

  describe('lifecycle', () => {
    it('transfers and withdraws students while keeping history', async () => {
      const section = await createSection('Class 9', 'A');
      const t = await register('Transfer', section.id);
      const w = await register('Withdraw', section.id);

      await api('post', `/enrolments/${t.enrolments[0].id}/transfer`)
        .send({ exitDate: '2026-08-15', reason: 'Family moved to Delhi' })
        .expect(200);
      await api('post', `/enrolments/${w.enrolments[0].id}/withdraw`)
        .send({ exitDate: '2026-09-01', reason: 'Parents request' })
        .expect(200);

      const td = (await api('get', `/students/${t.id}`).expect(200)).body;
      expect(td.status).toBe('INACTIVE');
      expect(td.enrolments[0]).toMatchObject({
        status: 'TRANSFERRED',
        exitDate: '2026-08-15',
        exitReason: 'Family moved to Delhi',
      });
      expect((await api('get', `/students/${w.id}`).expect(200)).body.status).toBe('WITHDRAWN');

      // Already left → no further changes.
      await api('post', `/enrolments/${t.enrolments[0].id}/withdraw`)
        .send({ exitDate: '2026-09-01', reason: 'x x x' })
        .expect(400);
      // Teachers can't run lifecycle actions.
      await api('post', `/enrolments/${w.enrolments[0].id}/transfer`, teacher)
        .send({ exitDate: '2026-09-01', reason: 'xxx' })
        .expect(403);
    });

    it('promotes, retains and completes students into the next year', async () => {
      const c5 = await createSection('Class 5', 'A');
      const c12 = await createSection('Class 12', 'A');
      const p = await register('Promoted', c5.id);
      const r = await register('Retained', c5.id);
      const g = await register('Graduate', c12.id);
      const next = await createYear('2027-2028', '2027-04-01', '2028-03-31');
      const n6 = await createSection('Class 6', 'A', {}, next.id);
      const n5 = await createSection('Class 5', 'A', {}, next.id);

      const wrong = await api('post', '/promotions')
        .send({
          toAcademicYearId: next.id,
          entries: [{ enrolmentId: p.enrolments[0].id, action: 'PROMOTE', toSectionId: n5.id }],
        })
        .expect(400);
      expect(wrong.body.message[0]).toMatch(/promotion must be to a higher class/);

      const res = await api('post', '/promotions')
        .send({
          toAcademicYearId: next.id,
          entries: [
            { enrolmentId: p.enrolments[0].id, action: 'PROMOTE', toSectionId: n6.id },
            { enrolmentId: r.enrolments[0].id, action: 'RETAIN', toSectionId: n5.id },
            { enrolmentId: g.enrolments[0].id, action: 'COMPLETE' },
          ],
        })
        .expect(200);
      expect(res.body).toEqual({ promoted: 1, retained: 1, completed: 1 });

      const pd = (await api('get', `/students/${p.id}`).expect(200)).body;
      expect(
        pd.enrolments.map(
          (e: { academicYear: { name: string }; className: string; status: string }) =>
            `${e.academicYear.name} ${e.className} ${e.status}`,
        ),
      ).toEqual(['2027-2028 Class 6 ACTIVE', '2026-2027 Class 5 PROMOTED']);
      expect(pd.enrolments[0].previousEnrolmentId).toBe(pd.enrolments[1].id);
      const gd = (await api('get', `/students/${g.id}`).expect(200)).body;
      expect(gd).toMatchObject({
        status: 'INACTIVE',
        enrolments: [expect.objectContaining({ status: 'COMPLETED' })],
      });

      // Running the same promotion again is refused.
      await api('post', '/promotions')
        .send({
          toAcademicYearId: next.id,
          entries: [{ enrolmentId: p.enrolments[0].id, action: 'PROMOTE', toSectionId: n6.id }],
        })
        .expect(400);
    });
  });

  describe('admission enquiry conversion', () => {
    it('turns an enquiry into a registered, enrolled student exactly once', async () => {
      const section = await createSection('Class 1', 'A');
      await request(ctx.http)
        .post(`${API}/public/enquiries`)
        .send({
          guardianName: 'Sunita Verma',
          phone: '9001122334',
          studentName: 'Diya Verma',
          classSoughtId: classIds['Class 1'],
        })
        .expect(201);
      const enquiry = await ctx.prisma.admissionEnquiry.findFirstOrThrow();
      const body = {
        firstName: 'Diya',
        lastName: 'Verma',
        dateOfBirth: '2020-02-02',
        guardian: { fullName: 'Sunita Verma', relationship: 'MOTHER', phone: '9001122334' },
        enrolment: { academicYearId: yearId, sectionId: section.id, enrolmentDate: '2026-04-05' },
      };
      const student = (await api('post', `/enquiries/${enquiry.id}/convert`).send(body).expect(201))
        .body;
      expect(student).toMatchObject({
        fullName: 'Diya Verma',
        enquiry: { referenceNumber: enquiry.referenceNumber },
      });
      expect(student.guardians[0]).toMatchObject({ isPrimary: true, relationship: 'MOTHER' });

      const updated = await ctx.prisma.admissionEnquiry.findUniqueOrThrow({
        where: { id: enquiry.id },
      });
      expect(updated).toMatchObject({
        status: 'ADMISSION_CONFIRMED',
        convertedStudentId: student.id,
      });
      const detail = (await api('get', `/enquiries/${enquiry.id}`).expect(200)).body;
      expect(detail.convertedStudent).toEqual({
        id: student.id,
        admissionNumber: student.admissionNumber,
        fullName: 'Diya Verma',
      });
      await api('post', `/enquiries/${enquiry.id}/convert`).send(body).expect(409);
    });
  });

  describe('private documents & permissions', () => {
    it('stores documents privately and checks the file type', async () => {
      const student = await register('Docs');
      const up = await api('post', `/students/${student.id}/documents`)
        .field('documentType', 'BIRTH_CERTIFICATE')
        .attach('file', PDF, 'birth.pdf')
        .expect(201);
      expect(up.body).toMatchObject({
        documentType: 'BIRTH_CERTIFICATE',
        mimeType: 'application/pdf',
      });

      const dl = await api('get', `/students/${student.id}/documents/${up.body.id}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(dl.headers['content-disposition']).toMatch(/attachment; filename="birth.pdf"/);
      expect(Buffer.compare(dl.body as Buffer, PDF)).toBe(0);

      const fake = await api('post', `/students/${student.id}/documents`)
        .field('documentType', 'AADHAAR')
        .attach('file', Buffer.from('not a pdf'), 'x.pdf')
        .expect(400);
      expect(fake.body.message).toEqual(['file: Only PDF, JPEG or PNG files are allowed']);
      expect(await ctx.prisma.auditLog.count({ where: { action: 'document.downloaded' } })).toBe(1);
    });

    it.each([
      ['get', '/students'],
      ['get', '/employees'],
      ['get', '/academic-years'],
      ['post', '/promotions'],
    ] as const)('teacher gets 403 on %s %s', async (method, path) => {
      await api(method, path, teacher).send({}).expect(403);
    });
  });
});
