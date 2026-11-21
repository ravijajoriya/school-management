import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  REDUCING_ADJUSTMENTS,
  formatRupees,
  type AdjustmentType,
  type CreateAdjustmentInput,
  type CreateChargeInput,
  type DueItem,
  type StudentLedger,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, schoolDate } from '../../common/utils/content.js';
import { paiseToDb, rupees } from '../../common/utils/money.js';
import { AuditService } from '../audit/audit.service.js';
import {
  dueInclude,
  dueMath,
  ledgerTotals,
  lockDues,
  paymentInclude,
  syncDueStatuses,
  toDueItem,
  toPaymentItem,
} from './fees-core.js';

/** A student's fee ledger: dues, adjustments and payments for one academic year. */
@Injectable()
export class FeeLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ledger(studentId: string, academicYearId?: string): Promise<StudentLedger> {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: { studentId },
      include: {
        academicYear: {
          select: { id: true, name: true, status: true, isActive: true, startDate: true },
        },
        class: { select: { name: true } },
        section: { select: { name: true } },
      },
      orderBy: { academicYear: { startDate: 'desc' } },
    });
    const enrolment = academicYearId
      ? enrolments.find((e) => e.academicYearId === academicYearId)
      : (enrolments.find((e) => e.academicYear.isActive) ?? enrolments[0]);
    const today = schoolDate();
    const base = {
      student: {
        id: student.id,
        fullName: fullName(student.firstName, student.middleName, student.lastName),
        admissionNumber: student.admissionNumber,
      },
      years: enrolments.map((e) => ({
        id: e.academicYear.id,
        name: e.academicYear.name,
        enrolmentId: e.id,
      })),
    };
    if (!enrolment) {
      return { ...base, enrolment: null, totals: ledgerTotals([], today), dues: [], payments: [] };
    }
    const [dues, payments] = await Promise.all([
      this.prisma.studentFeeDue.findMany({
        where: { studentEnrolmentId: enrolment.id },
        include: dueInclude,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      }),
      this.prisma.payment.findMany({
        where: { studentEnrolmentId: enrolment.id },
        include: paymentInclude,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    return {
      ...base,
      enrolment: {
        id: enrolment.id,
        className: enrolment.class.name,
        sectionName: enrolment.section.name,
        rollNumber: enrolment.rollNumber,
        academicYear: {
          id: enrolment.academicYear.id,
          name: enrolment.academicYear.name,
          status: enrolment.academicYear.status,
        },
      },
      totals: ledgerTotals(dues, today),
      dues: dues.map((d) => toDueItem(d, today)),
      payments: payments.map(toPaymentItem),
    };
  }

  /** An authorised one-off charge (e.g. lost ID card, trip) outside the fee plan. */
  async addCharge(
    enrolmentId: string,
    input: CreateChargeInput,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<DueItem> {
    const enrolment = await this.prisma.studentEnrolment.findUnique({
      where: { id: enrolmentId },
      include: { academicYear: true },
    });
    if (!enrolment) throw new NotFoundException('Enrolment not found');
    if (enrolment.academicYear.status === 'CLOSED') {
      throw new BadRequestException(
        `${enrolment.academicYear.name} is closed — no new charges can be added`,
      );
    }
    const head = await this.prisma.feeHead.findFirst({
      where: { id: input.feeHeadId, isActive: true },
    });
    if (!head) throw new BadRequestException(['feeHeadId: Choose an active fee head']);
    return this.prisma.$transaction(async (tx) => {
      const due = await tx.studentFeeDue.create({
        data: {
          studentEnrolmentId: enrolmentId,
          academicYearId: enrolment.academicYearId,
          feeHeadId: head.id,
          description: input.description,
          amountDue: paiseToDb(Math.round(Number(input.amount) * 100)),
          dueDate: input.dueDate ? dayToDate(input.dueDate) : null,
        },
        include: dueInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.FEE_CHARGE_ADDED,
          entityType: 'student_fee_due',
          entityId: due.id,
          userId: actor.id,
          after: {
            enrolmentId,
            feeHead: head.name,
            description: input.description,
            amount: Number(input.amount),
          },
          context,
        },
        tx,
      );
      return toDueItem(due, schoolDate());
    });
  }

  /** Only a due with nothing paid or adjusted can be deleted (e.g. billed by mistake). */
  async deleteDue(id: string, actor: RequestUser, context: RequestContext) {
    const due = await this.prisma.studentFeeDue.findUnique({ where: { id }, include: dueInclude });
    if (!due) throw new NotFoundException('Due not found');
    if (due.allocations.length || due.adjustments.length) {
      throw new BadRequestException(
        'This due has payments or adjustments and can no longer be deleted — use a waiver instead',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.studentFeeDue.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.FEE_DUE_DELETED,
          entityType: 'student_fee_due',
          entityId: id,
          userId: actor.id,
          before: {
            description: due.description,
            amount: rupees(dueMath(due).billed),
            enrolmentId: due.studentEnrolmentId,
          },
          context,
        },
        tx,
      );
    });
  }

  /** Concession, discount, waiver (reduce what is owed) or fine (adds to it). Approved by the actor. */
  async addAdjustment(
    dueId: string,
    input: CreateAdjustmentInput,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<DueItem> {
    return this.prisma.$transaction(async (tx) => {
      await lockDues(tx, [dueId]);
      const due = await tx.studentFeeDue.findUnique({ where: { id: dueId }, include: dueInclude });
      if (!due) throw new NotFoundException('Due not found');
      const amount = Math.round(Number(input.amount) * 100);
      const { balance } = dueMath(due);
      if (
        REDUCING_ADJUSTMENTS.includes(input.adjustmentType as AdjustmentType) &&
        amount > balance
      ) {
        throw new BadRequestException([
          `amount: Only ${formatRupees(rupees(Math.max(balance, 0)))} is still owed on this due`,
        ]);
      }
      await tx.feeAdjustment.create({
        data: {
          studentFeeDueId: dueId,
          adjustmentType: input.adjustmentType,
          amount: paiseToDb(amount),
          reason: input.reason,
          approvedBy: actor.id,
          effectiveDate: dayToDate(input.effectiveDate),
        },
      });
      await syncDueStatuses(tx, [dueId]);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.FEE_ADJUSTMENT_ADDED,
          entityType: 'student_fee_due',
          entityId: dueId,
          userId: actor.id,
          after: { type: input.adjustmentType, amount: rupees(amount), due: due.description },
          reason: input.reason,
          context,
        },
        tx,
      );
      const fresh = await tx.studentFeeDue.findUniqueOrThrow({
        where: { id: dueId },
        include: dueInclude,
      });
      return toDueItem(fresh, schoolDate());
    });
  }
}
