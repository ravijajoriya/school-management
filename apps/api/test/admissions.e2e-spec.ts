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

describe('Admission enquiries & contact messages (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
  let classId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    await ctx.prisma.$executeRawUnsafe(
      'ALTER SEQUENCE "admission_enquiry_number_seq" RESTART WITH 1',
    );
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    teacher = (await login(ctx.http, TEACHER.email, TEACHER.password)).token;
    const classes = await request(ctx.http).get(`${API}/public/classes`).expect(200);
    classId = classes.body.find((c: { name: string }) => c.name === 'Class 5').id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const enquiry = (overrides: object = {}) => ({
    guardianName: 'Ramesh Sharma',
    phone: '98290 12345',
    email: 'Ramesh@Example.com',
    studentName: 'Aarav Sharma',
    classSoughtId: classId,
    message: 'Looking for admission next session.',
    ...overrides,
  });
  const submit = (body: object) => request(ctx.http).post(`${API}/public/enquiries`).send(body);

  describe('public form', () => {
    it('lists classes Nursery → Class 12 in order', async () => {
      const res = await request(ctx.http).get(`${API}/public/classes`).expect(200);
      expect(res.body).toHaveLength(15);
      expect(res.body[0].name).toBe('Nursery');
      expect(res.body[14].name).toBe('Class 12');
    });

    it('stores an enquiry and returns a reference number', async () => {
      const res = await submit(enquiry()).expect(201);
      expect(res.body.referenceNumber).toMatch(/^ENQ-\d{4}-00001$/);
      const stored = await ctx.prisma.admissionEnquiry.findFirstOrThrow();
      expect(stored).toMatchObject({
        phone: '9829012345',
        email: 'ramesh@example.com',
        status: 'NEW',
        source: 'WEBSITE',
      });
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'enquiry.submitted' },
      });
      expect(audit.userId).toBeNull();
    });

    it('validates input and the selected class', async () => {
      const res = await submit({
        guardianName: '',
        phone: '123',
        studentName: '',
        classSoughtId: '',
      }).expect(400);
      expect(res.body.message.join(' ')).toMatch(
        /parent's name.*valid phone.*child's name.*Select a class/s,
      );
      await submit(enquiry({ classSoughtId: '01a1fcd1-a539-7e81-b2d0-63901415869a' })).expect(400);
    });

    it('silently discards bot submissions that fill the honeypot', async () => {
      const res = await submit(enquiry({ website: 'http://spam.example' })).expect(201);
      expect(res.body.referenceNumber).toMatch(/^ENQ-/);
      expect(await ctx.prisma.admissionEnquiry.count()).toBe(0);
    });
  });

  describe('admin queue', () => {
    beforeEach(async () => {
      await submit(enquiry()).expect(201);
      await submit(
        enquiry({ studentName: 'Diya Verma', guardianName: 'Sunita Verma', phone: '9001122334' }),
      ).expect(201);
    });

    it('is visible to staff with enquiry permissions only', async () => {
      await request(ctx.http).get(`${API}/enquiries`).set(bearer(teacher)).expect(403);
      const res = await request(ctx.http).get(`${API}/enquiries`).set(bearer(admin)).expect(200);
      expect(res.body.total).toBe(2);
      const search = await request(ctx.http)
        .get(`${API}/enquiries?search=verma`)
        .set(bearer(admin))
        .expect(200);
      expect(search.body.items.map((e: { studentName: string }) => e.studentName)).toEqual([
        'Diya Verma',
      ]);
      const byPhone = await request(ctx.http)
        .get(`${API}/enquiries?search=98290-12345`)
        .set(bearer(admin))
        .expect(200);
      expect(byPhone.body.total).toBe(1);
    });

    it('records follow-ups, status changes and history; first action assigns the enquiry', async () => {
      const [first] = (
        await request(ctx.http).get(`${API}/enquiries?search=aarav`).set(bearer(admin))
      ).body.items;
      expect(first.assignedTo).toBeNull();

      const next = new Date(Date.now() - 60_000).toISOString();
      const res = await request(ctx.http)
        .post(`${API}/enquiries/${first.id}/follow-ups`)
        .set(bearer(admin))
        .send({
          notes: 'Called parent; visit on Saturday',
          outcome: 'Visit booked',
          status: 'VISIT_SCHEDULED',
          nextFollowUpAt: next,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        status: 'VISIT_SCHEDULED',
        assignedTo: { fullName: 'Test Admin' },
      });
      expect(res.body.followUps).toHaveLength(1);
      expect(res.body.history.map((h: { action: string }) => h.action)).toEqual([
        'enquiry.follow_up_added',
        'enquiry.submitted',
      ]);

      const summary = await request(ctx.http)
        .get(`${API}/enquiries/summary`)
        .set(bearer(admin))
        .expect(200);
      expect(summary.body).toMatchObject({
        byStatus: { NEW: 1, VISIT_SCHEDULED: 1 },
        dueFollowUps: 1,
      });

      const mine = await request(ctx.http)
        .get(`${API}/enquiries?assignedTo=me`)
        .set(bearer(admin))
        .expect(200);
      expect(mine.body.total).toBe(1);
    });

    it('only assigns enquiries to staff who can work on them', async () => {
      const [first] = (await request(ctx.http).get(`${API}/enquiries`).set(bearer(admin))).body
        .items;
      const teacherId = (
        await ctx.prisma.user.findUniqueOrThrow({ where: { email: TEACHER.email } })
      ).id;
      const bad = await request(ctx.http)
        .patch(`${API}/enquiries/${first.id}`)
        .set(bearer(admin))
        .send({ assignedToId: teacherId })
        .expect(400);
      expect(bad.body.message[0]).toMatch(/cannot work on admission enquiries/);

      const assignees = await request(ctx.http)
        .get(`${API}/enquiries/assignees`)
        .set(bearer(admin))
        .expect(200);
      expect(assignees.body.map((u: { fullName: string }) => u.fullName)).toEqual(['Test Admin']);
    });

    it('lets staff record walk-in enquiries', async () => {
      const res = await request(ctx.http)
        .post(`${API}/enquiries`)
        .set(bearer(admin))
        .send({ ...enquiry({ studentName: 'Kabir Singh' }), source: 'WALK_IN' })
        .expect(201);
      expect(res.body).toMatchObject({
        source: 'WALK_IN',
        referenceNumber: expect.stringMatching(/-00003$/),
      });
    });
  });

  describe('contact messages', () => {
    const message = {
      fullName: 'Neha Gupta',
      email: 'neha@example.com',
      phone: '9876501234',
      message: 'What are the school timings?',
    };

    it('stores messages from the contact form and lets staff mark them read', async () => {
      await request(ctx.http).post(`${API}/public/contact-messages`).send(message).expect(204);
      await request(ctx.http)
        .post(`${API}/public/contact-messages`)
        .send({ ...message, website: 'x' })
        .expect(204);
      expect(await ctx.prisma.contactMessage.count()).toBe(1);

      await request(ctx.http).get(`${API}/contact-messages`).set(bearer(teacher)).expect(403);
      const list = await request(ctx.http)
        .get(`${API}/contact-messages`)
        .set(bearer(admin))
        .expect(200);
      expect(list.body.items[0]).toMatchObject({ fullName: 'Neha Gupta', status: 'NEW' });
      const count = await request(ctx.http)
        .get(`${API}/contact-messages/unread-count`)
        .set(bearer(admin))
        .expect(200);
      expect(count.body.count).toBe(1);

      const read = await request(ctx.http)
        .patch(`${API}/contact-messages/${list.body.items[0].id}`)
        .set(bearer(admin))
        .send({ status: 'READ' })
        .expect(200);
      expect(read.body).toMatchObject({ status: 'READ', handledBy: { fullName: 'Test Admin' } });
    });
  });
});
