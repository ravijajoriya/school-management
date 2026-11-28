import request from 'supertest';
import { schoolDate } from '../src/common/utils/content.js';
import { StudentsService } from '../src/modules/students/students.service.js';
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

describe('Admin panel: vehicle crew, service history, student and staff lists (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
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

  const employee = async (firstName: string, designation: string, extra: object = {}) =>
    (
      await api('post', '/employees')
        .send({ firstName, lastName: 'Test', designation, joiningDate: '2018-04-01', ...extra })
        .expect(201)
    ).body.id as string;

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    teacher = (await login(ctx.http, TEACHER.email, TEACHER.password)).token;
  });

  describe('vehicle crew', () => {
    let driver: string;
    let driver2: string;
    let conductor: string;
    let conductor2: string;
    let clerk: string;

    beforeEach(async () => {
      driver = await employee('Bhanwar', 'Driver', {
        licenceNumber: 'RJ14 20110034567',
        licenceExpiry: addDays(today, 20),
      });
      driver2 = await employee('Mohan', 'Bus Driver');
      conductor = await employee('Gopal', 'Conductor');
      conductor2 = await employee('Suresh', 'Conductor');
      clerk = await employee('Ramesh', 'Accountant');
    });

    it('requires a driver and conductor with the right designation and a valid licence', async () => {
      const base = { registrationNumber: 'RJ14 PA 1111', vehicleType: 'Bus', capacity: 40 };
      const missing = await api('post', '/transport/vehicles').send(base).expect(400);
      expect(missing.body.message).toEqual([
        'driverEmployeeId: Choose the driver',
        'conductorEmployeeId: Choose the conductor',
      ]);
      // An inactive vehicle may be saved without crew.
      await api('post', '/transport/vehicles')
        .send({ ...base, registrationNumber: 'RJ14 PA 0000', status: 'INACTIVE' })
        .expect(201);

      const wrongRole = await api('post', '/transport/vehicles')
        .send({ ...base, driverEmployeeId: clerk, conductorEmployeeId: conductor })
        .expect(400);
      expect(wrongRole.body.message).toEqual([
        'driverEmployeeId: Ramesh Test is a Accountant. Only staff with the designation Driver can be chosen.',
      ]);
      const noLicence = await api('post', '/transport/vehicles')
        .send({ ...base, driverEmployeeId: driver2, conductorEmployeeId: conductor })
        .expect(400);
      expect(noLicence.body.message).toEqual([
        "driverEmployeeId: Add Mohan Test's driving licence number and expiry in their staff record first",
      ]);
      await api('post', '/transport/vehicles')
        .send({ ...base, driverEmployeeId: driver, conductorEmployeeId: driver })
        .expect(400);

      const bus = (
        await api('post', '/transport/vehicles')
          .send({ ...base, driverEmployeeId: driver, conductorEmployeeId: conductor })
          .expect(201)
      ).body;
      expect(bus).toMatchObject({
        driver: { fullName: 'Bhanwar Test', licenceStatus: 'EXPIRING' },
        conductor: { fullName: 'Gopal Test' },
        crewMissing: false,
      });

      // One active vehicle per person.
      await api('patch', `/employees/${driver2}`)
        .send({ licenceNumber: 'RJ14 20150078912', licenceExpiry: addDays(today, 500) })
        .expect(200);
      const taken = await api('post', '/transport/vehicles')
        .send({
          registrationNumber: 'RJ14 PB 2222',
          driverEmployeeId: driver2,
          conductorEmployeeId: conductor,
        })
        .expect(400);
      expect(taken.body.message).toEqual([
        'conductorEmployeeId: Gopal Test is already the conductor of RJ14 PA 1111',
      ]);
      await api('post', '/transport/vehicles')
        .send({
          registrationNumber: 'RJ14 PB 2222',
          driverEmployeeId: driver2,
          conductorEmployeeId: conductor2,
        })
        .expect(201);

      // An expired licence blocks the driver.
      await api('patch', `/employees/${driver}`)
        .send({ licenceExpiry: addDays(today, -1) })
        .expect(200);
      const expired = await api('patch', `/transport/vehicles/${bus.id}`)
        .send({ ...base, driverEmployeeId: driver, conductorEmployeeId: conductor })
        .expect(400);
      expect(expired.body.message[0]).toMatch(/driving licence expired on/);

      // Crew can't leave while still on an active vehicle.
      const leaving = await api('patch', `/employees/${conductor}`)
        .send({ status: 'LEFT' })
        .expect(409);
      expect(leaving.body.message).toMatch(/conductor of RJ14 PA 1111/);

      const options = (await api('get', '/transport/crew-options').expect(200)).body;
      expect(options.drivers.map((d: { fullName: string }) => d.fullName)).toEqual([
        'Bhanwar Test',
        'Mohan Test',
      ]);
      expect(options.conductors[0]).toMatchObject({
        fullName: 'Gopal Test',
        onVehicle: { registrationNumber: 'RJ14 PA 1111' },
      });
      await api('get', '/transport/crew-options', teacher).expect(403);

      // The database also refuses an active vehicle without crew.
      await expect(
        ctx.prisma.vehicle.update({ where: { id: bus.id }, data: { conductorEmployeeId: null } }),
      ).rejects.toThrow();
    });

    it('keeps a service history with parts, staff and odometer checks', async () => {
      const bus = (
        await api('post', '/transport/vehicles')
          .send({
            registrationNumber: 'RJ14 PA 1111',
            driverEmployeeId: driver,
            conductorEmployeeId: conductor,
          })
          .expect(201)
      ).body;
      const service = (body: object) =>
        api('post', `/transport/vehicles/${bus.id}/services`).send({
          serviceDate: addDays(today, -40),
          garageName: 'Shree Ram Motors',
          odometerKm: 43_000,
          nextServiceKm: 48_000,
          nextServiceDate: addDays(today, 5),
          labourCost: 1800,
          invoiceNumber: 'SRM/1',
          parts: [
            { partName: 'Engine oil', quantity: 2, cost: 3600 },
            { partName: 'Oil filter', cost: 650.5 },
          ],
          staffIds: [driver, conductor],
          ...body,
        });
      const first = (await service({}).expect(201)).body;
      expect(first).toMatchObject({
        odometerKm: 43_000,
        labourCost: 1800,
        partsCost: 4250.5,
        totalCost: 6050.5,
        kmSincePrevious: null,
        staff: [{ fullName: 'Bhanwar Test' }, { fullName: 'Gopal Test' }],
      });
      expect(first.parts).toHaveLength(2);

      // Readings can't go backwards; next service must be ahead; no future dates.
      const back = await service({ serviceDate: addDays(today, -10), odometerKm: 42_000 }).expect(
        400,
      );
      expect(back.body.message[0]).toMatch(/earlier service was recorded at 43,000 km/);
      await service({ odometerKm: 44_000, nextServiceKm: 44_000 }).expect(400);
      await service({ serviceDate: addDays(today, 1) }).expect(400);
      await api('post', `/transport/vehicles/${bus.id}/services`, teacher)
        .send({ serviceDate: today, odometerKm: 1 })
        .expect(403);

      const second = (
        await service({
          serviceDate: addDays(today, -2),
          odometerKm: 47_800,
          nextServiceKm: 52_800,
          nextServiceDate: addDays(today, 3),
          parts: [],
          labourCost: 500,
          staffIds: [driver],
        }).expect(201)
      ).body;
      expect(second).toMatchObject({ kmSincePrevious: 4_800, totalCost: 500 });

      const detail = (await api('get', `/transport/vehicles/${bus.id}`).expect(200)).body;
      expect(detail.services.map((x: { odometerKm: number }) => x.odometerKm)).toEqual([
        47_800, 43_000,
      ]);
      expect(detail).toMatchObject({
        lastService: { odometerKm: 47_800 },
        nextServiceKm: 52_800,
        serviceDue: true,
        serviceTotals: { count: 2, totalCost: 6550.5 },
      });

      // Edit replaces parts and staff; delete removes the record.
      const edited = (
        await api('patch', `/transport/services/${first.id}`)
          .send({
            serviceDate: first.serviceDate,
            odometerKm: 43_000,
            labourCost: 2000,
            parts: [{ partName: 'Air filter', cost: 1150 }],
            staffIds: [conductor],
          })
          .expect(200)
      ).body;
      expect(edited).toMatchObject({ totalCost: 3150, staff: [{ fullName: 'Gopal Test' }] });
      await api('delete', `/transport/services/${second.id}`).expect(204);
      const after = (await api('get', `/transport/vehicles/${bus.id}`).expect(200)).body;
      expect(after.services).toHaveLength(1);
      expect(after.serviceTotals.totalCost).toBe(3150);
    });
  });

  it('lists students with admission month, pending fees and both filters', async () => {
    const y = Number(today.slice(0, 4));
    const yearId = (
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
    const sectionId = (
      await api('post', '/sections')
        .send({ academicYearId: yearId, classId, name: 'A' })
        .expect(201)
    ).body.id;
    const student = async (firstName: string, enrolmentDate: string) => {
      const s = (
        await api('post', '/students')
          .send({
            firstName,
            lastName: 'Sharma',
            dateOfBirth: '2015-05-14',
            guardians: [
              {
                fullName: 'Ramesh Sharma',
                relationship: 'FATHER',
                phone: '9829012345',
                isPrimary: true,
              },
            ],
            enrolment: { academicYearId: yearId, sectionId, enrolmentDate },
          })
          .expect(201)
      ).body;
      return { id: s.id as string, enrolmentId: s.enrolments[0].id as string };
    };
    const early = addDays(today, -80);
    const aarav = await student('Aarav', early);
    const bhavya = await student('Bhavya', today);
    const head = (
      await api('post', '/fees/heads').send({ code: 'EXAM', name: 'Exam fee' }).expect(201)
    ).body.id;
    // Aarav owes 500 now (1000 due, 500 paid) and 700 later; Bhavya only owes in the future.
    const due = (
      await api('post', `/fees/enrolments/${aarav.enrolmentId}/charges`)
        .send({
          feeHeadId: head,
          description: 'Exam fee',
          amount: 1000,
          dueDate: addDays(today, -1),
        })
        .expect(201)
    ).body;
    await api('post', `/fees/enrolments/${aarav.enrolmentId}/charges`)
      .send({ feeHeadId: head, description: 'Later', amount: 700, dueDate: addDays(today, 30) })
      .expect(201);
    await api('post', `/fees/enrolments/${bhavya.enrolmentId}/charges`)
      .send({ feeHeadId: head, description: 'Later', amount: 900, dueDate: addDays(today, 30) })
      .expect(201);
    await api('post', '/fees/payments')
      .send({
        enrolmentId: aarav.enrolmentId,
        paymentDate: today,
        amountReceived: 500,
        paymentMode: 'CASH',
        allocations: [{ dueId: due.id, amount: 500 }],
      })
      .expect(201);

    const list = async (q = '') =>
      (await api('get', `/students?status=ACTIVE${q}`).expect(200)).body.items as {
        fullName: string;
        admissionDate: string;
        pendingFees: number | null;
      }[];
    expect((await list()).map((s) => [s.fullName, s.admissionDate, s.pendingFees])).toEqual([
      ['Aarav Sharma', early, 500],
      ['Bhavya Sharma', today, 0],
    ]);
    expect((await list('&pendingFees=YES')).map((s) => s.fullName)).toEqual(['Aarav Sharma']);
    expect((await list('&pendingFees=NO')).map((s) => s.fullName)).toEqual(['Bhavya Sharma']);
    const [ey, em] = early.split('-').map(Number);
    expect(
      (await list(`&admissionYear=${ey}&admissionMonth=${em}`)).map((s) => s.fullName),
    ).toContain('Aarav Sharma');
    expect(
      (await list(`&admissionYear=${ey}&admissionMonth=${em}`)).map((s) => s.fullName),
    ).not.toContain('Bhavya Sharma');
    expect((await api('get', '/students/admission-years').expect(200)).body).toContain(ey);

    // Without fees permission the amount is hidden and the pending filter ignored.
    const page = await ctx.app
      .get(StudentsService)
      .list({ page: 1, pageSize: 20, pendingFees: 'YES' }, { withFees: false });
    expect(page.items.map((s) => s.pendingFees)).toEqual([null, null]);
  });

  it('lists staff on leave today first, and filters to them', async () => {
    const amit = await employee('Amit', 'TGT');
    await employee('Bina', 'TGT');
    const zoya = await employee('Zoya', 'PRT');
    const leave = async (employeeId: string, startDate: string, endDate: string) =>
      ctx.prisma.leaveRequest.create({
        data: {
          employeeId,
          leaveType: 'SICK',
          startDate: new Date(`${startDate}T00:00:00Z`),
          endDate: new Date(`${endDate}T00:00:00Z`),
          reason: 'Fever',
          status: 'APPROVED',
          reviewedBy: (await ctx.prisma.user.findFirstOrThrow({ where: { email: ADMIN.email } }))
            .id,
          reviewedAt: new Date(),
        },
      });
    await leave(zoya, addDays(today, -1), addDays(today, 1));
    await leave(amit, addDays(today, 2), addDays(today, 3)); // future: not on leave today

    const all = (await api('get', '/employees?pageSize=2').expect(200)).body;
    expect(all.total).toBe(3);
    expect(all.items.map((e: { firstName: string }) => e.firstName)).toEqual(['Zoya', 'Amit']);
    expect(all.items[0].onLeave).toMatchObject({ leaveType: 'SICK', endDate: addDays(today, 1) });
    const page2 = (await api('get', '/employees?pageSize=2&page=2').expect(200)).body;
    expect(page2.items.map((e: { firstName: string }) => e.firstName)).toEqual(['Bina']);
    const onLeave = (await api('get', '/employees?onLeave=true').expect(200)).body;
    expect(onLeave.items.map((e: { firstName: string }) => e.firstName)).toEqual(['Zoya']);
  });

  it('filters staff by role, offering every role that has a user', async () => {
    const amit = await employee('Amit', 'TGT', { email: 'amit@test.local' });
    await employee('Bina', 'TGT');
    const [adminRole, teacherRole] = await Promise.all([
      ctx.prisma.role.findFirstOrThrow({ where: { name: 'Administrator' } }),
      ctx.prisma.role.findFirstOrThrow({ where: { name: 'Teacher' } }),
    ]);
    await api('post', `/employees/${amit}/create-login`)
      .send({ roleIds: [teacherRole.id] })
      .expect(201);
    // A role nobody has is not offered.
    await ctx.prisma.role.create({ data: { code: 'LIBRARIAN', name: 'Librarian' } });

    // Same user counts as the Roles page; logins without a staff record are listed separately.
    const options = (await api('get', '/employees/role-options').expect(200)).body;
    const roles = (await api('get', '/roles').expect(200)).body as {
      id: string;
      userCount: number;
    }[];
    expect(
      options.map((o: { name: string; userCount: number; staffCount: number }) => [
        o.name,
        o.userCount,
        o.staffCount,
      ]),
    ).toEqual([
      ['Administrator', 1, 0],
      ['Teacher', 2, 1],
    ]);
    for (const o of options) expect(o.userCount).toBe(roles.find((r) => r.id === o.id)!.userCount);
    expect(options[0].usersWithoutStaff).toEqual([
      expect.objectContaining({ fullName: expect.any(String), login: ADMIN.email }),
    ]);
    expect(options[1].usersWithoutStaff.map((u: { login: string }) => u.login)).toEqual([
      TEACHER.email,
    ]);
    await api('get', '/employees/role-options', teacher).expect(403);

    const list = (await api('get', `/employees?roleId=${teacherRole.id}`).expect(200)).body;
    expect(list.items.map((e: { firstName: string }) => e.firstName)).toEqual(['Amit']);
    expect(list.items[0].roles).toEqual([{ id: teacherRole.id, name: 'Teacher' }]);
    expect((await api('get', `/employees?roleId=${adminRole.id}`).expect(200)).body.total).toBe(0);
    const all = (await api('get', '/employees').expect(200)).body;
    expect(all.items.find((e: { firstName: string }) => e.firstName === 'Bina').roles).toEqual([]);
  });
});
