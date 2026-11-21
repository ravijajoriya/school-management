import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  addPayrollEmployeeSchema,
  amountInWords,
  createPayrollRunSchema,
  savePayrollRecordSchema,
  saveSalaryComponentSchema,
  uuidSchema,
  type ComponentType,
  type PayrollLineItem,
  type PayrollRecordItem,
  type PayrollRunItem,
  type PayrollRunListItem,
  type PayrollStatus,
  type Payslip,
  type SalaryComponentItem,
  type SavePayrollRecordData,
} from '@school/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext, type RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDay } from '../../common/utils/content.js';
import { paiseToDb, rupees, toPaise } from '../../common/utils/money.js';
import { schoolDetails } from '../../common/utils/school.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { TeacherScopeService } from '../academics/teacher-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { monthBounds, payTotals } from './payroll-core.js';

type ComponentInput = z.output<typeof saveSalaryComponentSchema>;
const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });

const recordInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      department: true,
      joiningDate: true,
    },
  },
  items: { include: { component: { select: { sortOrder: true } } } },
} satisfies Prisma.PayrollRecordInclude;
type RecordRow = Prisma.PayrollRecordGetPayload<{ include: typeof recordInclude }>;

const runInclude = {
  creator: { select: { fullName: true } },
  approver: { select: { fullName: true } },
  records: { include: recordInclude },
} satisfies Prisma.PayrollRunInclude;
type RunRow = Prisma.PayrollRunGetPayload<{ include: typeof runInclude }>;

const month = (d: Date) => isoDay(d).slice(0, 7);

function lineItems(r: RecordRow): PayrollLineItem[] {
  return [...r.items]
    .sort(
      (a, b) =>
        a.component.sortOrder - b.component.sortOrder ||
        a.componentName.localeCompare(b.componentName),
    )
    .map((i) => ({
      salaryComponentId: i.salaryComponentId,
      name: i.componentName,
      componentType: i.componentType as ComponentType,
      amount: rupees(toPaise(i.amount)),
      notes: i.notes,
    }));
}

function toRecord(r: RecordRow, status: PayrollStatus): PayrollRecordItem {
  return {
    id: r.id,
    employee: {
      id: r.employee.id,
      fullName: fullName(r.employee.firstName, r.employee.lastName),
      employeeCode: r.employee.employeeCode,
      designation: r.employee.designation,
    },
    gross: rupees(toPaise(r.grossAmount)),
    deductions: rupees(toPaise(r.deductionAmount)),
    net: rupees(toPaise(r.netAmount)),
    status,
    lines: lineItems(r),
  };
}

