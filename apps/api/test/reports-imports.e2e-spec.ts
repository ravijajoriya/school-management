import ExcelJS from 'exceljs';
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

/** Supertest: collect a binary body into a Buffer. */
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Dashboard, exports and data import (e2e)', () => {
  let ctx: TestContext;
  let admin: string;
  let teacher: string;
  let yearId: string;
  let secA: string;
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

  const upload = (
    type: string,
    csv: string,
    dryRun: boolean,
    name = `${type}.csv`,
    token = admin,
  ) =>
    api('post', `/imports/${type}?dryRun=${dryRun.toString()}`, token).attach(
      'file',
      Buffer.from(csv),
      name,
    );

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
    teacher = (await login(ctx.http, TEACHER.email, TEACHER.password)).token;
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
    secA = (
      await api('post', '/sections')
        .send({ academicYearId: yearId, classId, name: 'A', capacity: 40 })
        .expect(201)
    ).body.id;
  });

  const STUDENTS_CSV = [
    'admission_number,first_name,last_name,gender,date_of_birth,class,section,roll_number,guardian_name,guardian_relationship,guardian_phone,second_guardian_name,second_guardian_relationship,second_guardian_phone',
    '2019/0456,Aarav,Sharma,M,14/05/2016,Class 5,A,1,Ramesh Sharma,father,98290 12345,Sunita Sharma,MOTHER,9829012346',
    ',Bhavya,"Meena, Jr",F,2016-08-02,5,a,2,Kamla Meena,MOTHER,9414012345,,,',
  ].join('\n');

  it('imports students: a dry run reports every problem, a clean file commits all-or-nothing and reconciles', async () => {
    const bad = [
      STUDENTS_CSV.split('\n')[0],
      '2019/0456,Aarav,Sharma,M,14/05/2016,Class 5,A,1,Ramesh Sharma,FATHER,9829012345,,,',
      '2019/0456,Chirag,,X,2030-01-01,Class 9,A,,R,FATHER,123,,,',
      ',Dev,,M,2016-01-01,Class 5,A,1,Kiran,UNCLE,9829000000,,,',
    ].join('\n');
    const dry = (await upload('students', bad, false).expect(200)).body;
    expect(dry).toMatchObject({ totalRows: 3, created: 0, dryRun: false });
    const msgs = dry.errors.map(
      (e: { row: number; column: string; message: string }) => `${e.row}:${e.column}:${e.message}`,
    );
    expect(msgs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^3:section:Class 9 has no section "A" in /),
        '3:gender:Use MALE, FEMALE, OTHER (or M / F)',
        '3:date_of_birth:Date cannot be in the future',
        expect.stringMatching(/^3:guardian_phone:/),
        '4:guardian_relationship:Use FATHER, MOTHER, GUARDIAN or OTHER',
      ]),
    );
    expect(await ctx.prisma.student.count()).toBe(0); // nothing saved when any row is wrong

    await upload('students', 'first_name\nAarav', true).expect(400); // missing required columns
    const preview = (await upload('students', STUDENTS_CSV, true).expect(200)).body;
    expect(preview).toMatchObject({
      dryRun: true,
      totalRows: 2,
      validRows: 2,
      errors: [],
      created: 0,
    });
    expect(await ctx.prisma.student.count()).toBe(0);

    const done = (await upload('students', STUDENTS_CSV, false).expect(200)).body;
    expect(done).toMatchObject({ created: 2, errors: [] });
    expect(done.reconciliation).toEqual([
      { label: 'Students', file: 2, system: 2, ok: true },
      { label: 'Parents / guardians', file: 3, system: 3, ok: true },
      { label: 'Class 5 – A', file: 2, system: 2, ok: true },
    ]);
    const students = (await api('get', `/students?sectionId=${secA}`).expect(200)).body.items;
    expect(students.map((s: { fullName: string }) => s.fullName).sort()).toEqual([
      'Aarav Sharma',
      'Bhavya Meena, Jr',
    ]);
    expect(
      students.find((s: { fullName: string }) => s.fullName === 'Bhavya Meena, Jr').admissionNumber,
    ).toMatch(/^ADM-\d{4}-\d{5}$/);

    // Importing the same file again is refused: the admission number already exists.
    const again = (await upload('students', STUDENTS_CSV, false).expect(200)).body;
    expect(again.created).toBe(0);
    expect(again.errors[0]).toMatchObject({
      row: 2,
      column: 'admission_number',
      message: '2019/0456 already exists in the system',
    });

    const history = (await api('get', '/imports/history').expect(200)).body;
    expect(history).toEqual([
      expect.objectContaining({
        type: 'students',
        fileName: 'students.csv',
        rows: 2,
        created: 2,
        by: 'Test Admin',
      }),
    ]);
    await upload('students', STUDENTS_CSV, true, 'x.csv', teacher).expect(403);
  });

  it('imports staff from xlsx and opening balances with a reconciled total', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Staff');
    ws.addRow(['First Name', 'Last Name', 'Designation', 'Joining Date', 'Employment Type']);
    ws.addRow(['Neha', 'Agarwal', 'TGT Science', new Date(Date.UTC(2016, 6, 1)), 'full time']);
    ws.addRow(['Rahul', 'Verma', 'Clerk', '01/04/2020', '']);
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
    const staff = (
      await api('post', '/imports/staff?dryRun=false')
        .attach('file', xlsx, 'staff.xlsx')
        .expect(200)
    ).body;
    expect(staff).toMatchObject({
      created: 2,
      reconciliation: [{ label: 'Staff', file: 2, system: 2, ok: true }],
    });
    const neha = await ctx.prisma.employee.findFirstOrThrow({ where: { firstName: 'Neha' } });
    expect(neha).toMatchObject({
      employmentType: 'FULL_TIME',
      employeeCode: expect.stringMatching(/^EMP-\d{4}$/),
    });

    await upload('students', STUDENTS_CSV, false).expect(200);
    const balances =
      'admission_number,amount,description\n2019/0456,"₹4,500.50",\nUNKNOWN-1,100,\n';
    const badRun = (await upload('opening-balances', balances, false).expect(200)).body;
    expect(badRun.created).toBe(0);
    expect(badRun.errors).toEqual([
      {
        row: 3,
        column: 'admission_number',
        message: expect.stringContaining('UNKNOWN-1 is not a current student'),
      },
    ]);
    const ok = (
      await upload(
        'opening-balances',
        'admission_number,amount\n2019/0456,"₹4,500.50"\n',
        false,
      ).expect(200)
    ).body;
    expect(ok.reconciliation).toEqual([
      { label: 'Students', file: 1, system: 1, ok: true },
      { label: 'Total balance', file: '₹4,500.50', system: '₹4,500.50', ok: true },
    ]);
    const student = await ctx.prisma.student.findUniqueOrThrow({
      where: { admissionNumber: '2019/0456' },
    });
    const ledger = (await api('get', `/fees/students/${student.id}/ledger`).expect(200)).body;
    expect(ledger.totals.balance).toBe(4500.5);
    expect(ledger.dues[0]).toMatchObject({
      feeHead: { code: 'OPENING' },
      description: 'Opening balance (previous system)',
    });
    // A second opening balance for the same student is refused.
    const twice = (
      await upload('opening-balances', 'admission_number,amount\n2019/0456,10\n', false).expect(200)
    ).body;
    expect(twice.errors[0].message).toContain('already has an opening balance');

    const template = await api('get', '/imports/templates/students').expect(200);
    expect(template.headers['content-type']).toContain('text/csv');
    expect(template.text.split('\r\n')[0]).toContain(
      'admission_number,first_name,middle_name,last_name',
    );
  });

  it('exports reports as CSV and Excel, checks permissions and audits each export', async () => {
    await upload('students', STUDENTS_CSV, false).expect(200);

    const csv = await api('get', '/reports/exports/students?format=csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(
      /attachment; filename="students-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Admission no.,Name,Class,Section');
    expect(csv.text).toContain('"Bhavya Meena, Jr"');

    const xlsx = await api('get', `/reports/exports/strength?format=xlsx&academicYearId=${yearId}`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx.body as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(3).values).toEqual(
      expect.arrayContaining(['Class', 'Section', 'Boys', 'Girls', 'Total']),
    );
    const dataRow = ws.getRow(4).values as unknown[];
    expect(dataRow).toEqual(expect.arrayContaining(['Class 5', 'A', 40]));

    await api('get', '/reports/exports/attendance-daily').expect(400); // date is required
    await api('get', '/reports/exports/nope').expect(404);
    await api('get', '/reports/exports/students?format=pdf').expect(400);
    await api('get', '/reports/exports/students', teacher).expect(403);

    const audit = await ctx.prisma.auditLog.findMany({
      where: { action: 'report.exported' },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      audit.map((a) => a.afterJson as { report: string; format: string; rows: number }),
    ).toEqual([
      expect.objectContaining({ report: 'students', format: 'csv', rows: 2 }),
      expect.objectContaining({ report: 'strength', format: 'xlsx' }),
    ]);
  });

  it('serves a permission-aware dashboard and a strength report', async () => {
    await upload('students', STUDENTS_CSV, false).expect(200);
    const overview = (await api('get', '/reports/overview').expect(200)).body;
    expect(overview.students).toMatchObject({ active: 2 });
    expect(overview.fees).toMatchObject({ overdueBalance: 0 });
    expect(overview.complaints).toEqual({ open: 0, inProgress: 0 });
    expect(overview.payroll).toMatchObject({ month: today.slice(0, 7), status: null });

    // A teacher holds no admin permissions: every section is hidden.
    const t = (await api('get', '/reports/overview', teacher).expect(200)).body;
    expect(Object.entries(t).filter(([k, v]) => k !== 'today' && v !== null)).toEqual([]);

    const strength = (await api('get', '/reports/strength').expect(200)).body;
    expect(strength.rows).toEqual([
      expect.objectContaining({
        className: 'Class 5',
        sectionName: 'A',
        boys: 1,
        girls: 1,
        total: 2,
        capacity: 40,
      }),
    ]);
    expect(strength.totals).toMatchObject({ total: 2, boys: 1, girls: 1 });
  });
});
