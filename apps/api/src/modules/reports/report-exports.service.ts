import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ADJUSTMENT_TYPES,
  ADJUSTMENT_TYPE_LABELS,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  EMPLOYEE_STATUSES,
  ENQUIRY_SOURCE_LABELS,
  ENQUIRY_STATUSES,
  ENQUIRY_STATUS_LABELS,
  ITEM_CONDITION_LABELS,
  MAX_EXPORT_ROWS,
  PAYMENT_MODE_LABELS,
  PAYMENT_STATUS_LABELS,
  REPORT_EXPORTS,
  STUDENT_STATUSES,
  STUDENT_STATUS_LABELS,
  type Paginated,
  type ReportExportKey,
} from '@school/shared';
import { z } from 'zod';
import type { RequestUser } from '../../common/http/request-user.js';
import { schoolDate } from '../../common/utils/content.js';
import { AttendanceReportsService } from '../attendance/attendance-reports.service.js';
import { EnquiriesService } from '../admissions/enquiries.service.js';
import { ComplaintsService } from '../complaints/complaints.module.js';
import { ResultsService } from '../exams/results.service.js';
import { FeeReportsService } from '../fees/fee-reports.service.js';
import { PaymentsService } from '../fees/payments.service.js';
import { InventoryService } from '../inventory/inventory.module.js';
import { PayrollService } from '../payroll/payroll.module.js';
import { EmployeesService } from '../staff/employees.service.js';
import { StudentsService } from '../students/students.service.js';
import { TransportService } from '../transport/transport.module.js';
import { RUPEES, type ExportColumn, type ExportTable } from './export-format.js';
import { OverviewService } from './overview.service.js';

const uuid = z.uuid();
const day = z.iso.date();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const pct = (v: number | null) => (v === null ? null : v);

/** One approved export: its parameters and how to build the table. */
interface ExportDef<P extends z.ZodType = z.ZodType> {
  params: P;
  build: (params: z.output<P>, actor: RequestUser) => Promise<ExportTable<never>>;
}

/** Keeps each export's parameter type tied to its build function. */
function def<P extends z.ZodType>(d: {
  params: P;
  build: (params: z.output<P>, actor: RequestUser) => Promise<ExportTable<never>>;
}): ExportDef {
  return d as unknown as ExportDef;
}

function table<T>(
  title: string,
  meta: string[],
  columns: ExportColumn<T>[],
  rows: T[],
): ExportTable<never> {
  return { title, meta, columns, rows } as unknown as ExportTable<never>;
}

/** Reads every page of a paginated list, up to MAX_EXPORT_ROWS. */
async function allPages<T>(
  load: (page: number, pageSize: number) => Promise<Paginated<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const res = await load(page, 100);
    rows.push(...res.items);
    if (page >= res.totalPages) break;
    if (rows.length >= MAX_EXPORT_ROWS)
      throw new BadRequestException(
        `This export has more than ${MAX_EXPORT_ROWS} rows. Narrow the filters.`,
      );
  }
  return rows;
}

/**
 * The approved exports (ADR 0009). Each one reuses the same service as the screen, so the file
 * always matches what the user sees; permissions come from REPORT_EXPORTS in @school/shared.
 */
@Injectable()
export class ReportExportsService {
  constructor(
    private readonly students: StudentsService,
    private readonly employees: EmployeesService,
    private readonly attendance: AttendanceReportsService,
    private readonly feeReports: FeeReportsService,
    private readonly payments: PaymentsService,
    private readonly results: ResultsService,
    private readonly payroll: PayrollService,
    private readonly inventory: InventoryService,
    private readonly transport: TransportService,
    private readonly complaints: ComplaintsService,
    private readonly enquiries: EnquiriesService,
    private readonly overview: OverviewService,
  ) {}