/**
 * Simple monthly payroll (ADR 0008): amounts are entered per employee and pre-filled from the
 * previous month; nothing statutory is calculated. A run moves DRAFT ⇄ APPROVED → PAID, and the
 * database refuses edits to a run that is no longer a draft.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: TeacherScopeService,
  ) {}

  // --- Components ----------------------------------------------------------------------------

  async components(): Promise<SalaryComponentItem[]> {
    const rows = await this.prisma.salaryComponent.findMany({
      orderBy: [{ componentType: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      componentType: c.componentType as ComponentType,
      isActive: c.isActive,
    }));
  }

  async saveComponent(
    id: string | null,
    input: ComponentInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.salaryComponent.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('Salary component not found');
      if (
        before &&
        before.componentType !== input.componentType &&
        (await tx.payrollItem.count({ where: { salaryComponentId: before.id } }))
      )
        throw new ConflictException(
          'This component is already used in payroll, so it cannot switch between earning and deduction',
        );
      const sortOrder = before?.sortOrder ?? (await tx.salaryComponent.count());
      const saved = id
        ? await tx.salaryComponent.update({ where: { id }, data: input })
        : await tx.salaryComponent.create({ data: { ...input, sortOrder } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.SALARY_COMPONENT_SAVED,
          entityType: 'salary_component',
          entityId: saved.id,
          userId: actor.id,
          before,
          after: saved,
          context,
        },
        tx,
      );
      return saved;
    });
    return (await this.components()).find((c) => c.id === row.id)!;
  }

  // --- Runs ----------------------------------------------------------------------------------

  async runs(): Promise<PayrollRunListItem[]> {
    const rows = await this.prisma.payrollRun.findMany({
      include: { records: { select: { netAmount: true } } },
      orderBy: { periodStart: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      month: month(r.periodStart),
      status: r.status as PayrollStatus,
      employees: r.records.length,
      net: rupees(r.records.reduce((n, x) => n + toPaise(x.netAmount), 0)),
    }));
  }

  private async load(id: string): Promise<RunRow> {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: runInclude });
    if (!run) throw new NotFoundException('Payroll not found');
    return run;
  }

  private toRun(run: RunRow): PayrollRunItem {
    const status = run.status as PayrollStatus;
    const records = run.records
      .map((r) => toRecord(r, status))
      .sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName));
    const sum = (k: 'grossAmount' | 'deductionAmount' | 'netAmount') =>
      rupees(run.records.reduce((n, r) => n + toPaise(r[k]), 0));
    return {
      id: run.id,
      month: month(run.periodStart),
      periodStart: isoDay(run.periodStart),
      periodEnd: isoDay(run.periodEnd),
      status,
      createdBy: run.creator.fullName,
      approvedBy: run.approver?.fullName ?? null,
      paidAt: run.paidAt?.toISOString() ?? null,
      totals: {
        employees: records.length,
        gross: sum('grossAmount'),
        deductions: sum('deductionAmount'),
        net: sum('netAmount'),
      },
      records,
    };
  }

  async get(id: string) {
    return this.toRun(await this.load(id));
  }

  private async assertDraft(id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!run) throw new NotFoundException('Payroll not found');
    if (run.status !== 'DRAFT')
      throw new ConflictException(
        `This payroll is ${run.status.toLowerCase()} and can no longer be edited`,
      );
  }

  /** Lines copied from the employee's latest earlier payroll (active components only). */
  private async previousLines(tx: Prisma.TransactionClient, employeeId: string, before: Date) {
    const prev = await tx.payrollRecord.findFirst({
      where: { employeeId, run: { periodStart: { lt: before } } },
      orderBy: { run: { periodStart: 'desc' } },
      include: { items: { include: { component: true } } },
    });
    return (prev?.items ?? [])
      .filter((i) => i.component.isActive)
      .map((i) => ({
        salaryComponentId: i.salaryComponentId,
        componentName: i.component.name,
        componentType: i.component.componentType,
        amount: toPaise(i.amount),
        notes: i.notes,
      }));
  }

  private async createRecord(
    tx: Prisma.TransactionClient,
    runId: string,
    employeeId: string,
    periodStart: Date,
  ) {
    const lines = await this.previousLines(tx, employeeId, periodStart);
    const t = payTotals(lines);
    if (t.net < 0) lines.length = 0;
    const totals = t.net < 0 ? { gross: 0, deductions: 0, net: 0 } : t;
    return tx.payrollRecord.create({
      data: {
        payrollRunId: runId,
        employeeId,
        grossAmount: paiseToDb(totals.gross),
        deductionAmount: paiseToDb(totals.deductions),
        netAmount: paiseToDb(totals.net),
        items: { create: lines.map((l) => ({ ...l, amount: paiseToDb(l.amount) })) },
      },
    });
  }

  async create(monthKey: string, actor: RequestUser, context: RequestContext) {
    const { start, end } = monthBounds(monthKey);
    if (await this.prisma.payrollRun.findUnique({ where: { periodStart: dayToDate(start) } }))
      throw new ConflictException(['month: Payroll for this month already exists']);
    const employees = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE', joiningDate: { lte: dayToDate(end) } },
      select: { id: true },
    });
    const runId = await this.prisma.$transaction(
      async (tx) => {
        const run = await tx.payrollRun.create({
          data: { periodStart: dayToDate(start), periodEnd: dayToDate(end), createdBy: actor.id },
        });
        for (const e of employees) await this.createRecord(tx, run.id, e.id, run.periodStart);
        await this.audit.log(
          {
            action: AUDIT_ACTIONS.PAYROLL_CREATED,
            entityType: 'payroll_run',
            entityId: run.id,
            userId: actor.id,
            after: { month: monthKey, employees: employees.length },
            context,
          },
          tx,
        );
        return run.id;
      },
      { timeout: 30_000 },
    );
    return this.get(runId);
  }

  async saveRecord(
    runId: string,
    recordId: string,
    input: SavePayrollRecordData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.assertDraft(runId);
    const record = await this.prisma.payrollRecord.findFirst({
      where: { id: recordId, payrollRunId: runId },
      include: { items: true },
    });
    if (!record) throw new NotFoundException('Payroll entry not found');
    const components = await this.prisma.salaryComponent.findMany({
      where: { id: { in: input.lines.map((l) => l.salaryComponentId) } },
    });
    const errors: string[] = [];
    const lines = input.lines.flatMap((l) => {
      const c = components.find((x) => x.id === l.salaryComponentId);
      if (!c) {
        errors.push('lines: Unknown salary component');
        return [];
      }
      if (!c.isActive && !record.items.some((i) => i.salaryComponentId === c.id)) {
        errors.push(`lines: ${c.name} is no longer in use`);
        return [];
      }
      const amount = Math.round(l.amount * 100);
      return amount > 0
        ? [
            {
              salaryComponentId: c.id,
              componentName: c.name,
              componentType: c.componentType,
              amount,
              notes: l.notes ?? null,
            },
          ]
        : [];
    });
    if (errors.length) throw new BadRequestException(errors);
    const totals = payTotals(lines);
    if (totals.net < 0)
      throw new BadRequestException(['lines: Deductions cannot be more than earnings']);
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollItem.deleteMany({ where: { payrollRecordId: record.id } });
      await tx.payrollRecord.update({
        where: { id: record.id },
        data: {
          grossAmount: paiseToDb(totals.gross),
          deductionAmount: paiseToDb(totals.deductions),
          netAmount: paiseToDb(totals.net),
          items: { create: lines.map((l) => ({ ...l, amount: paiseToDb(l.amount) })) },
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PAYROLL_RECORD_SAVED,
          entityType: 'payroll_record',
          entityId: record.id,
          userId: actor.id,
          before: {
            gross: rupees(toPaise(record.grossAmount)),
            deductions: rupees(toPaise(record.deductionAmount)),
            net: rupees(toPaise(record.netAmount)),
          },
          after: {
            gross: rupees(totals.gross),
            deductions: rupees(totals.deductions),
            net: rupees(totals.net),
            lines: lines.length,
          },
          context,
        },
        tx,
      );
    });
    return this.get(runId);
  }

  async addEmployee(
    runId: string,
    employeeId: string,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.assertDraft(runId);
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { status: true },
    });
    if (!emp) throw new BadRequestException(['employeeId: Staff member not found']);
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    if (await this.prisma.payrollRecord.findFirst({ where: { payrollRunId: runId, employeeId } }))
      throw new ConflictException(['employeeId: This staff member is already in the payroll']);
    await this.prisma.$transaction(async (tx) => {
      const rec = await this.createRecord(tx, runId, employeeId, run.periodStart);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PAYROLL_EMPLOYEE_ADDED,
          entityType: 'payroll_record',
          entityId: rec.id,
          userId: actor.id,
          after: { runId, employeeId },
          context,
        },
        tx,
      );
    });
    return this.get(runId);
  }

  async removeEmployee(
    runId: string,
    recordId: string,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.assertDraft(runId);
    const record = await this.prisma.payrollRecord.findFirst({
      where: { id: recordId, payrollRunId: runId },
    });
    if (!record) throw new NotFoundException('Payroll entry not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollItem.deleteMany({ where: { payrollRecordId: recordId } });
      await tx.payrollRecord.delete({ where: { id: recordId } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PAYROLL_EMPLOYEE_REMOVED,
          entityType: 'payroll_record',
          entityId: recordId,
          userId: actor.id,
          before: { runId, employeeId: record.employeeId, net: rupees(toPaise(record.netAmount)) },
          context,
        },
        tx,
      );
    });
    return this.get(runId);
  }

  private async transition(
    runId: string,
    from: PayrollStatus,
    data: Prisma.PayrollRunUpdateInput & { status: PayrollStatus },
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    actor: RequestUser,
    context: RequestContext,
    reason?: string,
  ) {
    const run = await this.load(runId);
    if (run.status !== from)
      throw new ConflictException(
        `This payroll is ${run.status.toLowerCase()}, not ${from.toLowerCase()}`,
      );
    if (data.status === 'APPROVED' && run.records.length === 0)
      throw new ConflictException('Add at least one staff member before approving');
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({ where: { id: runId }, data });
      await this.audit.log(
        {
          action,
          entityType: 'payroll_run',
          entityId: runId,
          userId: actor.id,
          before: { status: run.status },
          after: { status: data.status },
          reason,
          context,
        },
        tx,
      );
    });
    return this.get(runId);
  }

  approve(runId: string, actor: RequestUser, context: RequestContext) {
    return this.transition(
      runId,
      'DRAFT',
      { status: 'APPROVED', approver: { connect: { id: actor.id } }, approvedAt: new Date() },
      AUDIT_ACTIONS.PAYROLL_APPROVED,
      actor,
      context,
    );
  }

  reopen(runId: string, reason: string, actor: RequestUser, context: RequestContext) {
    return this.transition(
      runId,
      'APPROVED',
      { status: 'DRAFT', approver: { disconnect: true }, approvedAt: null },
      AUDIT_ACTIONS.PAYROLL_REOPENED,
      actor,
      context,
      reason,
    );
  }

  markPaid(runId: string, actor: RequestUser, context: RequestContext) {
    return this.transition(
      runId,
      'APPROVED',
      { status: 'PAID', paidAt: new Date() },
      AUDIT_ACTIONS.PAYROLL_PAID,
      actor,
      context,
    );
  }

  async remove(runId: string, actor: RequestUser, context: RequestContext) {
    await this.assertDraft(runId);
    const run = await this.load(runId);
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollItem.deleteMany({ where: { record: { payrollRunId: runId } } });
      await tx.payrollRecord.deleteMany({ where: { payrollRunId: runId } });
      await tx.payrollRun.delete({ where: { id: runId } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PAYROLL_DELETED,
          entityType: 'payroll_run',
          entityId: runId,
          userId: actor.id,
          before: { month: month(run.periodStart), employees: run.records.length },
          context,
        },
        tx,
      );
    });
  }

  // --- Payslips ------------------------------------------------------------------------------

  async payslip(recordId: string, ownEmployeeId?: string): Promise<Payslip> {
    const record = await this.prisma.payrollRecord.findUnique({
      where: { id: recordId },
      include: { ...recordInclude, run: true },
    });
    if (
      !record ||
      (ownEmployeeId && (record.employeeId !== ownEmployeeId || record.run.status === 'DRAFT'))
    )
      throw new NotFoundException('Payslip not found');
    const school = await schoolDetails(this.prisma);
    const lines = lineItems(record);
    const net = rupees(toPaise(record.netAmount));
    return {
      school: { name: school.name, address: school.address },
      month: month(record.run.periodStart),
      periodStart: isoDay(record.run.periodStart),
      periodEnd: isoDay(record.run.periodEnd),
      status: record.run.status as PayrollStatus,
      employee: {
        fullName: fullName(record.employee.firstName, record.employee.lastName),
        employeeCode: record.employee.employeeCode,
        designation: record.employee.designation,
        department: record.employee.department,
        joiningDate: isoDay(record.employee.joiningDate),
      },
      earnings: lines.filter((l) => l.componentType === 'EARNING'),
      deductions: lines.filter((l) => l.componentType === 'DEDUCTION'),
      gross: rupees(toPaise(record.grossAmount)),
      totalDeductions: rupees(toPaise(record.deductionAmount)),
      net,
      netInWords: amountInWords(net),
    };
  }

  private async me(actor: RequestUser) {
    const employeeId = await this.scope.employeeIdForUser(actor.id);
    if (!employeeId) throw new ForbiddenException('Your login is not linked to a staff record');
    return employeeId;
  }

  /** The signed-in staff member's approved and paid payslips. */
  async mine(actor: RequestUser) {
    const employeeId = await this.me(actor);
    const rows = await this.prisma.payrollRecord.findMany({
      where: { employeeId, run: { status: { in: ['APPROVED', 'PAID'] } } },
      include: { run: { select: { periodStart: true, status: true } } },
      orderBy: { run: { periodStart: 'desc' } },
    });
    return rows.map((r) => ({
      id: r.id,
      month: month(r.run.periodStart),
      status: r.run.status as PayrollStatus,
      net: rupees(toPaise(r.netAmount)),
    }));
  }

  async myPayslip(actor: RequestUser, recordId: string) {
    return this.payslip(recordId, await this.me(actor));
  }
}

