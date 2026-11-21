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

describe('Fees, payments & receipts (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let yearId: string;
  let classId: string;
  let sectionId: string;
  let tuitionHead: string;
  let examHead: string;
  /** Two students in Class 1 – A. */
  let s1: { studentId: string; enrolmentId: string };
  let s2: { studentId: string; enrolmentId: string };
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

  const register = async (firstName: string) => {
    const st = (
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
    return { studentId: st.id as string, enrolmentId: st.enrolments[0].id as string };
  };

  /** Creates the standard plan: tuition Q1 ₹3000 (overdue) + Q2 ₹3000 (future) + exam ₹500. */
  const createPlan = async () =>
    (
      await api('post', '/fees/structures')
        .send({
          academicYearId: yearId,
          classId,
          name: 'Class 1 fees',
          billingFrequency: 'QUARTERLY',
          items: [
            {
              feeHeadId: tuitionHead,
              amount: 3000,
              dueDate: addDays(today, -30),
              installmentLabel: 'Q1',
            },
            {
              feeHeadId: tuitionHead,
              amount: 3000,
              dueDate: addDays(today, 30),
              installmentLabel: 'Q2',
            },
            { feeHeadId: examHead, amount: 500 },
          ],
        })
        .expect(201)
    ).body;

  const ledger = async (studentId: string, token = admin) =>
    (await api('get', `/fees/students/${studentId}/ledger`, token).expect(200)).body;

  const pay = (
    enrolmentId: string,
    allocations: { dueId: string; amount: number }[],
    extra: object = {},
  ) =>
    api('post', '/fees/payments').send({
      enrolmentId,
      paymentDate: today,
      amountReceived: allocations.reduce((s, a) => s + a.amount, 0),
      paymentMode: 'CASH',
      allocations,
      ...extra,
    });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
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
    classId = (await ctx.prisma.class.findFirstOrThrow({ where: { name: 'Class 1' } })).id;
    sectionId = (
      await api('post', '/sections')
        .send({ academicYearId: yearId, classId, name: 'A' })
        .expect(201)
    ).body.id;
    tuitionHead = (
      await api('post', '/fees/heads').send({ code: 'tuition', name: 'Tuition fee' }).expect(201)
    ).body.id;
    examHead = (
      await api('post', '/fees/heads').send({ code: 'EXAM', name: 'Examination fee' }).expect(201)
    ).body.id;
    s1 = await register('Aarav');
    s2 = await register('Bhavya');
  });

  describe('set-up and billing', () => {
    it('creates plans and bills every student exactly once', async () => {
      const heads = (await api('get', '/fees/heads').expect(200)).body;
      expect(heads.map((h: { code: string }) => h.code).sort()).toEqual(['EXAM', 'TUITION']);
      await api('post', '/fees/heads').send({ code: 'EXAM', name: 'Duplicate' }).expect(409);

      const plan = await createPlan();
      expect(plan).toMatchObject({ total: 6500, studentsBilled: 0 });
      expect(plan.items.map((i: { sequenceNo: number }) => i.sequenceNo)).toEqual([1, 2, 3]);

      const first = (await api('post', `/fees/structures/${plan.id}/generate-dues`).expect(200))
        .body;
      expect(first).toEqual({ students: 2, duesCreated: 6, skipped: 0 });
      const again = (await api('post', `/fees/structures/${plan.id}/generate-dues`).expect(200))
        .body;
      expect(again).toEqual({ students: 2, duesCreated: 0, skipped: 6 });

      // A student admitted later gets the class plan with one call.
      const s3 = await register('Chirag');
      const late = (
        await api('post', `/fees/enrolments/${s3.enrolmentId}/generate-dues`).expect(200)
      ).body;
      expect(late.duesCreated).toBe(3);

      // Once billed, a plan's fees are frozen (its name can still change).
      await api('patch', `/fees/structures/${plan.id}`)
        .send({ items: [{ feeHeadId: tuitionHead, amount: 1 }] })
        .expect(400);
      await api('patch', `/fees/structures/${plan.id}`)
        .send({ name: 'Class 1 fees (revised name)' })
        .expect(200);

      const l = await ledger(s1.studentId);
      expect(l.totals).toMatchObject({ billed: 6500, paid: 0, balance: 6500, overdue: 3000 });
      expect(l.dues.map((d: { description: string }) => d.description)).toEqual([
        'Tuition fee — Q1',
        'Tuition fee — Q2',
        'Examination fee',
      ]);
    });
  });

  describe('adjustments and one-off charges', () => {
    it('applies concessions, fines and waivers within limits, with an approver', async () => {
      const plan = await createPlan();
      await api('post', `/fees/structures/${plan.id}/generate-dues`).expect(200);
      const [q1, q2, exam] = (await ledger(s1.studentId)).dues;

      const adj = (dueId: string, adjustmentType: string, amount: number) =>
        api('post', `/fees/dues/${dueId}/adjustments`).send({
          adjustmentType,
          amount,
          reason: 'Sibling concession approved',
          effectiveDate: today,
        });
      await adj(q1.id, 'CONCESSION', 3500).expect(400);
      expect((await adj(q1.id, 'CONCESSION', 300).expect(201)).body).toMatchObject({
        balance: 2700,
        status: 'OPEN',
      });
      expect((await adj(q1.id, 'FINE', 100).expect(201)).body).toMatchObject({
        balance: 2800,
        fines: 100,
      });
      expect((await adj(exam.id, 'WAIVER', 500).expect(201)).body).toMatchObject({
        balance: 0,
        status: 'WAIVED',
      });

      const row = await ctx.prisma.feeAdjustment.findFirstOrThrow({
        where: { adjustmentType: 'CONCESSION' },
      });
      const approver = await ctx.prisma.user.findUniqueOrThrow({ where: { id: row.approvedBy } });
      expect(approver.email).toBe(ADMIN.email);

      // One-off charge, deletable only while untouched.
      const charge = (
        await api('post', `/fees/enrolments/${s1.enrolmentId}/charges`)
          .send({ feeHeadId: examHead, description: 'Duplicate ID card', amount: 150 })
          .expect(201)
      ).body;
      expect(charge).toMatchObject({ fromStructure: false, canDelete: true });
      await api('delete', `/fees/dues/${charge.id}`).expect(204);
      await api('delete', `/fees/dues/${q1.id}`).expect(400);

      const t = (await ledger(s1.studentId)).totals;
      expect(t).toMatchObject({ billed: 6500, fines: 100, reductions: 800, balance: 5800 });
      void q2;
    });
  });

  describe('payments and receipts', () => {
    it('records payments with gapless receipt numbers and a frozen receipt', async () => {
      const plan = await createPlan();
      await api('post', `/fees/structures/${plan.id}/generate-dues`).expect(200);
      const [q1, , exam] = (await ledger(s1.studentId)).dues;
      const [s2q1] = (await ledger(s2.studentId)).dues;

      // Validation: totals must match, no overpaying, no other student's dues, no future dates.
      await api('post', '/fees/payments')
        .send({
          enrolmentId: s1.enrolmentId,
          paymentDate: today,
          amountReceived: 100,
          paymentMode: 'CASH',
          allocations: [{ dueId: q1.id, amount: 50 }],
        })
        .expect(400);
      await pay(s1.enrolmentId, [{ dueId: q1.id, amount: 3001 }]).expect(400);
      await pay(s1.enrolmentId, [{ dueId: s2q1.id, amount: 100 }]).expect(400);
      await pay(s1.enrolmentId, [{ dueId: q1.id, amount: 100 }], {
        paymentDate: addDays(today, 1),
      }).expect(400);
      const noCheque = await pay(s1.enrolmentId, [{ dueId: q1.id, amount: 100 }], {
        paymentMode: 'CHEQUE',
      }).expect(400);
      expect(noCheque.body.message.join(' ')).toMatch(/cheque number/);

      // Part payment across two dues.
      const first = (
        await pay(s1.enrolmentId, [
          { dueId: q1.id, amount: 1000 },
          { dueId: exam.id, amount: 500 },
        ]).expect(201)
      ).body;
      const y = today.slice(0, 4);
      expect(first.receiptNumber).toMatch(new RegExp(`^RCT/${y}-\\d{2}/00001$`));
      const second = (await pay(s2.enrolmentId, [{ dueId: s2q1.id, amount: 3000 }]).expect(201))
        .body;
      expect(second.receiptNumber).toMatch(/\/00002$/);

      const l = await ledger(s1.studentId);
      expect(l.dues.map((d: { status: string }) => d.status)).toEqual(['PARTIAL', 'OPEN', 'PAID']);
      expect(l.totals).toMatchObject({ paid: 1500, balance: 5000 });

      const receipt = (await api('get', `/fees/payments/${first.paymentId}/receipt`).expect(200))
        .body;
      expect(receipt.snapshot).toMatchObject({
        receiptNumber: first.receiptNumber,
        student: { name: 'Aarav Sharma', className: 'Class 1', sectionName: 'A' },
        total: 1500,
        totalInWords: 'Rupees One Thousand Five Hundred Only',
        balanceAfter: 5000,
        guardianName: 'Ramesh Sharma',
      });
      expect(receipt.snapshot.lines).toHaveLength(2);
    });

    it('voids, reverses and handles cheques without ever deleting a record', async () => {
      const plan = await createPlan();
      await api('post', `/fees/structures/${plan.id}/generate-dues`).expect(200);
      const [q1] = (await ledger(s1.studentId)).dues;

      const cash = (await pay(s1.enrolmentId, [{ dueId: q1.id, amount: 3000 }]).expect(201)).body;
      await api('post', `/fees/payments/${cash.paymentId}/cancel`)
        .send({ action: 'VOID', reason: 'x' })
        .expect(400);
      const voided = (
        await api('post', `/fees/payments/${cash.paymentId}/cancel`)
          .send({ action: 'VOID', reason: 'Entered twice by mistake' })
          .expect(200)
      ).body;
      expect(voided.status).toBe('VOID');
      await api('post', `/fees/payments/${cash.paymentId}/cancel`)
        .send({ action: 'VOID', reason: 'Entered twice by mistake' })
        .expect(409);
      expect((await ledger(s1.studentId)).dues[0]).toMatchObject({ status: 'OPEN', balance: 3000 });
      const r = (await api('get', `/fees/payments/${cash.paymentId}/receipt`).expect(200)).body;
      expect(r).toMatchObject({
        isCancelled: true,
        cancellationReason: 'Entered twice by mistake',
      });

      const cheque = {
        paymentMode: 'CHEQUE',
        referenceNumber: '123456',
        bankName: 'SBI',
        chequeDate: today,
      };
      const c1 = (await pay(s1.enrolmentId, [{ dueId: q1.id, amount: 1000 }], cheque).expect(201))
        .body;
      const c2 = (await pay(s1.enrolmentId, [{ dueId: q1.id, amount: 1000 }], cheque).expect(201))
        .body;
      expect((await api('get', '/fees/payments?chequeStatus=PENDING').expect(200)).body.total).toBe(
        2,
      );
      expect(
        (await api('post', `/fees/payments/${c1.paymentId}/cheque-cleared`).expect(200)).body
          .chequeStatus,
      ).toBe('CLEARED');
      await api('post', `/fees/payments/${c1.paymentId}/cheque-cleared`).expect(400);
      const bounced = (
        await api('post', `/fees/payments/${c2.paymentId}/cheque-bounced`)
          .send({ reason: 'Insufficient funds' })
          .expect(200)
      ).body;
      expect(bounced).toMatchObject({ status: 'REVERSED', chequeStatus: 'BOUNCED' });
      expect((await ledger(s1.studentId)).dues[0]).toMatchObject({
        status: 'PARTIAL',
        paid: 1000,
        balance: 2000,
      });
      expect(
        (await api('get', `/fees/payments/${c2.paymentId}/receipt`).expect(200)).body
          .cancellationReason,
      ).toBe('Cheque bounced: Insufficient funds');

      // The database itself refuses to delete or rewrite posted financial records.
      await expect(ctx.prisma.payment.delete({ where: { id: c1.paymentId } })).rejects.toThrow();
      await expect(
        ctx.prisma.payment.update({
          where: { id: c1.paymentId },
          data: { amountReceived: '1.00' },
        }),
      ).rejects.toThrow();
      await expect(
        ctx.prisma.payment.update({ where: { id: cash.paymentId }, data: { status: 'POSTED' } }),
      ).rejects.toThrow();
      await expect(
        ctx.prisma.receipt.updateMany({
          where: { paymentId: c1.paymentId },
          data: { snapshotJson: {} },
        }),
      ).rejects.toThrow();
      await expect(
        ctx.prisma.paymentAllocation.deleteMany({ where: { paymentId: c1.paymentId } }),
      ).rejects.toThrow();
      await expect(ctx.prisma.feeAdjustment.deleteMany({})).resolves.toBeDefined(); // nothing to delete — no error
      await expect(
        ctx.prisma.studentFeeDue.update({ where: { id: q1.id }, data: { amountDue: '1.00' } }),
      ).rejects.toThrow();
      expect(
        await ctx.prisma.auditLog.count({ where: { action: { startsWith: 'payment.' } } }),
      ).toBe(6);
    });
  });

  describe('reports and permissions', () => {
    it('reconciles collection, dues and concession reports', async () => {
      const plan = await createPlan();
      await api('post', `/fees/structures/${plan.id}/generate-dues`).expect(200);
      const [q1, , exam] = (await ledger(s1.studentId)).dues;
      const [s2q1] = (await ledger(s2.studentId)).dues;
      await api('post', `/fees/dues/${s2q1.id}/adjustments`)
        .send({
          adjustmentType: 'CONCESSION',
          amount: 300,
          reason: 'Sibling concession',
          effectiveDate: today,
        })
        .expect(201);
      await pay(s1.enrolmentId, [{ dueId: q1.id, amount: 3000 }]).expect(201);
      await pay(s2.enrolmentId, [{ dueId: s2q1.id, amount: 2700 }], {
        paymentMode: 'BANK_TRANSFER',
        referenceNumber: 'UTR123',
      }).expect(201);
      const mistake = (await pay(s1.enrolmentId, [{ dueId: exam.id, amount: 500 }]).expect(201))
        .body;
      await api('post', `/fees/payments/${mistake.paymentId}/cancel`)
        .send({ action: 'VOID', reason: 'Wrong student' })
        .expect(200);

      const coll = (
        await api('get', `/fees/reports/collection?from=${today}&to=${today}`).expect(200)
      ).body;
      expect(coll).toMatchObject({ total: 5700, receipts: 2, cancelled: { total: 500, count: 1 } });
      expect(coll.byMode).toEqual(
        expect.arrayContaining([
          { paymentMode: 'CASH', total: 3000, count: 1 },
          { paymentMode: 'BANK_TRANSFER', total: 2700, count: 1 },
        ]),
      );
      expect(coll.byFeeHead).toEqual([{ feeHead: 'Tuition fee', total: 5700 }]);

      const dues = (await api('get', `/fees/reports/dues?academicYearId=${yearId}`).expect(200))
        .body;
      expect(dues.totals).toMatchObject({
        billed: 13000,
        reductions: 300,
        paid: 5700,
        balance: 7000,
        overdue: 0,
      });
      const overdue = (
        await api('get', `/fees/reports/dues?academicYearId=${yearId}&overdueOnly=true`).expect(200)
      ).body;
      expect(overdue.rows).toHaveLength(0);

      const conc = (
        await api('get', `/fees/reports/concessions?from=${today}&to=${today}`).expect(200)
      ).body;
      expect(conc.totals.CONCESSION).toBe(300);
      expect(conc.rows[0]).toMatchObject({
        student: { fullName: 'Bhavya Sharma' },
        approvedBy: 'Test Admin',
      });

      const summary = (await api('get', '/fees/summary').expect(200)).body;
      expect(summary).toMatchObject({ collectedToday: 5700, receiptsToday: 2, chequesPending: 0 });
    });

    it('limits who can collect, adjust and void', async () => {
      const teacher = (await login(ctx.http, TEACHER.email, TEACHER.password)).token;
      await api('get', '/fees/heads', teacher).expect(403);
      await api('get', `/fees/students/${s1.studentId}/ledger`, teacher).expect(403);

      // An office role that can view and collect, but not adjust or void.
      const role = (
        await api('post', '/roles').send({ code: 'CASHIER', name: 'Cashier' }).expect(201)
      ).body;
      await api('put', `/roles/${role.id}/permissions`)
        .send({ permissionCodes: ['fees.read', 'fees.collect'] })
        .expect(200);
      const cashierUser = (
        await api('post', '/users')
          .send({
            fullName: 'Cashier',
            email: 'cashier@test.local',
            password: 'Cashier-Pass-1',
            roleIds: [role.id],
          })
          .expect(201)
      ).body;
      await ctx.prisma.user.update({
        where: { id: cashierUser.user.id },
        data: { mustChangePassword: false },
      });
      const cashier = (await login(ctx.http, 'cashier@test.local', 'Cashier-Pass-1')).token;

      const plan = await createPlan();
      await api('post', `/fees/structures/${plan.id}/generate-dues`).expect(200);
      const [q1] = (await ledger(s1.studentId, cashier)).dues;
      const paid = (
        await api('post', '/fees/payments', cashier)
          .send({
            enrolmentId: s1.enrolmentId,
            paymentDate: today,
            amountReceived: 100,
            paymentMode: 'CASH',
            allocations: [{ dueId: q1.id, amount: 100 }],
          })
          .expect(201)
      ).body;
      await api('post', `/fees/dues/${q1.id}/adjustments`, cashier)
        .send({
          adjustmentType: 'CONCESSION',
          amount: 10,
          reason: 'Trying without rights',
          effectiveDate: today,
        })
        .expect(403);
      await api('post', `/fees/payments/${paid.paymentId}/cancel`, cashier)
        .send({ action: 'VOID', reason: 'Trying without rights' })
        .expect(403);
      await api('post', '/fees/structures', cashier).send({}).expect(403);
    });
  });
});