  private readonly defs: Record<ReportExportKey, ExportDef> = {
    students: def({
      params: z.object({
        academicYearId: uuid.optional(),
        classId: uuid.optional(),
        sectionId: uuid.optional(),
        status: z.enum(STUDENT_STATUSES).optional(),
        search: z.string().max(100).optional(),
      }),
      build: async (p) => {
        const rows = await allPages((page, pageSize) =>
          this.students.list({ ...p, page, pageSize }),
        );
        return table(
          'Students',
          [p.status ? `Status: ${STUDENT_STATUS_LABELS[p.status]}` : 'All statuses'],
          [
            { header: 'Admission no.', value: (r) => r.admissionNumber },
            { header: 'Name', value: (r) => r.fullName, width: 28 },
            { header: 'Class', value: (r) => r.enrolment?.className ?? null },
            { header: 'Section', value: (r) => r.enrolment?.sectionName ?? null },
            { header: 'Roll no.', value: (r) => r.enrolment?.rollNumber ?? null },
            { header: 'Gender', value: (r) => r.gender },
            { header: 'Date of birth', value: (r) => r.dateOfBirth },
            { header: 'Status', value: (r) => STUDENT_STATUS_LABELS[r.status] },
            { header: 'Guardian', value: (r) => r.primaryGuardian?.fullName ?? null, width: 24 },
            { header: 'Guardian phone', value: (r) => r.primaryGuardian?.phone ?? null, width: 16 },
          ],
          rows,
        );
      },
    }),
    strength: def({
      params: z.object({ academicYearId: uuid.optional() }),
      build: async (p) => {
        const r = await this.overview.strength(p.academicYearId);
        return table(
          `Class strength ${r.academicYear?.name ?? ''}`.trim(),
          [],
          [
            { header: 'Class', value: (x) => x.className },
            { header: 'Section', value: (x) => x.sectionName },
            { header: 'Class teacher', value: (x) => x.classTeacher, width: 24 },
            { header: 'Capacity', value: (x) => x.capacity },
            { header: 'Boys', value: (x) => x.boys },
            { header: 'Girls', value: (x) => x.girls },
            { header: 'Other', value: (x) => x.other },
            { header: 'Total', value: (x) => x.total },
            { header: 'New this year', value: (x) => x.newAdmissions },
            { header: 'Left this year', value: (x) => x.left },
            { header: 'Transport', value: (x) => x.transport },
          ],
          [
            ...r.rows,
            {
              ...r.totals,
              sectionId: '',
              className: 'Total',
              sectionName: '',
              classTeacher: null,
              capacity: null,
            },
          ],
        );
      },
    }),
    staff: def({
      params: z.object({
        status: z.enum(EMPLOYEE_STATUSES).optional(),
        department: z.string().max(100).optional(),
      }),
      build: async (p) => {
        const rows = await allPages((page, pageSize) =>
          this.employees.list({ ...p, page, pageSize }),
        );
        return table(
          'Staff',
          [],
          [
            { header: 'Code', value: (r) => r.employeeCode },
            { header: 'Name', value: (r) => r.fullName, width: 26 },
            { header: 'Designation', value: (r) => r.designation, width: 20 },
            { header: 'Department', value: (r) => r.department, width: 18 },
            { header: 'Phone', value: (r) => r.phone, width: 16 },
            { header: 'Email', value: (r) => r.email, width: 28 },
            { header: 'Employment', value: (r) => r.employmentType },
            { header: 'Status', value: (r) => r.status },
            {
              header: 'Login',
              value: (r) => (r.user ? (r.user.email ?? r.user.phone) : null),
              width: 26,
            },
          ],
          rows,
        );
      },
    }),
    'attendance-daily': def({
      params: z.object({ date: day }),
      build: async (p) => {
        const r = await this.attendance.daily(p.date);
        return table(
          `Attendance ${p.date}`,
          [r.academicYear ? `Academic year ${r.academicYear.name}` : 'No current academic year'],
          [
            { header: 'Class', value: (x) => x.className },
            { header: 'Section', value: (x) => x.sectionName },
            { header: 'Class teacher', value: (x) => x.classTeacher, width: 24 },
            { header: 'Students', value: (x) => x.total },
            { header: 'Marked', value: (x) => x.marked },
            { header: 'Present', value: (x) => x.present },
            { header: 'Late', value: (x) => x.late },
            { header: 'Absent', value: (x) => x.absent },
            { header: 'Attendance %', value: (x) => pct(x.percentage) },
          ],
          r.rows,
        );
      },
    }),
    'attendance-monthly': def({
      params: z.object({ month }),
      build: async (p) => {
        const r = await this.attendance.monthly(p.month);
        return table(
          `Attendance ${p.month}`,
          [],
          [
            { header: 'Class', value: (x) => x.className },
            { header: 'Section', value: (x) => x.sectionName },
            { header: 'Students', value: (x) => x.students },
            { header: 'Working days', value: (x) => x.workingDays },
            { header: 'Average %', value: (x) => pct(x.averagePercentage) },
            { header: 'Below threshold', value: (x) => x.lowAttendance },
          ],
          r.rows,
        );
      },
    }),
    'attendance-register': def({
      params: z.object({ sectionId: uuid, month }),
      build: async (p, actor) => {
        const r = await this.attendance.register(p.sectionId, p.month, actor);
        const code = { PRESENT: 'P', ABSENT: 'A', LATE: 'L' } as Record<string, string>;
        return table(
          `Register ${r.section.className} ${r.section.sectionName} ${p.month}`,
          [`Academic year ${r.section.academicYear.name}`, `Working days: ${r.workingDays.length}`],
          [
            { header: 'Roll', value: (x) => x.rollNumber },
            { header: 'Name', value: (x) => x.fullName, width: 26 },
            ...r.days.map((d) => ({
              header: d.slice(8),
              value: (x: (typeof r.rows)[number]) => (x.days[d] ? code[x.days[d]] : null),
              width: 4,
            })),
            { header: 'P', value: (x) => x.present },
            { header: 'L', value: (x) => x.late },
            { header: 'A', value: (x) => x.absent },
            { header: '%', value: (x) => pct(x.percentage) },
          ],
          r.rows,
        );
      },
    }),
    'fee-dues': def({
      params: z.object({
        academicYearId: uuid,
        classId: uuid.optional(),
        sectionId: uuid.optional(),
      }),
      build: async (p) => {
        const r = await this.feeReports.dues(p as Parameters<FeeReportsService['dues']>[0]);
        return table(
          `Fee dues ${r.academicYear.name}`,
          [
            `Outstanding ₹${r.totals.balance.toFixed(2)}, of which overdue ₹${r.totals.overdue.toFixed(2)}`,
          ],
          [
            { header: 'Admission no.', value: (x) => x.admissionNumber },
            { header: 'Name', value: (x) => x.fullName, width: 26 },
            { header: 'Class', value: (x) => x.className },
            { header: 'Section', value: (x) => x.sectionName },
            { header: 'Roll', value: (x) => x.rollNumber },
            { header: 'Phone', value: (x) => x.primaryPhone, width: 16 },
            { header: 'Billed', value: (x) => x.billed, numFmt: RUPEES },
            { header: 'Concessions', value: (x) => x.reductions, numFmt: RUPEES },
            { header: 'Fines', value: (x) => x.fines, numFmt: RUPEES },
            { header: 'Paid', value: (x) => x.paid, numFmt: RUPEES },
            { header: 'Balance', value: (x) => x.balance, numFmt: RUPEES },
            { header: 'Overdue', value: (x) => x.overdue, numFmt: RUPEES },
          ],
          r.rows,
        );
      },
    }),
    payments: def({
      params: z.object({
        from: day.optional(),
        to: day.optional(),
        search: z.string().max(100).optional(),
      }),
      build: async (p) => {
        const rows = await allPages((page, pageSize) =>
          this.payments.list({ ...p, page, pageSize }),
        );
        return table(
          'Payments',
          [p.from || p.to ? `From ${p.from ?? '…'} to ${p.to ?? '…'}` : 'All dates'],
          [
            { header: 'Date', value: (x) => x.paymentDate },
            { header: 'Receipt no.', value: (x) => x.receiptNumber, width: 20 },
            { header: 'Admission no.', value: (x) => x.student.admissionNumber },
            { header: 'Student', value: (x) => x.student.fullName, width: 26 },
            { header: 'Class', value: (x) => `${x.student.className} – ${x.student.sectionName}` },
            { header: 'Mode', value: (x) => PAYMENT_MODE_LABELS[x.paymentMode] },
            { header: 'Reference', value: (x) => x.referenceNumber },
            { header: 'Amount', value: (x) => x.amountReceived, numFmt: RUPEES },
            { header: 'Status', value: (x) => PAYMENT_STATUS_LABELS[x.status] },
            { header: 'Cheque', value: (x) => x.chequeStatus },
            { header: 'Recorded by', value: (x) => x.recordedBy, width: 20 },
          ],
          rows,
        );
      },
    }),
    'fee-concessions': def({
      params: z.object({ from: day, to: day, adjustmentType: z.enum(ADJUSTMENT_TYPES).optional() }),
      build: async (p) => {
        const r = await this.feeReports.concessions(p.from, p.to, p.adjustmentType);
        return table(
          'Concessions and fines',
          [`From ${p.from} to ${p.to}`],
          [
            { header: 'Date', value: (x) => x.effectiveDate },
            { header: 'Type', value: (x) => ADJUSTMENT_TYPE_LABELS[x.adjustmentType] },
            { header: 'Admission no.', value: (x) => x.student.admissionNumber },
            { header: 'Student', value: (x) => x.student.fullName, width: 26 },
            { header: 'Class', value: (x) => `${x.student.className} – ${x.student.sectionName}` },
            { header: 'Due', value: (x) => x.due, width: 24 },
            { header: 'Amount', value: (x) => x.amount, numFmt: RUPEES },
            { header: 'Reason', value: (x) => x.reason, width: 30 },
            { header: 'Approved by', value: (x) => x.approvedBy, width: 20 },
          ],
          r.rows,
        );
      },
    }),
    'exam-results': def({
      params: z.object({ examinationId: uuid, sectionId: uuid }),
      build: async (p, actor) => {
        const r = await this.results.sectionResults(p.examinationId, p.sectionId, actor);
        const subjects = [
          ...new Map(
            r.students.flatMap((s) =>
              s.subjects.map((x) => [x.classSubjectId, x.subjectName] as const),
            ),
          ).entries(),
        ];
        type S = (typeof r.students)[number];
        return table(
          `${r.exam.name} ${r.section.className} ${r.section.sectionName}`,
          [
            `Academic year ${r.section.academicYear}`,
            r.exam.final ? 'Final results' : 'Provisional — not yet finalised',
          ],
          [
            { header: 'Roll', value: (x: S) => x.rollNumber },
            { header: 'Name', value: (x: S) => x.fullName, width: 26 },
            ...subjects.map(([id, name]) => ({
              header: name,
              value: (x: S) => {
                const s = x.subjects.find((y) => y.classSubjectId === id);
                return s ? s.obtained : null;
              },
            })),
            { header: 'Total', value: (x: S) => x.obtained },
            { header: 'Max', value: (x: S) => x.max },
            { header: '%', value: (x: S) => x.percentage },
            { header: 'Grade', value: (x: S) => x.grade },
            { header: 'Result', value: (x: S) => x.result },
            { header: 'Division', value: (x: S) => x.division },
            { header: 'Rank', value: (x: S) => x.rank },
          ],
          r.students,
        );
      },
    }),
    'payroll-register': def({
      params: z.object({ runId: uuid }),
      build: async (p) => {
        const run = await this.payroll.get(p.runId);
        const comps = [
          ...new Map(
            run.records.flatMap((r) => r.lines.map((l) => [l.salaryComponentId, l] as const)),
          ).values(),
        ].sort((a, b) =>
          a.componentType === b.componentType ? 0 : a.componentType === 'EARNING' ? -1 : 1,
        );
        type R = (typeof run.records)[number];
        return table(
          `Payroll ${run.month}`,
          [
            `Status: ${run.status}`,
            `Net pay ₹${run.totals.net.toFixed(2)} for ${run.totals.employees} staff`,
          ],
          [
            { header: 'Code', value: (r: R) => r.employee.employeeCode },
            { header: 'Name', value: (r: R) => r.employee.fullName, width: 24 },
            { header: 'Designation', value: (r: R) => r.employee.designation, width: 18 },
            ...comps.map((c) => ({
              header: c.name,
              value: (r: R) =>
                r.lines.find((l) => l.salaryComponentId === c.salaryComponentId)?.amount ?? null,
              numFmt: RUPEES,
            })),
            { header: 'Gross', value: (r: R) => r.gross, numFmt: RUPEES },
            { header: 'Deductions', value: (r: R) => r.deductions, numFmt: RUPEES },
            { header: 'Net pay', value: (r: R) => r.net, numFmt: RUPEES },
          ],
          run.records,
        );
      },
    }),
    inventory: def({
      params: z.object({ categoryId: uuid.optional() }),
      build: async (p) => {
        const rows = await allPages((page, pageSize) =>
          this.inventory.list({ ...p, page, pageSize }),
        );
        return table(
          'Inventory register',
          [],
          [
            { header: 'Asset code', value: (x) => x.assetCode },
            { header: 'Item', value: (x) => x.name, width: 26 },
            { header: 'Category', value: (x) => x.category.name, width: 18 },
            { header: 'Quantity', value: (x) => x.quantity },
            { header: 'Unit', value: (x) => x.unit },
            { header: 'Location', value: (x) => x.location, width: 18 },
            { header: 'Condition', value: (x) => ITEM_CONDITION_LABELS[x.conditionStatus] },
            { header: 'Purchased', value: (x) => x.purchaseDate },
            { header: 'Cost', value: (x) => x.purchaseCost, numFmt: RUPEES },
          ],
          rows,
        );
      },
    }),
    'transport-riders': def({
      params: z.object({ routeId: uuid.optional() }),
      build: async (p) => {
        const rows = await this.transport.assignments({ routeId: p.routeId });
        return table(
          'Transport riders',
          [`As of ${schoolDate()}`],
          [
            { header: 'Route', value: (x) => x.route.name, width: 24 },
            { header: 'Stop', value: (x) => x.stop?.name ?? null, width: 18 },
            { header: 'Pick-up', value: (x) => x.stop?.pickupTime ?? null },
            { header: 'Admission no.', value: (x) => x.student.admissionNumber },
            { header: 'Student', value: (x) => x.student.fullName, width: 26 },
            { header: 'Class', value: (x) => `${x.student.className} – ${x.student.sectionName}` },
            { header: 'Guardian phone', value: (x) => x.student.guardianPhone, width: 16 },
            { header: 'Since', value: (x) => x.startDate },
          ],
          rows,
        );
      },
    }),
    complaints: def({
      params: z.object({ status: z.enum(COMPLAINT_STATUSES).optional() }),
      build: async (p) => {
        const rows = await allPages((page, pageSize) =>
          this.complaints.list({ ...p, page, pageSize }),
        );
        return table(
          'Complaints',
          [],
          [
            { header: 'Reference', value: (x) => x.referenceNumber, width: 16 },
            { header: 'Logged', value: (x) => x.createdAt.slice(0, 10) },
            { header: 'Category', value: (x) => COMPLAINT_CATEGORY_LABELS[x.category] },
            { header: 'Subject', value: (x) => x.subject, width: 30 },
            { header: 'Raised by', value: (x) => x.submittedByName, width: 20 },
            { header: 'Assigned to', value: (x) => x.assignedTo?.fullName ?? null, width: 20 },
            { header: 'Status', value: (x) => COMPLAINT_STATUS_LABELS[x.status] },
            { header: 'Resolution', value: (x) => x.resolutionNotes, width: 30 },
          ],
          rows,
        );
      },
    }),
    enquiries: def({
      params: z.object({
        status: z.enum(ENQUIRY_STATUSES).optional(),
        from: day.optional(),
        to: day.optional(),
      }),
      build: async (p, actor) => {
        const rows = await allPages((page, pageSize) =>
          this.enquiries.list({ ...p, page, pageSize }, actor),
        );
        return table(
          'Admission enquiries',
          [],
          [
            { header: 'Reference', value: (x) => x.referenceNumber, width: 16 },
            { header: 'Received', value: (x) => x.submittedAt.slice(0, 10) },
            { header: 'Student', value: (x) => x.studentName, width: 24 },
            { header: 'Class sought', value: (x) => x.classSought.name },
            { header: 'Guardian', value: (x) => x.guardianName, width: 22 },
            { header: 'Phone', value: (x) => x.phone, width: 16 },
            { header: 'Source', value: (x) => ENQUIRY_SOURCE_LABELS[x.source] },
            { header: 'Status', value: (x) => ENQUIRY_STATUS_LABELS[x.status] },
            { header: 'Assigned to', value: (x) => x.assignedTo?.fullName ?? null, width: 20 },
          ],
          rows,
        );
      },
    }),
  };

  /** Validates the key, the user's permission and the parameters, then builds the table. */
  async build(key: string, query: Record<string, unknown>, actor: RequestUser) {
    if (!(key in REPORT_EXPORTS)) throw new NotFoundException('Unknown report');
    const k = key as ReportExportKey;
    const permission = REPORT_EXPORTS[k].permission;
    if (!actor.permissions.has(permission))
      throw new ForbiddenException('You do not have permission to export this report');
    const { format: _format, ...rest } = query;
    const parsed = this.defs[k].params.safeParse(rest);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    const result = await this.defs[k].build(parsed.data, actor);
    if (result.rows.length > MAX_EXPORT_ROWS)
      throw new BadRequestException(
        `This export has more than ${MAX_EXPORT_ROWS} rows. Narrow the filters.`,
      );
    return { key: k, params: parsed.data as Record<string, unknown>, table: result };
  }
}
