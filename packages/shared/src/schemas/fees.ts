import { z } from 'zod';
import { optionalText, paginationQuerySchema, uuidSchema } from './common.js';

// --- Constants ---------------------------------------------------------------------------------

export const BILLING_FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'CUSTOM'] as const;
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];
export const BILLING_FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUAL: 'Annual',
  CUSTOM: 'Custom',
};

export const DUE_STATUSES = ['OPEN', 'PARTIAL', 'PAID', 'WAIVED'] as const;
export type DueStatus = (typeof DUE_STATUSES)[number];
export const DUE_STATUS_LABELS: Record<DueStatus, string> = {
  OPEN: 'Unpaid',
  PARTIAL: 'Part paid',
  PAID: 'Paid',
  WAIVED: 'Waived',
};

export const ADJUSTMENT_TYPES = ['CONCESSION', 'DISCOUNT', 'FINE', 'WAIVER'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];
export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  CONCESSION: 'Concession',
  DISCOUNT: 'Discount',
  FINE: 'Late fine',
  WAIVER: 'Waiver',
};
/** FINE adds to what is owed; the others reduce it. */
export const REDUCING_ADJUSTMENTS: readonly AdjustmentType[] = ['CONCESSION', 'DISCOUNT', 'WAIVER'];

export const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer / UPI',
  CHEQUE: 'Cheque',
};

export const CHEQUE_STATUSES = ['PENDING', 'CLEARED', 'BOUNCED'] as const;
export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];
export const CHEQUE_STATUS_LABELS: Record<ChequeStatus, string> = {
  PENDING: 'Awaiting clearance',
  CLEARED: 'Cleared',
  BOUNCED: 'Bounced',
};

export const PAYMENT_STATUSES = ['POSTED', 'VOID', 'REVERSED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  POSTED: 'Posted',
  VOID: 'Void',
  REVERSED: 'Reversed',
};

// --- Money -------------------------------------------------------------------------------------

/** Rupee amount from a form: number or numeric string, ≥ 0, at most 2 decimal places. */
export const moneySchema = z.coerce
  .number({ error: 'Enter an amount' })
  .min(0, 'Amount cannot be negative')
  .max(99_999_999.99, 'Amount is too large')
  .refine((v) => Math.round(v * 100) === Math.round(v * 100 * 1000) / 1000, {
    message: 'Use at most 2 decimal places',
  });
export const positiveMoneySchema = moneySchema.refine((v) => v > 0, {
  message: 'Amount must be more than zero',
});

/** ₹1,23,456.50 (Indian digit grouping). */
export function formatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

const isoDate = z.iso.date('Enter a valid date');

// --- Fee heads ---------------------------------------------------------------------------------

export const createFeeHeadSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,40}$/, 'Use 2–40 letters, numbers, - or _'),
  name: z.string().trim().min(2, 'Enter a name').max(100),
  description: optionalText(1000),
});
export type CreateFeeHeadInput = z.input<typeof createFeeHeadSchema>;
export const updateFeeHeadSchema = createFeeHeadSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateFeeHeadInput = z.input<typeof updateFeeHeadSchema>;

export interface FeeHeadItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

// --- Fee structures ----------------------------------------------------------------------------

export const feeStructureItemSchema = z.object({
  feeHeadId: uuidSchema,
  amount: moneySchema,
  dueDate: isoDate
    .or(z.literal(''))
    .optional()
    .transform((v) => v || undefined),
  installmentLabel: optionalText(80),
});
export type FeeStructureItemInput = z.input<typeof feeStructureItemSchema>;

export const createFeeStructureSchema = z.object({
  academicYearId: uuidSchema,
  classId: uuidSchema,
  name: z.string().trim().min(2, 'Enter a name').max(120),
  billingFrequency: z.enum(BILLING_FREQUENCIES),
  items: z.array(feeStructureItemSchema).min(1, 'Add at least one fee').max(60),
});
export type CreateFeeStructureInput = z.input<typeof createFeeStructureSchema>;
export type CreateFeeStructureData = z.output<typeof createFeeStructureSchema>;

