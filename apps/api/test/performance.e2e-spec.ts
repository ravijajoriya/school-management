import { mkdirSync, writeFileSync } from 'node:fs';
import request from 'supertest';
import { schoolDate } from '../src/common/utils/content.js';
import { seedDemoData } from '../src/database/demo/demo-data.js';
import {
  ADMIN,
  API,
  bearer,
  createTestApp,
  login,
  resetDatabase,
  type TestContext,
} from './helpers.js';

/**
 * Performance guard: with the full demo school loaded (49 students, a term of attendance, fees,
 * exams, timetables, payroll …) the heaviest screens and exports must answer within budget.
 * Budgets are generous for CI machines; typical local timings are printed for the record.
 */
const BUDGET_MS = 1500;

describe('Report & list performance (e2e)', () => {
  let ctx: TestContext;
  let admin: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
    await seedDemoData(ctx.prisma);
    admin = (await login(ctx.http, ADMIN.email, ADMIN.password)).token;
  }, 120_000);

  afterAll(async () => {
    await ctx.app.close();
  });

  it('answers the heaviest endpoints within budget', async () => {
    const year = await ctx.prisma.academicYear.findFirstOrThrow({ where: { isActive: true } });
    const exam = await ctx.prisma.examination.findFirstOrThrow({ where: { status: 'FINALIZED' } });
    const section = await ctx.prisma.section.findFirstOrThrow({
      where: { classId: exam.classId, academicYearId: year.id },
    });
    const run = await ctx.prisma.payrollRun.findFirstOrThrow();
    const today = schoolDate();
    const endpoints = [
      '/reports/overview',
      '/reports/strength',
      '/students?pageSize=100',
      '/students?search=sharma',
      `/attendance/reports/daily?date=${today}`,
      `/attendance/reports/monthly?month=${today.slice(0, 7)}`,
      `/attendance/reports/register?sectionId=${section.id}&month=${today.slice(0, 7)}`,
      `/fees/reports/dues?academicYearId=${year.id}`,
      '/fees/payments?pageSize=100',
      `/fees/reports/collection?from=${year.startDate.toISOString().slice(0, 10)}&to=${today}`,
      `/exams/results?examinationId=${exam.id}&sectionId=${section.id}`,
      `/payroll/runs/${run.id}`,
      '/audit-logs?pageSize=100',
      `/reports/exports/fee-dues?format=xlsx&academicYearId=${year.id}`,
      '/reports/exports/payments?format=csv',
      `/reports/exports/attendance-register?format=xlsx&sectionId=${section.id}&month=${today.slice(0, 7)}`,
    ];
    const timings: { endpoint: string; ms: number }[] = [];
    for (const url of endpoints) {
      await request(ctx.http)
        .get(API + url)
        .set(bearer(admin))
        .expect(200); // warm-up
      const start = performance.now();
      await request(ctx.http)
        .get(API + url)
        .set(bearer(admin))
        .expect(200);
      timings.push({
        endpoint: url.replace(/[0-9a-f-]{36}/g, ':id'),
        ms: Math.round(performance.now() - start),
      });
    }
    // Kept for the record (test-results/ is git-ignored).
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/performance.json', `${JSON.stringify(timings, null, 2)}\n`);
    expect(timings.filter((t) => t.ms > BUDGET_MS)).toEqual([]);
  }, 120_000);
});
