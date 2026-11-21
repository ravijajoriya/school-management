import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  amountInWords,
  formatRupees,
  type CancelPaymentInput,
  type ChequeStatus,
  type ListPaymentsQuery,
  type Paginated,
  type PaymentListItem,
  type PaymentStatus,
  type ReceiptSnapshot,
  type ReceiptView,
  type RecordPaymentData,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, paginated, schoolDate } from '../../common/utils/content.js';
import { paiseToDb, rupees } from '../../common/utils/money.js';
import { AuditService } from '../audit/audit.service.js';
import {
  dueInclude,
  dueMath,
  lockDues,
  paymentInclude,
  shortYear,
  syncDueStatuses,
  toPaymentItem,
} from './fees-core.js';

/** Serialises number generation so payment and receipt numbers are gapless per academic year. */
const NUMBERING_LOCK = 52_026;

/** Manual payments (cash, bank transfer, cheque), their allocation to dues, and receipts. */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async nextNumber(tx: Prisma.TransactionClient, kind: 'PAY' | 'RCT', yearName: string) {
    const prefix = `${kind}/${shortYear(yearName)}/`;
    const last =
      kind === 'PAY'
        ? (
            await tx.payment.findFirst({
              where: { paymentNumber: { startsWith: prefix } },
              orderBy: { paymentNumber: 'desc' },
              select: { paymentNumber: true },
            })
          )?.paymentNumber
        : (
            await tx.receipt.findFirst({
              where: { receiptNumber: { startsWith: prefix } },
              orderBy: { receiptNumber: 'desc' },
              select: { receiptNumber: true },
            })
          )?.receiptNumber;
    const next = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  private async schoolDetails() {
    const page = await this.prisma.websitePage.findUnique({ where: { pageKey: 'site' } });
    const c = (page?.publishedContentJson ?? page?.contentJson ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
    return {
      name: s('schoolName') || 'School',
      address: s('address'),
      phone: s('phone'),
      email: s('email'),
    };
  }

  async record(
    input: RecordPaymentData,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<{ paymentId: string; receiptNumber: string }> {
    if (input.paymentDate > schoolDate()) {
      throw new BadRequestException(['paymentDate: A payment cannot be dated in the future']);
    }
    const enrolment = await this.prisma.studentEnrolment.findUnique({
      where: { id: input.enrolmentId },
      include: {
        academicYear: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        student: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            admissionNumber: true,
            guardians: { where: { isPrimary: true }, select: { fullName: true }, take: 1 },
          },
        },
      },
    });
    if (!enrolment) throw new BadRequestException(['enrolmentId: Enrolment not found']);
    const school = await this.schoolDetails();
    const dueIds = input.allocations.map((a) => a.dueId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NUMBERING_LOCK})`;
      await lockDues(tx, dueIds);
      const dues = await tx.studentFeeDue.findMany({
        where: { id: { in: dueIds } },
        include: dueInclude,
      });
      if (
        dues.length !== dueIds.length ||
        dues.some((d) => d.studentEnrolmentId !== enrolment.id)
      ) {
        throw new BadRequestException([
          'allocations: Some dues do not belong to this student and year',
        ]);
      }
      const byId = new Map(dues.map((d) => [d.id, d]));
      for (const a of input.allocations) {
        const due = byId.get(a.dueId)!;
        const { balance } = dueMath(due);
        if (Math.round(a.amount * 100) > balance) {
          throw new BadRequestException([
            `allocations: ${due.description} has only ${formatRupees(rupees(Math.max(balance, 0)))} outstanding`,
          ]);
        }
      }

      const paymentNumber = await this.nextNumber(tx, 'PAY', enrolment.academicYear.name);
      const receiptNumber = await this.nextNumber(tx, 'RCT', enrolment.academicYear.name);
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          studentEnrolmentId: enrolment.id,
          paymentDate: dayToDate(input.paymentDate),
          amountReceived: paiseToDb(Math.round(input.amountReceived * 100)),
          paymentMode: input.paymentMode,
          referenceNumber: input.referenceNumber ?? null,
          bankName: input.bankName ?? null,
          chequeDate: input.chequeDate ? dayToDate(input.chequeDate) : null,
          chequeStatus: input.paymentMode === 'CHEQUE' ? 'PENDING' : null,
          notes: input.notes ?? null,
          recordedBy: actor.id,
          allocations: {
            create: input.allocations.map((a) => ({
              studentFeeDueId: a.dueId,
              allocatedAmount: paiseToDb(Math.round(a.amount * 100)),
            })),
          },
        },
      });
      await syncDueStatuses(tx, dueIds);

      const yearDues = await tx.studentFeeDue.findMany({
        where: { studentEnrolmentId: enrolment.id },
        include: dueInclude,
      });
      const balanceAfter = yearDues.reduce((s, d) => s + Math.max(dueMath(d).balance, 0), 0);
      const s = enrolment.student;
      const snapshot: ReceiptSnapshot = {
        school,
        receiptNumber,
        paymentNumber,
        issuedAt: new Date().toISOString(),
        issuedBy: actor.fullName,
        student: {
          name: fullName(s.firstName, s.middleName, s.lastName),
          admissionNumber: s.admissionNumber,
          className: enrolment.class.name,
          sectionName: enrolment.section.name,
          rollNumber: enrolment.rollNumber,
        },
        academicYear: enrolment.academicYear.name,
        guardianName: s.guardians[0]?.fullName ?? null,
        payment: {
          date: input.paymentDate,
          mode: input.paymentMode,
          referenceNumber: input.referenceNumber ?? null,
          bankName: input.bankName ?? null,
          chequeDate: input.chequeDate ?? null,
        },
        lines: input.allocations.map((a) => {
          const due = byId.get(a.dueId)!;
          return { feeHead: due.feeHead.name, description: due.description, amount: a.amount };
        }),
        total: input.amountReceived,
        totalInWords: amountInWords(input.amountReceived),
        balanceAfter: rupees(balanceAfter),
      };
      await tx.receipt.create({
        data: {
          paymentId: payment.id,
          receiptNumber,
          issuedBy: actor.id,
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.PAYMENT_RECORDED,
          entityType: 'payment',
          entityId: payment.id,
          userId: actor.id,
          after: {
            paymentNumber,
            receiptNumber,
            student: snapshot.student.admissionNumber,
            amount: input.amountReceived,
            mode: input.paymentMode,
            allocations: snapshot.lines,
          },
          context,
        },
        tx,
      );
      return { paymentId: payment.id, receiptNumber };
    });
  }

  async list(query: ListPaymentsQuery): Promise<Paginated<PaymentListItem>> {
    const terms = (query.search ?? '').split(/\s+/).filter(Boolean);
    const where: Prisma.PaymentWhereInput = {
      paymentDate:
        query.from || query.to
          ? {
              gte: query.from ? dayToDate(query.from) : undefined,
              lte: query.to ? dayToDate(query.to) : undefined,
            }
          : undefined,
      paymentMode: query.paymentMode,
      status: query.status,
      chequeStatus: query.chequeStatus,
      AND: terms.map((t) => ({
        OR: [
          { paymentNumber: { contains: t, mode: 'insensitive' as const } },
          { referenceNumber: { contains: t, mode: 'insensitive' as const } },
          { receipt: { receiptNumber: { contains: t, mode: 'insensitive' as const } } },
          {
            enrolment: {
              student: { admissionNumber: { contains: t, mode: 'insensitive' as const } },
            },
          },
          { enrolment: { student: { firstName: { contains: t, mode: 'insensitive' as const } } } },
          { enrolment: { student: { lastName: { contains: t, mode: 'insensitive' as const } } } },
        ],
      })),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginated(rows.map(toPaymentItem), total, query.page, query.pageSize);
  }

  async receipt(paymentId: string): Promise<ReceiptView> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { receipt: true },
    });
    if (!p?.receipt) throw new NotFoundException('Receipt not found');
    return {
      paymentId: p.id,
      receiptNumber: p.receipt.receiptNumber,
      isCancelled: p.receipt.isCancelled,
      cancellationReason: p.receipt.cancellationReason,
      paymentStatus: p.status as PaymentStatus,
      chequeStatus: p.chequeStatus as ChequeStatus | null,
      snapshot: p.receipt.snapshotJson as unknown as ReceiptSnapshot,
    };
  }

  /** VOID (entered by mistake) or REVERSED (money returned): the dues become payable again. */
  async cancel(
    paymentId: string,
    input: CancelPaymentInput,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<PaymentListItem> {
    return this.closePayment(
      paymentId,
      input.action,
      input.reason,
      actor,
      context,
      input.action === 'VOID' ? AUDIT_ACTIONS.PAYMENT_VOIDED : AUDIT_ACTIONS.PAYMENT_REVERSED,
    );
  }

  async chequeCleared(
    paymentId: string,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<PaymentListItem> {
    const p = await this.loadPendingCheque(paymentId);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: p.id, chequeStatus: 'PENDING', status: 'POSTED' },
        data: { chequeStatus: 'CLEARED' },
      });
      if (!count) throw new ConflictException('This cheque was just updated by someone else');
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.CHEQUE_CLEARED,
          entityType: 'payment',
          entityId: p.id,
          userId: actor.id,
          before: { chequeStatus: 'PENDING' },
          after: { chequeStatus: 'CLEARED' },
          context,
        },
        tx,
      );
      return toPaymentItem(
        await tx.payment.findUniqueOrThrow({ where: { id: p.id }, include: paymentInclude }),
      );
    });
  }

  /** A bounced cheque reverses the payment (dues reopen) and cancels its receipt. */
  async chequeBounced(
    paymentId: string,
    reason: string | undefined,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<PaymentListItem> {
    await this.loadPendingCheque(paymentId);
    return this.closePayment(
      paymentId,
      'REVERSED',
      `Cheque bounced${reason ? `: ${reason}` : ''}`,
      actor,
      context,
      AUDIT_ACTIONS.CHEQUE_BOUNCED,
      true,
    );
  }

  private async loadPendingCheque(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundException('Payment not found');
    if (p.paymentMode !== 'CHEQUE' || p.chequeStatus !== 'PENDING' || p.status !== 'POSTED') {
      throw new BadRequestException(
        'Only a posted cheque that is awaiting clearance can be updated',
      );
    }
    return p;
  }

  private async closePayment(
    paymentId: string,
    status: 'VOID' | 'REVERSED',
    reason: string,
    actor: RequestUser,
    context: RequestContext,
    action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
    bounced = false,
  ): Promise<PaymentListItem> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: true },
    });
    if (!p) throw new NotFoundException('Payment not found');
    if (p.status !== 'POSTED')
      throw new ConflictException(`This payment is already ${p.status.toLowerCase()}`);
    const dueIds = p.allocations.map((a) => a.studentFeeDueId);
    return this.prisma.$transaction(async (tx) => {
      await lockDues(tx, dueIds);
      const { count } = await tx.payment.updateMany({
        where: { id: p.id, status: 'POSTED' },
        data: { status, ...(bounced ? { chequeStatus: 'BOUNCED' } : {}) },
      });
      if (!count) throw new ConflictException('This payment was just changed by someone else');
      await tx.receipt.updateMany({
        where: { paymentId: p.id, isCancelled: false },
        data: { isCancelled: true, cancellationReason: reason },
      });
      await syncDueStatuses(tx, dueIds);
      await this.audit.log(
        {
          action,
          entityType: 'payment',
          entityId: p.id,
          userId: actor.id,
          before: { status: 'POSTED', chequeStatus: p.chequeStatus },
          after: {
            status,
            chequeStatus: bounced ? 'BOUNCED' : p.chequeStatus,
            amount: rupees(Math.round(Number(p.amountReceived) * 100)),
          },
          reason,
          context,
        },
        tx,
      );
      return toPaymentItem(
        await tx.payment.findUniqueOrThrow({ where: { id: p.id }, include: paymentInclude }),
      );
    });
  }
}
