import { z } from 'zod';
import { PERMISSIONS, type PermissionCode } from '../permissions.js';
import type { EnquirySummary } from './admissions.js';
import type { FeeSummary } from './fees.js';
import type { LeaveSummary } from './leave.js';

// --- Exports -----------------------------------------------------------------------------------

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * The approved exports. Each one is permission-checked on the server, audited, and limited to
 * MAX_EXPORT_ROWS rows. Parameters are passed as query-string values.
 */
export const REPORT_EXPORTS = {
  students: { label: 'Students', permission: PERMISSIONS.STUDENTS_READ },
  strength: { label: 'Class strength', permission: PERMISSIONS.STUDENTS_READ },
  staff: { label: 'Staff', permission: PERMISSIONS.EMPLOYEES_READ },
  'attendance-daily': { label: 'Attendance – daily', permission: PERMISSIONS.ATTENDANCE_READ },
  'attendance-monthly': { label: 'Attendance – monthly', permission: PERMISSIONS.ATTENDANCE_READ },
  'attendance-register': { label: 'Attendance register', permission: PERMISSIONS.ATTENDANCE_READ },
  'fee-dues': { label: 'Fee dues', permission: PERMISSIONS.FEES_READ },
  payments: { label: 'Payments & receipts', permission: PERMISSIONS.FEES_READ },
  'fee-concessions': { label: 'Concessions & fines', permission: PERMISSIONS.FEES_READ },
  'exam-results': { label: 'Exam results', permission: PERMISSIONS.EXAMS_READ },
  'payroll-register': { label: 'Payroll register', permission: PERMISSIONS.PAYROLL_READ },
  inventory: { label: 'Inventory register', permission: PERMISSIONS.INVENTORY_READ },
  'transport-riders': { label: 'Transport riders', permission: PERMISSIONS.TRANSPORT_READ },
  complaints: { label: 'Complaints', permission: PERMISSIONS.COMPLAINTS_READ },
  enquiries: { label: 'Admission enquiries', permission: PERMISSIONS.ENQUIRIES_READ },
} as const satisfies Record<string, { label: string; permission: PermissionCode }>;
export type ReportExportKey = keyof typeof REPORT_EXPORTS;
export const REPORT_EXPORT_KEYS = Object.keys(REPORT_EXPORTS) as ReportExportKey[];

export const MAX_EXPORT_ROWS = 20_000;

export const exportFormatQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS).default('csv'),
});

// --- Class strength ----------------------------------------------------------------------------

export const strengthQuerySchema = z.object({ academicYearId: z.uuid().optional() });

export interface StrengthRow {
  sectionId: string;
  className: string;
  sectionName: string;
  classTeacher: string | null;
  capacity: number | null;
  boys: number;
  girls: number;
  other: number;
  total: number;
  /** Joined during the year (enrolment date after the year started). */
  newAdmissions: number;
  /** Transferred / withdrawn during the year. */
  left: number;
  transport: number;
}

export interface StrengthReport {
  academicYear: { id: string; name: string } | null;
  rows: StrengthRow[];
  totals: Omit<
    StrengthRow,
    'sectionId' | 'className' | 'sectionName' | 'classTeacher' | 'capacity'
  >;
}

// --- Dashboard ---------------------------------------------------------------------------------

/** Everything the admin dashboard shows, in one request. Sections the user may not see are null. */
export interface DashboardOverview {
  today: string;
  students: {
    active: number;
    newThisMonth: number;
    academicYear: string | null;
  } | null;
  attendance: { percentage: number | null; sectionsNotMarked: number; sections: number } | null;
  fees: FeeSummary | null;
  leave: LeaveSummary | null;
  enquiries: EnquirySummary | null;
  unreadMessages: number | null;
  exams: { marksAwaitingApproval: number; examsInMarksEntry: number } | null;
  complaints: { open: number; inProgress: number } | null;
  meetings: { next7Days: number } | null;
  transport: { riders: number; vehiclesDue: number } | null;
  inventory: { needsAttention: number } | null;
  payroll: { month: string; status: string | null; net: number | null } | null;
}
