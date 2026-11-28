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
const monthOf = (day: string, delta = 0) => {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
};

describe('School operations: transport, complaints, meetings, inventory, payroll, certificates, ID cards (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
  let teacherUserId: string;
  let yearId: string;
  let secA: string;
  let secB: string;
  let teacherEmp: string;
  let otherEmp: string;
  /** Students: A1, A2 (section A, the teacher's class); B1 (section B). */
  let st: Record<'A1' | 'A2' | 'B1', { studentId: string; enrolmentId: string }>;
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
    teacherUserId = t.body.user.id;
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
    const classId = (await ctx.prisma.class.findFirstOrThrow({ where: { name: 'Class 5' } })).id;
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
    await api('patch', `/employees/${teacherEmp}/user`).send({ userId: teacherUserId }).expect(200);
    otherEmp = (
      await api('post', '/employees')
        .send({
          firstName: 'Ramesh',
          lastName: 'Yadav',
          designation: 'Driver',
          joiningDate: '2018-04-01',
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
    const reg = async (firstName: string, gender: string, sectionId: string) => {
      const body = (
        await api('post', '/students')
          .send({
            firstName,
            lastName: 'Sharma',
            gender,
            dateOfBirth: '2016-05-14',
            guardians: [
              {
                fullName: 'Ramesh Sharma',
                relationship: 'FATHER',
                phone: '9829012345',
                isPrimary: true,
              },
              { fullName: 'Sunita Sharma', relationship: 'MOTHER', phone: '9829012346' },
            ],
            enrolment: { academicYearId: yearId, sectionId, enrolmentDate: addDays(today, -60) },
          })
          .expect(201)
      ).body;
      return { studentId: body.id as string, enrolmentId: body.enrolments[0].id as string };
    };
    st = {
      A1: await reg('Aarav', 'MALE', secA),
      A2: await reg('Bhavya', 'FEMALE', secA),
      B1: await reg('Dev', 'MALE', secB),
    };
  });

  // --- Transport -------------------------------------------------------------------------------

  it('manages vehicles, routes and stops and assigns students without double-booking', async () => {
    await api('get', '/transport/routes', teacher).expect(403);
    await api('patch', `/employees/${otherEmp}`)
      .send({ licenceNumber: 'rj14 20180012345', licenceExpiry: addDays(today, 400) })
      .expect(200);
    const conductor = (
      await api('post', '/employees')
        .send({ firstName: 'Gopal', designation: 'Conductor', joiningDate: '2019-04-01' })
        .expect(201)
    ).body.id;
    const vehicle = (
      await api('post', '/transport/vehicles')
        .send({
          registrationNumber: 'rj 14  pa 1234',
          vehicleType: 'Van',
          capacity: 2,
          insuranceExpiry: addDays(today, 10),
          driverEmployeeId: otherEmp,
          conductorEmployeeId: conductor,
        })
        .expect(201)
    ).body;
    expect(vehicle).toMatchObject({
      registrationNumber: 'RJ 14 PA 1234',
      documentsDue: true,
      driver: { fullName: 'Ramesh Yadav', licenceNumber: 'RJ14 20180012345', licenceStatus: 'OK' },
      conductor: { fullName: 'Gopal' },
      crewMissing: false,
    });
    const dup = await api('post', '/transport/vehicles')
      .send({ registrationNumber: 'RJ 14 PA 1234', status: 'INACTIVE' })
      .expect(409);
    expect(dup.body.message).toEqual([
      'registrationNumber: A vehicle with this registration number already exists',
    ]);

    const route = (
      await api('post', '/transport/routes')
        .send({
          name: 'Route 1 – Vaishali Nagar',
          vehicleId: vehicle.id,
          stops: [
            { name: 'Gandhi Path', pickupTime: '07:05', dropTime: '14:10' },
            { name: 'Amrapali Circle', pickupTime: '07:15' },
          ],
        })
        .expect(201)
    ).body;
    expect(
      route.stops.map((s: { name: string; sequenceNo: number }) => [s.name, s.sequenceNo]),
    ).toEqual([
      ['Gandhi Path', 1],
      ['Amrapali Circle', 2],
    ]);
    // The crew comes from the vehicle.
    expect(route.vehicle.driver.fullName).toBe('Ramesh Yadav');
    expect(route.vehicle.conductor.fullName).toBe('Gopal');
    const [gandhi, amrapali] = route.stops;
    await api('post', '/transport/routes').send({ name: 'route 1 – vaishali nagar' }).expect(409);
    await api('post', '/transport/routes')
      .send({ name: 'Route 2', stops: [{ name: 'X Stop' }, { name: 'x stop' }] })
      .expect(400);

    const a1 = (
      await api('post', '/transport/assignments')
        .send({
          enrolmentId: st.A1.enrolmentId,
          routeId: route.id,
          routeStopId: gandhi.id,
          startDate: addDays(today, -10),
        })
        .expect(201)
    ).body;
    expect(a1).toMatchObject({
      status: 'ACTIVE',
      stop: { name: 'Gandhi Path', pickupTime: '07:05' },
    });
    await api('post', '/transport/assignments')
      .send({
        enrolmentId: st.A2.enrolmentId,
        routeId: route.id,
        routeStopId: amrapali.id,
        startDate: today,
      })
      .expect(201);
    // Van seats two: a third student is refused.
    const full = await api('post', '/transport/assignments')
      .send({ enrolmentId: st.B1.enrolmentId, routeId: route.id, startDate: today })
      .expect(409);
    expect(full.body.message).toContain('is full');
    // A stop of another route is rejected.
    const r2 = (
      await api('post', '/transport/routes')
        .send({ name: 'Route 2', stops: [{ name: 'Sodala' }] })
        .expect(201)
    ).body;
    await api('post', '/transport/assignments')
      .send({
        enrolmentId: st.B1.enrolmentId,
        routeId: route.id,
        routeStopId: r2.stops[0].id,
        startDate: today,
      })
      .expect(400);

    // Changing route ends the old assignment the day before.
    await api('post', '/transport/assignments')
      .send({
        enrolmentId: st.A1.enrolmentId,
        routeId: r2.id,
        routeStopId: r2.stops[0].id,
        startDate: addDays(today, 5),
      })
      .expect(201);
    const history = (
      await api(
        'get',
        `/transport/assignments?studentId=${st.A1.studentId}&includeEnded=true`,
      ).expect(200)
    ).body;
    expect(history).toHaveLength(2);
    expect(
      history.find((h: { route: { name: string } }) => h.route.name === 'Route 1 – Vaishali Nagar')
        .endDate,
    ).toBe(addDays(today, 4));
    // Overlap is refused by the database.
    const overlap = await api('post', '/transport/assignments')
      .send({ enrolmentId: st.A1.enrolmentId, routeId: route.id, startDate: addDays(today, 5) })
      .expect(409);
    expect(overlap.body.message[0]).toContain('already has transport');

    const sheet = (await api('get', `/transport/assignments?routeId=${route.id}`).expect(200)).body;
    expect(sheet.map((s: { student: { fullName: string } }) => s.student.fullName)).toEqual([
      'Aarav Sharma',
      'Bhavya Sharma',
    ]);
    const listed = (await api('get', '/transport/routes').expect(200)).body;
    expect(listed.find((r: { id: string }) => r.id === route.id)).toMatchObject({ students: 2 });

    // A used stop can't be removed; renaming and reordering is fine.
    await api('patch', `/transport/routes/${route.id}`)
      .send({
        name: route.name,
        vehicleId: vehicle.id,
        stops: [{ id: gandhi.id, name: 'Gandhi Path' }],
      })
      .expect(409);
    const renamed = (
      await api('patch', `/transport/routes/${route.id}`)
        .send({
          name: route.name,
          stops: [
            { id: amrapali.id, name: 'Gandhi Path' },
            { id: gandhi.id, name: 'Amrapali Circle' },
          ],
        })
        .expect(200)
    ).body;
    expect(renamed.stops.map((s: { id: string }) => s.id)).toEqual([amrapali.id, gandhi.id]);

    const ended = (
      await api('post', `/transport/assignments/${history[0].id}/end`)
        .send({ endDate: addDays(today, 30) })
        .expect(200)
    ).body;
    expect(ended.endDate).toBe(addDays(today, 30));
  });

  // --- Complaints ------------------------------------------------------------------------------

  it('logs complaints with reference numbers, assignment and audited resolution', async () => {
    const c = (
      await api('post', '/complaints')
        .send({
          category: 'TRANSPORT',
          subject: 'Bus late every morning',
          description: 'Route 1 bus arrives 20 minutes late.',
          submittedByName: 'Ramesh Sharma',
          contactPhone: '98290 12345',
        })
        .expect(201)
    ).body;
    expect(c.referenceNumber).toMatch(/^CMP-\d{4}-00001$/);
    expect(c).toMatchObject({ status: 'OPEN', contactPhone: '9829012345' });
    await api('post', '/complaints', teacher)
      .send({ category: 'OTHER', subject: 'x y z', description: 'abcdef' })
      .expect(403);

    // The teacher does not handle complaints, so can't be assigned.
    await api('patch', `/complaints/${c.id}`).send({ assignedTo: teacherUserId }).expect(400);
    const assignees = (await api('get', '/complaints/assignees').expect(200)).body;
    expect(assignees.map((a: { fullName: string }) => a.fullName)).toEqual(['Test Admin']);
    await api('patch', `/complaints/${c.id}`)
      .send({ assignedTo: assignees[0].id, status: 'IN_PROGRESS' })
      .expect(200);

    const noNotes = await api('patch', `/complaints/${c.id}`)
      .send({ status: 'RESOLVED' })
      .expect(400);
    expect(noNotes.body.message).toEqual(['resolutionNotes: Write how the complaint was resolved']);
    const resolved = (
      await api('patch', `/complaints/${c.id}`)
        .send({ status: 'RESOLVED', resolutionNotes: 'Driver briefed; timing fixed.' })
        .expect(200)
    ).body;
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.history.map((h: { action: string }) => h.action)).toEqual([
      'Logged',
      'Updated',
      'Updated',
    ]);
    expect(resolved.history[1].detail).toContain('assigned to Test Admin');

    // The database refuses a resolved complaint without notes even if the API is bypassed.
    await expect(
      ctx.prisma.complaint.update({ where: { id: c.id }, data: { resolutionNotes: null } }),
    ).rejects.toThrow();

    const second = (
      await api('post', '/complaints')
        .send({ category: 'FEES', subject: 'Receipt missing', description: 'No receipt given.' })
        .expect(201)
    ).body;
    expect(second.referenceNumber).toMatch(/-00002$/);
    const list = (await api('get', '/complaints?status=OPEN').expect(200)).body;
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([second.id]);
    const summary = (await api('get', '/complaints/summary').expect(200)).body;
    expect(summary).toMatchObject({
      total: 2,
      byStatus: { OPEN: 1, RESOLVED: 1 },
      byCategory: { FEES: 1, TRANSPORT: 1 },
    });
  });

  // --- Parent–teacher meetings -----------------------------------------------------------------

  it('lets teachers schedule meetings only for their own students and the office see all', async () => {
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const m = (
      await api('post', '/meetings', teacher)
        .send({
          enrolmentId: st.A1.enrolmentId,
          meetingAt: at,
          venue: 'Class 5 A',
          purpose: 'Maths progress',
        })
        .expect(201)
    ).body;
    expect(m).toMatchObject({
      status: 'SCHEDULED',
      teacher: { fullName: 'Anil Meena' },
      guardian: { fullName: 'Ramesh Sharma' },
    });
    // Section B is not the teacher's class.
    await api('post', '/meetings', teacher)
      .send({ enrolmentId: st.B1.enrolmentId, meetingAt: at })
      .expect(403);
    // The same slot twice is refused.
    const clash = await api('post', '/meetings', teacher)
      .send({ enrolmentId: st.A2.enrolmentId, meetingAt: at })
      .expect(409);
    expect(clash.body.message).toEqual([
      'meetingAt: The teacher already has a meeting at this time',
    ]);
    await api('post', '/meetings', teacher)
      .send({
        enrolmentId: st.A2.enrolmentId,
        meetingAt: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .expect(400);

    // The office schedules for another teacher; the teacher does not see it.
    await api('post', '/meetings')
      .send({ enrolmentId: st.B1.enrolmentId, teacherEmployeeId: otherEmp, meetingAt: at })
      .expect(201);
    expect((await api('get', '/meetings').expect(200)).body.total).toBe(2);
    const mine = (await api('get', '/meetings', teacher).expect(200)).body;
    expect(mine.items.map((i: { id: string }) => i.id)).toEqual([m.id]);

    await api('patch', `/meetings/${m.id}`, teacher).send({ status: 'COMPLETED' }).expect(400);
    const done = (
      await api('patch', `/meetings/${m.id}`, teacher)
        .send({ status: 'COMPLETED', notes: 'Agreed on extra practice.' })
        .expect(200)
    ).body;
    expect(done.status).toBe('COMPLETED');
    await api('patch', `/meetings/${m.id}`, teacher).send({ status: 'CANCELLED' }).expect(409);
  });

  // --- Inventory -------------------------------------------------------------------------------

  it('keeps an asset register with automatic codes and a summary', async () => {
    const cat = (
      await api('post', '/inventory/categories').send({ name: 'IT equipment' }).expect(201)
    ).body;
    await api('post', '/inventory/categories').send({ name: 'it EQUIPMENT' }).expect(409);
    const item = (
      await api('post', '/inventory/items')
        .send({
          categoryId: cat.id,
          name: 'Desktop computer',
          quantity: 12,
          unit: 'pcs',
          location: 'Computer lab',
          purchaseCost: '420000.50',
          purchaseDate: '2025-06-01',
        })
        .expect(201)
    ).body;
    expect(item).toMatchObject({
      assetCode: 'AST-00001',
      quantity: 12,
      purchaseCost: 420000.5,
      conditionStatus: 'GOOD',
    });
    await api('post', '/inventory/items')
      .send({ categoryId: cat.id, name: 'Projector', quantity: 1, assetCode: 'ast-00001' })
      .expect(409);
    const projector = (
      await api('post', '/inventory/items')
        .send({
          categoryId: cat.id,
          name: 'Projector',
          quantity: 1,
          assetCode: 'proj-01',
          conditionStatus: 'NEEDS_REPAIR',
          purchaseCost: 30000,
        })
        .expect(201)
    ).body;
    expect(projector.assetCode).toBe('PROJ-01');
    await api('post', '/inventory/items')
      .send({ categoryId: cat.id, name: 'Bad', quantity: -1 })
      .expect(400);

    const summary = (await api('get', '/inventory/summary').expect(200)).body;
    expect(summary.categories[0]).toMatchObject({
      name: 'IT equipment',
      items: 2,
      quantity: 13,
      value: 450000.5,
      needsAttention: 1,
    });
    const found = (await api('get', '/inventory/items?search=lab').expect(200)).body;
    expect(found.items.map((i: { name: string }) => i.name)).toEqual(['Desktop computer']);

    await api('delete', `/inventory/categories/${cat.id}`).expect(409);
    await api('delete', `/inventory/items/${projector.id}`).expect(204);
    await api('get', '/inventory/items', teacher).expect(403);
  });

  // --- Payroll ---------------------------------------------------------------------------------

  it('runs simple monthly payroll: pre-fill, edit, approve, lock, pay and payslips', async () => {
    const components = (await api('get', '/payroll/components').expect(200)).body as {
      id: string;
      name: string;
    }[];
    expect(components.length).toBeGreaterThanOrEqual(9);
    const comp = (n: string) => components.find((c) => c.name === n)!.id;

    const lastMonth = monthOf(today, -1);
    const run = (await api('post', '/payroll/runs').send({ month: lastMonth }).expect(201)).body;
    expect(run).toMatchObject({ status: 'DRAFT', totals: { employees: 2, net: 0 } });
    await api('post', '/payroll/runs').send({ month: lastMonth }).expect(409);
    const anil = run.records.find(
      (r: { employee: { id: string } }) => r.employee.id === teacherEmp,
    );

    const tooMuch = await api('put', `/payroll/runs/${run.id}/records/${anil.id}`)
      .send({
        lines: [
          { salaryComponentId: comp('Basic pay'), amount: 1000 },
          { salaryComponentId: comp('Provident fund (PF)'), amount: 2000 },
        ],
      })
      .expect(400);
    expect(tooMuch.body.message).toEqual(['lines: Deductions cannot be more than earnings']);
    const saved = (
      await api('put', `/payroll/runs/${run.id}/records/${anil.id}`)
        .send({
          lines: [
            { salaryComponentId: comp('Basic pay'), amount: 30000 },
            { salaryComponentId: comp('House rent allowance (HRA)'), amount: 4500.5 },
            { salaryComponentId: comp('Provident fund (PF)'), amount: 1800 },
            { salaryComponentId: comp('ESI'), amount: 0 },
          ],
        })
        .expect(200)
    ).body;
    const rec = saved.records.find((r: { id: string }) => r.id === anil.id);
    expect(rec).toMatchObject({ gross: 34500.5, deductions: 1800, net: 32700.5 });
    expect(rec.lines).toHaveLength(3);

    // Remove the driver, approve, then everything is locked (API and database).
    const ramesh = run.records.find(
      (r: { employee: { id: string } }) => r.employee.id === otherEmp,
    );
    await api('delete', `/payroll/runs/${run.id}/records/${ramesh.id}`).expect(200);
    await api('post', `/payroll/runs/${run.id}/approve`).expect(200);
    await api('put', `/payroll/runs/${run.id}/records/${anil.id}`).send({ lines: [] }).expect(409);
    await api('delete', `/payroll/runs/${run.id}`).expect(409);
    await expect(
      ctx.prisma.payrollItem.updateMany({
        where: { payrollRecordId: anil.id },
        data: { amount: '1.00' },
      }),
    ).rejects.toThrow(); // restrict_violation from the guard trigger

    // The teacher sees the approved payslip; reopening hides it again.
    const mine = (await api('get', '/payroll/mine', teacher).expect(200)).body;
    expect(mine).toEqual([{ id: anil.id, month: lastMonth, status: 'APPROVED', net: 32700.5 }]);
    await api('get', `/payroll/runs/${run.id}`, teacher).expect(403);
    await api('post', `/payroll/runs/${run.id}/reopen`).send({}).expect(400);
    await api('post', `/payroll/runs/${run.id}/reopen`)
      .send({ reason: 'HRA correction' })
      .expect(200);
    expect((await api('get', '/payroll/mine', teacher).expect(200)).body).toEqual([]);
    await api('get', `/payroll/mine/${anil.id}`, teacher).expect(404);
    await api('post', `/payroll/runs/${run.id}/approve`).expect(200);
    const paid = (await api('post', `/payroll/runs/${run.id}/pay`).expect(200)).body;
    expect(paid.status).toBe('PAID');
    await api('post', `/payroll/runs/${run.id}/reopen`).send({ reason: 'too late' }).expect(409);
    await expect(
      ctx.prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'DRAFT' } }),
    ).rejects.toThrow(); // restrict_violation from the guard trigger

    const slip = (await api('get', `/payroll/mine/${anil.id}`, teacher).expect(200)).body;
    expect(slip).toMatchObject({
      employee: { fullName: 'Anil Meena', designation: 'TGT' },
      gross: 34500.5,
      totalDeductions: 1800,
      net: 32700.5,
      netInWords: 'Rupees Thirty Two Thousand Seven Hundred and Fifty Paise Only',
    });
    expect(slip.earnings.map((e: { name: string }) => e.name)).toEqual([
      'Basic pay',
      'House rent allowance (HRA)',
    ]);

    // Next month is pre-filled from the latest payroll (the driver had none, so starts empty).
    const next = (
      await api('post', '/payroll/runs')
        .send({ month: monthOf(today) })
        .expect(201)
    ).body;
    const pre = next.records.find(
      (r: { employee: { id: string } }) => r.employee.id === teacherEmp,
    );
    expect(pre).toMatchObject({ gross: 34500.5, net: 32700.5 });
    expect(
      next.records.find((r: { employee: { id: string } }) => r.employee.id === otherEmp).net,
    ).toBe(0);
    await api('delete', `/payroll/runs/${next.id}`).expect(204);
  });

  // --- Certificates ----------------------------------------------------------------------------

  it('issues numbered, frozen certificates and enforces the TC rules', async () => {
    const templates = (await api('get', '/certificates/templates').expect(200)).body as {
      id: string;
      code: string;
    }[];
    expect(templates.map((t) => t.code).sort()).toEqual(['BONAFIDE', 'CHARACTER', 'TC']);
    const tpl = (code: string) => templates.find((t) => t.code === code)!.id;
    await api('get', '/certificates/templates', teacher).expect(403);

    const bad = await api('patch', `/certificates/templates/${tpl('BONAFIDE')}`)
      .send({
        code: 'BONAFIDE',
        name: 'Bonafide Certificate',
        templateHtml: 'Hello {{student_name}} {{shoe_size}}',
      })
      .expect(400);
    expect(bad.body.message).toEqual(['templateHtml: Unknown placeholder {{shoe_size}}']);

    await api('post', '/certificates')
      .send({ templateId: tpl('BONAFIDE'), studentId: st.A2.studentId })
      .expect(400);
    const year = today.slice(0, 4);
    const b1 = (
      await api('post', '/certificates')
        .send({
          templateId: tpl('BONAFIDE'),
          studentId: st.A2.studentId,
          purpose: 'passport application',
        })
        .expect(201)
    ).body;
    expect(b1.certificateNumber).toBe(`BONAFIDE/${year}/0001`);
    expect(b1.snapshot.title).toBe('Bonafide Certificate');
    expect(b1.snapshot.paragraphs[0]).toContain('Bhavya Sharma, daughter of Ramesh Sharma');
    expect(b1.snapshot.paragraphs[1]).toMatch(
      /^Her date of birth as per school records is 14 May 2016\./,
    );
    const b2 = (
      await api('post', '/certificates')
        .send({ templateId: tpl('BONAFIDE'), studentId: st.A2.studentId, purpose: 'bank account' })
        .expect(201)
    ).body;
    expect(b2).toMatchObject({
      certificateNumber: `BONAFIDE/${year}/0002`,
      snapshot: { title: 'Bonafide Certificate (Duplicate)' },
    });

    // Editing the template later never changes an issued certificate.
    await api('patch', `/certificates/templates/${tpl('BONAFIDE')}`)
      .send({
        code: 'BONAFIDE',
        name: 'Bonafide Certificate',
        templateHtml: 'Changed wording for {{student_name}}.',
      })
      .expect(200);
    expect(
      (await api('get', `/certificates/${b1.id}`).expect(200)).body.snapshot.paragraphs[0],
    ).toContain('daughter of');
    await expect(ctx.prisma.certificateIssue.delete({ where: { id: b1.id } })).rejects.toThrow(); // restrict_violation from the guard trigger

    // TC: only after leaving, and only with no dues.
    const notLeft = await api('post', '/certificates')
      .send({ templateId: tpl('TC'), studentId: st.A1.studentId })
      .expect(409);
    expect(notLeft.body.message).toContain('transfer or withdrawal');
    const head = (
      await api('post', '/fees/heads').send({ code: 'MISC', name: 'Miscellaneous' }).expect(201)
    ).body;
    await api('post', `/fees/enrolments/${st.A1.enrolmentId}/charges`)
      .send({ feeHeadId: head.id, description: 'Lab breakage', amount: 500 })
      .expect(201);
    await api('post', `/enrolments/${st.A1.enrolmentId}/transfer`)
      .send({ exitDate: today, reason: 'Family moved to Kota' })
      .expect(200);
    const owed = await api('post', '/certificates')
      .send({ templateId: tpl('TC'), studentId: st.A1.studentId })
      .expect(409);
    expect(owed.body.message).toContain('₹500 in fees is still due');
    const due = await ctx.prisma.studentFeeDue.findFirstOrThrow({
      where: { studentEnrolmentId: st.A1.enrolmentId },
    });
    await api('post', '/fees/payments')
      .send({
        enrolmentId: st.A1.enrolmentId,
        paymentDate: today,
        amountReceived: 500,
        paymentMode: 'CASH',
        allocations: [{ dueId: due.id, amount: 500 }],
      })
      .expect(201);
    const tc = (
      await api('post', '/certificates')
        .send({ templateId: tpl('TC'), studentId: st.A1.studentId, conduct: 'very good' })
        .expect(201)
    ).body;
    expect(tc.certificateNumber).toBe(`TC/${year}/0001`);
    expect(tc.snapshot.paragraphs.join(' ')).toContain('Reason for leaving: Family moved to Kota.');
    expect(tc.snapshot.paragraphs[2]).toContain('His conduct and character were very good.');

    const list = (await api('get', `/certificates?studentId=${st.A2.studentId}`).expect(200)).body;
    expect(list.total).toBe(2);
  });

  // --- ID cards --------------------------------------------------------------------------------

  it('prints student ID cards per section and staff cards for all active staff', async () => {
    const templates = (await api('get', '/id-cards/templates').expect(200)).body as {
      id: string;
      audience: string;
    }[];
    const studentTpl = templates.find((t) => t.audience === 'STUDENT')!;
    const staffTpl = templates.find((t) => t.audience === 'STAFF')!;
    await api('post', '/id-cards/batches')
      .send({ templateId: studentTpl.id, sectionIds: [] })
      .expect(400);
    const batch = (
      await api('post', '/id-cards/batches')
        .send({ templateId: studentTpl.id, sectionIds: [secA] })
        .expect(201)
    ).body;
    expect(batch).toMatchObject({ cardCount: 2, label: 'Class 5 – A' });
    expect(
      batch.people.map((p: { name: string; line1: string; phone: string }) => [
        p.name,
        p.line1,
        p.phone,
      ]),
    ).toEqual([
      ['Aarav Sharma', 'Class 5 – A', '9829012345'],
      ['Bhavya Sharma', 'Class 5 – A', '9829012345'],
    ]);
    const staff = (
      await api('post', '/id-cards/batches').send({ templateId: staffTpl.id }).expect(201)
    ).body;
    expect(staff).toMatchObject({ cardCount: 2, label: 'All active staff' });
    expect((await api('get', '/id-cards/batches').expect(200)).body).toHaveLength(2);

    const edited = (
      await api('patch', `/id-cards/templates/${studentTpl.id}`)
        .send({
          name: 'Student card 2026',
          audience: 'STUDENT',
          layout: { color: '#004466', showAddress: true },
        })
        .expect(200)
    ).body;
    expect(edited.layout).toMatchObject({ color: '#004466', showAddress: true, showPhoto: true });
    await api('get', '/id-cards/batches', teacher).expect(403);
    await api('get', `/id-cards/photos/${st.A1.studentId}`).expect(404);
  });
});