const id = (name = 'id') => Param(name, { schema: uuidSchema });

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('components')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  components() {
    return this.payroll.components();
  }

  @Post('components')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  createComponent(
    @Body({ schema: saveSalaryComponentSchema }) body: ComponentInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payroll.saveComponent(null, body, user, getRequestContext(req));
  }

  @Patch('components/:id')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  updateComponent(
    @id() componentId: string,
    @Body({ schema: saveSalaryComponentSchema }) body: ComponentInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payroll.saveComponent(componentId, body, user, getRequestContext(req));
  }

  @Get('runs')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  runs() {
    return this.payroll.runs();
  }

  @Post('runs')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  create(
    @Body({ schema: createPayrollRunSchema }) body: { month: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payroll.create(body.month, user, getRequestContext(req));
  }

  @Get('runs/:id')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  get(@id() runId: string) {
    return this.payroll.get(runId);
  }

  @Delete('runs/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  async remove(@id() runId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    await this.payroll.remove(runId, user, getRequestContext(req));
  }

  @Put('runs/:id/records/:recordId')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  saveRecord(
    @id() runId: string,
    @id('recordId') recordId: string,
    @Body({ schema: savePayrollRecordSchema }) body: SavePayrollRecordData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payroll.saveRecord(runId, recordId, body, user, getRequestContext(req));
  }

  @Post('runs/:id/records')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  addEmployee(
    @id() runId: string,
    @Body({ schema: addPayrollEmployeeSchema }) body: { employeeId: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payroll.addEmployee(runId, body.employeeId, user, getRequestContext(req));
  }

  @Delete('runs/:id/records/:recordId')
  @RequirePermissions(PERMISSIONS.PAYROLL_MANAGE)
  removeEmployee(
    @id() runId: string,
    @id('recordId') recordId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payroll.removeEmployee(runId, recordId, user, getRequestContext(req));
  }

  @Post('runs/:id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PAYROLL_APPROVE)
  approve(@id() runId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.payroll.approve(runId, user, getRequestContext(req));
  }

  @Post('runs/:id/reopen')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PAYROLL_APPROVE)
  reopen(
    @id() runId: string,
    @Body({ schema: reasonSchema }) body: { reason: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payroll.reopen(runId, body.reason, user, getRequestContext(req));
  }

  @Post('runs/:id/pay')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PAYROLL_APPROVE)
  pay(@id() runId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.payroll.markPaid(runId, user, getRequestContext(req));
  }

  @Get('records/:id/payslip')
  @RequirePermissions(PERMISSIONS.PAYROLL_READ)
  payslip(@id() recordId: string) {
    return this.payroll.payslip(recordId);
  }

  /** Staff self-service: own approved/paid payslips. */
  @Get('mine')
  @Authenticated()
  mine(@CurrentUser() user: RequestUser) {
    return this.payroll.mine(user);
  }

  @Get('mine/:id')
  @Authenticated()
  myPayslip(@id() recordId: string, @CurrentUser() user: RequestUser) {
    return this.payroll.myPayslip(user, recordId);
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