export const updateFeeStructureSchema = createFeeStructureSchema
  .omit({ academicYearId: true, classId: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateFeeStructureInput = z.input<typeof updateFeeStructureSchema>;
export type UpdateFeeStructureData = z.output<typeof updateFeeStructureSchema>;

export const listFeeStructuresQuerySchema = z.object({ academicYearId: uuidSchema });

export interface FeeStructureItemRow {
  id: string;
  feeHead: { id: string; code: string; name: string };
  amount: number;
  dueDate: string | null;
  installmentLabel: string | null;
  sequenceNo: number;
}

export interface FeeStructureRow {
  id: string;
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  name: string;
  billingFrequency: BillingFrequency;
  isActive: boolean;
  items: FeeStructureItemRow[];
  /** Total of one student's dues under this plan. */
  total: number;
  /** Students who already have dues generated from this plan. */
  studentsBilled: number;
}

export interface GenerateDuesResult {
  students: number;
  duesCreated: number;
  /** Dues that already existed (generation never duplicates). */
  skipped: number;
}

// --- Dues, adjustments & ledger ---------------------------------------------------------------

export const createChargeSchema = z.object({
  feeHeadId: uuidSchema,
  description: z.string().trim().min(2, 'Enter a description').max(160),
  amount: positiveMoneySchema,
  dueDate: isoDate
    .or(z.literal(''))
    .optional()
    .transform((v) => v || undefined),
});
export type CreateChargeInput = z.input<typeof createChargeSchema>;

export const createAdjustmentSchema = z.object({
  adjustmentType: z.enum(ADJUSTMENT_TYPES),
  amount: positiveMoneySchema,
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(1000),
  effectiveDate: isoDate,
});
export type CreateAdjustmentInput = z.input<typeof createAdjustmentSchema>;

export interface AdjustmentItem {
  id: string;
  adjustmentType: AdjustmentType;
  amount: number;
  reason: string;
  approvedBy: string;
  effectiveDate: string;
  createdAt: string;
}

export interface DueItem {
  id: string;
  feeHead: { id: string; code: string; name: string };
  description: string;
  amountDue: number;
  dueDate: string | null;
  status: DueStatus;
  /** Fines added. */
  fines: number;
  /** Concessions + discounts + waivers. */
  reductions: number;
  /** From posted payments only. */
  paid: number;
  balance: number;
  overdue: boolean;
  /** Created from a fee plan (false = one-off charge). */
  fromStructure: boolean;
  adjustments: AdjustmentItem[];
  /** True when nothing has been paid or adjusted yet, so the due may still be deleted. */
  canDelete: boolean;
}

export interface LedgerTotals {
  billed: number;
  fines: number;
  reductions: number;
  paid: number;
  balance: number;
  overdue: number;
}

export interface StudentLedger {
  student: { id: string; fullName: string; admissionNumber: string };
  enrolment: {
    id: string;
    className: string;
    sectionName: string;
    rollNumber: string | null;
    academicYear: { id: string; name: string; status: string };
  } | null;
  /** Every year the student has an enrolment in, newest first (for the year switcher). */
  years: { id: string; name: string; enrolmentId: string }[];
  totals: LedgerTotals;
  dues: DueItem[];
  payments: PaymentListItem[];
}

export const studentLedgerQuerySchema = z.object({ academicYearId: uuidSchema.optional() });

// --- Payments & receipts ----------------------------------------------------------------------

export const recordPaymentSchema = z
  .object({
    enrolmentId: uuidSchema,
    paymentDate: isoDate,
    amountReceived: positiveMoneySchema,
    paymentMode: z.enum(PAYMENT_MODES),
    referenceNumber: optionalText(100),
    bankName: optionalText(100),
    chequeDate: isoDate
      .or(z.literal(''))
      .optional()
      .transform((v) => v || undefined),
    notes: optionalText(1000),
    allocations: z
      .array(z.object({ dueId: uuidSchema, amount: positiveMoneySchema }))
      .min(1, 'Allocate the payment to at least one due')
      .refine((a) => new Set(a.map((x) => x.dueId)).size === a.length, {
        message: 'Each due can appear only once',
      }),
  })
  .superRefine((v, ctx) => {
    const sum = v.allocations.reduce((s, a) => s + Math.round(a.amount * 100), 0);
    if (sum !== Math.round(v.amountReceived * 100)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amountReceived'],
        message: 'The amount received must equal the total allocated to dues',
      });
    }
    if (v.paymentMode === 'CHEQUE') {
      if (!v.referenceNumber)
        ctx.addIssue({
          code: 'custom',
          path: ['referenceNumber'],
          message: 'Enter the cheque number',
        });
      if (!v.bankName)
        ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'Enter the bank name' });
      if (!v.chequeDate)
        ctx.addIssue({ code: 'custom', path: ['chequeDate'], message: 'Enter the cheque date' });
    }
    if (v.paymentMode === 'BANK_TRANSFER' && !v.referenceNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['referenceNumber'],
        message: 'Enter the transaction / UTR number',
      });
    }
  });
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type RecordPaymentData = z.output<typeof recordPaymentSchema>;

