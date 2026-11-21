import {
  REDUCING_ADJUSTMENTS,
  type AdjustmentType,
  type ChequeStatus,
  type DueItem,
  type DueStatus,
  type LedgerTotals,
  type PaymentListItem,
  type PaymentMode,
  type PaymentStatus,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { fullName, isoDay, isoDayOrNull } from '../../common/utils/content.js';
import { rupees, toPaise, type Paise } from '../../common/utils/money.js';

type Db = Prisma.TransactionClient;

export const dueInclude = {
  feeHead: { select: { id: true, code: true, name: true } },
  adjustments: {
    include: { approver: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
  },
  allocations: { select: { allocatedAmount: true, payment: { select: { status: true } } } },
} satisfies Prisma.StudentFeeDueInclude;

export type DueRow = Prisma.StudentFeeDueGetPayload<{ include: typeof dueInclude }>;

export interface DueMath {
  billed: Paise;
  fines: Paise;
  reductions: Paise;
  paid: Paise;
  balance: Paise;
  status: DueStatus;
}

/**
 * The single ledger rule (ADR 0006):
 *   balance = billed + fines − (concessions + discounts + waivers) − allocations of POSTED payments.
 * Void/reversed payments no longer count. Cheques count from the day they are received.
 */
export function dueMath(due: DueRow): DueMath {
  const billed = toPaise(due.amountDue);
  let fines = 0;
  let reductions = 0;
  for (const a of due.adjustments) {
    if (REDUCING_ADJUSTMENTS.includes(a.adjustmentType as AdjustmentType))
      reductions += toPaise(a.amount);
    else fines += toPaise(a.amount);
  }
  const paid = due.allocations
    .filter((a) => a.payment.status === 'POSTED')
    .reduce((s, a) => s + toPaise(a.allocatedAmount), 0);
  const balance = billed + fines - reductions - paid;
  const status: DueStatus =
    balance <= 0
      ? paid === 0 && reductions > 0
        ? 'WAIVED'
        : 'PAID'
      : paid > 0
        ? 'PARTIAL'
        : 'OPEN';
  return { billed, fines, reductions, paid, balance, status };
}

export function toDueItem(due: DueRow, today: string): DueItem {
  const m = dueMath(due);
  const dueDate = isoDayOrNull(due.dueDate);
  return {
    id: due.id,
    feeHead: due.feeHead,
    description: due.description,
    amountDue: rupees(m.billed),
    dueDate,
    status: m.status,
    fines: rupees(m.fines),
    reductions: rupees(m.reductions),
    paid: rupees(m.paid),
    balance: rupees(m.balance),
    overdue: m.balance > 0 && !!dueDate && dueDate < today,
    fromStructure: !!due.feeStructureItemId,
    adjustments: due.adjustments.map((a) => ({
      id: a.id,
      adjustmentType: a.adjustmentType as AdjustmentType,
      amount: rupees(toPaise(a.amount)),
      reason: a.reason,
      approvedBy: a.approver.fullName,
      effectiveDate: isoDay(a.effectiveDate),
      createdAt: a.createdAt.toISOString(),
    })),
    canDelete: due.adjustments.length === 0 && due.allocations.length === 0,
  };
}

export function ledgerTotals(dues: DueRow[], today: string): LedgerTotals {
  const t = { billed: 0, fines: 0, reductions: 0, paid: 0, balance: 0, overdue: 0 };
  for (const d of dues) {
    const m = dueMath(d);
    t.billed += m.billed;
    t.fines += m.fines;
    t.reductions += m.reductions;
    t.paid += m.paid;
    t.balance += m.balance;
    const dueDate = isoDayOrNull(d.dueDate);
    if (m.balance > 0 && dueDate && dueDate < today) t.overdue += m.balance;
  }
  return {
    billed: rupees(t.billed),
    fines: rupees(t.fines),
    reductions: rupees(t.reductions),
    paid: rupees(t.paid),
    balance: rupees(t.balance),
    overdue: rupees(t.overdue),
  };
}

/** Re-derives and stores the status of the given dues (call inside the changing transaction). */
export async function syncDueStatuses(tx: Db, dueIds: string[]) {
  if (!dueIds.length) return;
  const dues = await tx.studentFeeDue.findMany({
    where: { id: { in: dueIds } },
    include: dueInclude,
  });
  for (const d of dues) {
    const { status } = dueMath(d);
    if (status !== d.status)
      await tx.studentFeeDue.update({ where: { id: d.id }, data: { status } });
  }
}

/** Locks dues rows for the rest of the transaction, so concurrent payments cannot overpay them. */
export async function lockDues(tx: Db, dueIds: string[]) {
  if (dueIds.length) {
    await tx.$queryRaw`SELECT id FROM student_fee_dues WHERE id = ANY(${dueIds}::uuid[]) FOR UPDATE`;
  }
}

export const paymentInclude = {
  recorder: { select: { fullName: true } },
  receipt: { select: { receiptNumber: true } },
  allocations: {
    select: {
      studentFeeDueId: true,
      allocatedAmount: true,
      due: { select: { description: true } },
    },
  },
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
} satisfies Prisma.PaymentInclude;

export type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export function toPaymentItem(p: PaymentRow): PaymentListItem {
  const s = p.enrolment.student;
  return {
    id: p.id,
    paymentNumber: p.paymentNumber,
    receiptNumber: p.receipt?.receiptNumber ?? null,
    paymentDate: isoDay(p.paymentDate),
    amountReceived: rupees(toPaise(p.amountReceived)),
    paymentMode: p.paymentMode as PaymentMode,
    referenceNumber: p.referenceNumber,
    bankName: p.bankName,
    chequeDate: isoDayOrNull(p.chequeDate),
    chequeStatus: p.chequeStatus as ChequeStatus | null,
    status: p.status as PaymentStatus,
    notes: p.notes,
    recordedBy: p.recorder.fullName,
    createdAt: p.createdAt.toISOString(),
    student: {
      id: s.id,
      fullName: fullName(s.firstName, s.middleName, s.lastName),
      admissionNumber: s.admissionNumber,
      className: p.enrolment.class.name,
      sectionName: p.enrolment.section.name,
    },
    allocations: p.allocations.map((a) => ({
      dueId: a.studentFeeDueId,
      description: a.due.description,
      amount: rupees(toPaise(a.allocatedAmount)),
    })),
  };
}

/** "2026-2027" → "2026-27" (used in receipt and payment numbers). */
export const shortYear = (name: string) => {
  const [a, b] = name.split('-');
  return b ? `${a}-${b.slice(-2)}` : name;
};
