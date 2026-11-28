import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ADJUSTMENT_TYPES,
  type AdjustmentType,
  type CollectionReport,
  type ConcessionReport,
  type DuesReport,
  type DuesReportQuery,
  type DuesReportRow,
  type FeeSummary,
  type PaymentMode,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { dayToDate, fullName, isoDay, schoolDate } from '../../common/utils/content.js';
import { rupees, toPaise } from '../../common/utils/money.js';
import { byRollThenName } from '../academics/teacher-scope.service.js';
import { dueInclude, dueMath, ledgerTotals } from './fees-core.js';

/** Dues (outstanding), collection, payment-mode and concession reports. */
@Injectable()
export class FeeReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dues(query: DuesReportQuery): Promise<DuesReport> {
    const year = await this.prisma.academicYear.findUnique({ where: { id: query.academicYearId } });
    if (!year) throw new NotFoundException('Academic year not found');
    const today = schoolDate();
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: {
        academicYearId: year.id,
        classId: query.classId,
        sectionId: query.sectionId,
        feeDues: { some: {} },
      },
      include: {
        class: { select: { name: true, levelOrder: true } },
        section: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            admissionNumber: true,
            guardians: { where: { isPrimary: true }, select: { phone: true }, take: 1 },
          },
        },
        feeDues: { include: dueInclude },
      },
    });
    const allDues = enrolments.flatMap((e) => e.feeDues);
    const rows: (DuesReportRow & { levelOrder: number })[] = enrolments.map((e) => {
      const t = ledgerTotals(e.feeDues, today);
      return {
        studentId: e.student.id,
        enrolmentId: e.id,
        fullName: fullName(e.student.firstName, e.student.middleName, e.student.lastName),
        admissionNumber: e.student.admissionNumber,
        className: e.class.name,
        sectionName: e.section.name,
        rollNumber: e.rollNumber,
        primaryPhone: e.student.guardians[0]?.phone ?? null,
        billed: t.billed,
        reductions: t.reductions,
        fines: t.fines,
        paid: t.paid,
        balance: t.balance,
        overdue: t.overdue,
        levelOrder: e.class.levelOrder,
      };
    });
    const filtered = rows
      .filter((r) => (query.overdueOnly ? r.overdue > 0 : true))
      .sort(
        (a, b) =>
          a.levelOrder - b.levelOrder ||
          a.sectionName.localeCompare(b.sectionName) ||
          byRollThenName(a, b),
      )
      .map(({ levelOrder: _l, ...r }) => r);
    const keep = new Set(filtered.map((r) => r.enrolmentId));
    return {
      academicYear: { id: year.id, name: year.name },
      rows: filtered,
      totals: ledgerTotals(
        allDues.filter((d) => keep.has(d.studentEnrolmentId)),
        today,
      ),
    };
  }

  async collection(from: string, to: string): Promise<CollectionReport> {
    const payments = await this.prisma.payment.findMany({
      where: { paymentDate: { gte: dayToDate(from), lte: dayToDate(to) } },
      include: {
        allocations: {
          select: {
            allocatedAmount: true,
            due: { select: { feeHead: { select: { name: true } } } },
          },
        },
      },
      orderBy: { paymentDate: 'asc' },
    });
    const posted = payments.filter((p) => p.status === 'POSTED');
    const cancelled = payments.filter((p) => p.status !== 'POSTED');
    const sum = (ps: typeof payments) => ps.reduce((s, p) => s + toPaise(p.amountReceived), 0);

    const byMode = new Map<string, { total: number; count: number }>();
    const byDay = new Map<string, { total: number; count: number }>();
    const byHead = new Map<string, number>();
    for (const p of posted) {
      const amount = toPaise(p.amountReceived);
      const m = byMode.get(p.paymentMode) ?? { total: 0, count: 0 };
      byMode.set(p.paymentMode, { total: m.total + amount, count: m.count + 1 });
      const day = isoDay(p.paymentDate);
      const d = byDay.get(day) ?? { total: 0, count: 0 };
      byDay.set(day, { total: d.total + amount, count: d.count + 1 });
      for (const a of p.allocations) {
        byHead.set(
          a.due.feeHead.name,
          (byHead.get(a.due.feeHead.name) ?? 0) + toPaise(a.allocatedAmount),
        );
      }
    }
    const pendingCheques = posted.filter((p) => p.chequeStatus === 'PENDING');
    return {
      from,
      to,
      total: rupees(sum(posted)),
      receipts: posted.length,
      byMode: [...byMode.entries()].map(([paymentMode, v]) => ({
        paymentMode: paymentMode as PaymentMode,
        total: rupees(v.total),
        count: v.count,
      })),
      byDay: [...byDay.entries()].map(([date, v]) => ({
        date,
        total: rupees(v.total),
        count: v.count,
      })),
      byFeeHead: [...byHead.entries()]
        .map(([feeHead, total]) => ({ feeHead, total: rupees(total) }))
        .sort((a, b) => b.total - a.total),
      chequesPending: { total: rupees(sum(pendingCheques)), count: pendingCheques.length },
      cancelled: { total: rupees(sum(cancelled)), count: cancelled.length },
    };
  }

  async concessions(from: string, to: string, type?: AdjustmentType): Promise<ConcessionReport> {
    const rows = await this.prisma.feeAdjustment.findMany({
      where: { effectiveDate: { gte: dayToDate(from), lte: dayToDate(to) }, adjustmentType: type },
      include: {
        approver: { select: { fullName: true } },
        due: {
          select: {
            description: true,
            enrolment: {
              select: {
                class: { select: { name: true } },
                section: { select: { name: true } },
                student: {
                  select: {
                    id: true,
                    firstName: true,
                    middleName: true,
                    lastName: true,
                    admissionNumber: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    const totals = Object.fromEntries(ADJUSTMENT_TYPES.map((t) => [t, 0])) as Record<
      AdjustmentType,
      number
    >;
    for (const r of rows) totals[r.adjustmentType as AdjustmentType] += toPaise(r.amount);
    for (const t of ADJUSTMENT_TYPES) totals[t] = rupees(totals[t]);
    return {
      rows: rows.map((r) => {
        const e = r.due.enrolment;
        return {
          id: r.id,
          adjustmentType: r.adjustmentType as AdjustmentType,
          amount: rupees(toPaise(r.amount)),
          reason: r.reason,
          effectiveDate: isoDay(r.effectiveDate),
          approvedBy: r.approver.fullName,
          student: {
            id: e.student.id,
            fullName: fullName(e.student.firstName, e.student.middleName, e.student.lastName),
            admissionNumber: e.student.admissionNumber,
            className: e.class.name,
            sectionName: e.section.name,
          },
          due: r.due.description,
        };
      }),
      totals,
    };
  }

  async summary(): Promise<FeeSummary> {
    const today = schoolDate();
    const [todays, overdueDues, chequesPending, activeYear] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paymentDate: dayToDate(today), status: 'POSTED' },
        select: { amountReceived: true },
      }),
      this.prisma.studentFeeDue.findMany({
        where: {
          academicYear: { isActive: true },
          dueDate: { lt: dayToDate(today) },
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        include: dueInclude,
      }),
      this.prisma.payment.count({ where: { status: 'POSTED', chequeStatus: 'PENDING' } }),
      this.prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { name: true, feeDues: { include: dueInclude } },
      }),
    ]);
    const year = activeYear ? ledgerTotals(activeYear.feeDues, today) : null;
    return {
      today,
      collectedToday: rupees(todays.reduce((s, p) => s + toPaise(p.amountReceived), 0)),
      receiptsToday: todays.length,
      overdueBalance: rupees(overdueDues.reduce((s, d) => s + Math.max(dueMath(d).balance, 0), 0)),
      chequesPending,
      year:
        activeYear && year
          ? {
              name: activeYear.name,
              billed: rupees(toPaise(year.billed) + toPaise(year.fines) - toPaise(year.reductions)),
              collected: year.paid,
              outstanding: year.balance,
              overdue: year.overdue,
            }
          : null,
    };
  }
}