export const cancelPaymentSchema = z.object({
  /** VOID = entered by mistake; REVERSED = money returned / not realised. */
  action: z.enum(['VOID', 'REVERSED']),
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(1000),
});
export type CancelPaymentInput = z.infer<typeof cancelPaymentSchema>;

export const chequeStatusSchema = z.object({
  chequeStatus: z.enum(['CLEARED', 'BOUNCED']),
  reason: optionalText(1000),
});
export type ChequeStatusInput = z.input<typeof chequeStatusSchema>;

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  chequeStatus: z.enum(CHEQUE_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

export interface PaymentListItem {
  id: string;
  paymentNumber: string;
  receiptNumber: string | null;
  paymentDate: string;
  amountReceived: number;
  paymentMode: PaymentMode;
  referenceNumber: string | null;
  bankName: string | null;
  chequeDate: string | null;
  chequeStatus: ChequeStatus | null;
  status: PaymentStatus;
  notes: string | null;
  recordedBy: string;
  createdAt: string;
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    className: string;
    sectionName: string;
  };
  allocations: { dueId: string; description: string; amount: number }[];
}

/** Frozen copy of everything printed on a receipt (never changes after issue). */
export interface ReceiptSnapshot {
  school: { name: string; address: string; phone: string; email: string };
  receiptNumber: string;
  paymentNumber: string;
  issuedAt: string;
  issuedBy: string;
  student: {
    name: string;
    admissionNumber: string;
    className: string;
    sectionName: string;
    rollNumber: string | null;
  };
  academicYear: string;
  guardianName: string | null;
  payment: {
    date: string;
    mode: PaymentMode;
    referenceNumber: string | null;
    bankName: string | null;
    chequeDate: string | null;
  };
  lines: { feeHead: string; description: string; amount: number }[];
  total: number;
  totalInWords: string;
  /** Balance still outstanding for the year right after this payment. */
  balanceAfter: number;
}

export interface ReceiptView {
  paymentId: string;
  receiptNumber: string;
  isCancelled: boolean;
  cancellationReason: string | null;
  paymentStatus: PaymentStatus;
  chequeStatus: ChequeStatus | null;
  snapshot: ReceiptSnapshot;
}

// --- Reports -----------------------------------------------------------------------------------

export const duesReportQuerySchema = z.object({
  academicYearId: uuidSchema,
  classId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  overdueOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type DuesReportQuery = z.output<typeof duesReportQuerySchema>;

export interface DuesReportRow {
  studentId: string;
  enrolmentId: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  sectionName: string;
  rollNumber: string | null;
  primaryPhone: string | null;
  billed: number;
  reductions: number;
  fines: number;
  paid: number;
  balance: number;
  overdue: number;
}

export interface DuesReport {
  academicYear: { id: string; name: string };
  rows: DuesReportRow[];
  totals: LedgerTotals;
}

export const collectionReportQuerySchema = z.object({ from: isoDate, to: isoDate });

export interface CollectionReport {
  from: string;
  to: string;
  total: number;
  receipts: number;
  byMode: { paymentMode: PaymentMode; total: number; count: number }[];
  byDay: { date: string; total: number; count: number }[];
  byFeeHead: { feeHead: string; total: number }[];
  /** Cheques received in the period that have not cleared yet (included in the total). */
  chequesPending: { total: number; count: number };
  /** Payments in the period later voided or reversed (excluded from the total). */
  cancelled: { total: number; count: number };
}

export const concessionReportQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  adjustmentType: z.enum(ADJUSTMENT_TYPES).optional(),
});

export interface ConcessionReportRow {
  id: string;
  adjustmentType: AdjustmentType;
  amount: number;
  reason: string;
  effectiveDate: string;
  approvedBy: string;
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    className: string;
    sectionName: string;
  };
  due: string;
}

export interface ConcessionReport {
  rows: ConcessionReportRow[];
  totals: Record<AdjustmentType, number>;
}

export interface FeeSummary {
  today: string;
  collectedToday: number;
  receiptsToday: number;
  overdueBalance: number;
  chequesPending: number;
  /** Current academic year so far: billed (after fines and reductions), collected, still owed. */
  year: {
    name: string;
    billed: number;
    collected: number;
    outstanding: number;
    overdue: number;
  } | null;
}

// --- Amount in words (Indian system) ----------------------------------------------------------

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
}

/** 123456.5 → "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only". */
export function amountInWords(amount: number): string {
  const paise = Math.round(amount * 100);
  let rupees = Math.floor(paise / 100);
  const p = paise % 100;
  if (rupees === 0 && p === 0) return 'Rupees Zero Only';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000);
  rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));
  const words = parts.length ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  return `${words}${p ? ` and ${twoDigits(p)} Paise` : ''} Only`;
}
