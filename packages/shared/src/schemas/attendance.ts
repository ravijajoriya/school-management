import { z } from 'zod';
import { optionalText, uuidSchema } from './common.js';

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
};
/** One-letter codes used in registers. */
export const ATTENDANCE_STATUS_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
};

/**
 * Sessions in use. The school takes attendance once a day (ADR 0005); the database also accepts
 * MORNING and AFTERNOON so half-day sessions can be switched on later without a migration.
 */
export const ATTENDANCE_SESSIONS = ['FULL_DAY'] as const;
export type AttendanceSession = (typeof ATTENDANCE_SESSIONS)[number];

/** RBSE expects at least 75% attendance; students below this are highlighted in reports. */
export const ATTENDANCE_LOW_THRESHOLD = 75;

/** Late counts as attended (school decision, ADR 0005). One decimal place; null when nothing is marked. */
export function attendancePercentage(present: number, late: number, marked: number): number | null {
  if (!marked) return null;
  return Math.round(((present + late) / marked) * 1000) / 10;
}

const isoDate = z.iso.date('Enter a valid date');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');

// --- Sheet & marking -------------------------------------------------------------------------

export const attendanceSheetQuerySchema = z.object({
  sectionId: uuidSchema,
  date: isoDate,
  session: z.enum(ATTENDANCE_SESSIONS).default('FULL_DAY'),
});
export type AttendanceSheetQuery = z.infer<typeof attendanceSheetQuerySchema>;

export const attendanceEntrySchema = z.object({
  enrolmentId: uuidSchema,
  status: z.enum(ATTENDANCE_STATUSES, 'Choose Present, Absent or Late'),
  remarks: optionalText(255),
});

/** One request for both the whole-class sheet and a single student: send 1..n entries. */
export const markAttendanceSchema = z.object({
  sectionId: uuidSchema,
  date: isoDate,
  session: z.enum(ATTENDANCE_SESSIONS).default('FULL_DAY'),
  entries: z
    .array(attendanceEntrySchema)
    .min(1, 'Mark at least one student')
    .max(300)
    .refine((e) => new Set(e.map((x) => x.enrolmentId)).size === e.length, {
      message: 'Each student can appear only once',
    }),
  /** Required for any change to a past date (office corrections only). */
  correctionReason: z.string().trim().max(500).optional(),
});
export type MarkAttendanceInput = z.input<typeof markAttendanceSchema>;
export type MarkAttendanceData = z.output<typeof markAttendanceSchema>;

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
}

export interface AttendanceSheetRow {
  enrolmentId: string;
  studentId: string;
  rollNumber: string | null;
  fullName: string;
  status: AttendanceStatus | null;
  remarks: string | null;
  markedBy: string | null;
  markedAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  correctionReason: string | null;
}

export interface AttendanceSheet {
  section: {
    id: string;
    className: string;
    sectionName: string;
    academicYear: { id: string; name: string; status: string };
    classTeacher: { id: string; fullName: string } | null;
  };
  date: string;
  session: AttendanceSession;
  isToday: boolean;
  canEdit: boolean;
  /** True when saving changes needs a correction reason (past dates). */
  requiresReason: boolean;
  /** Why the sheet is read-only, if it is. */
  lockedReason: string | null;
  summary: AttendanceCounts & { total: number; marked: number };
  rows: AttendanceSheetRow[];
}

export interface MarkAttendanceResult {
  created: number;
  updated: number;
  unchanged: number;
}

/** Class-teacher sections for the teacher portal, with today's progress. */
export interface TeacherAttendanceSection {
  sectionId: string;
  className: string;
  sectionName: string;
  academicYear: { id: string; name: string };
  today: string;
  total: number;
  markedToday: number;
}

// --- Reports ---------------------------------------------------------------------------------

export const dailyReportQuerySchema = z.object({ date: isoDate });

export interface DailyReportRow extends AttendanceCounts {
  sectionId: string;
  className: string;
  sectionName: string;
  classTeacher: string | null;
  /** The class teacher has approved leave covering this date. */
  classTeacherOnLeave: boolean;
  total: number;
  marked: number;
  percentage: number | null;
}

export interface DailyReport {
  date: string;
  academicYear: { id: string; name: string } | null;
  rows: DailyReportRow[];
  totals: AttendanceCounts & { total: number; marked: number; percentage: number | null };
  sectionsNotMarked: number;
}

export const monthlyReportQuerySchema = z.object({ month: monthSchema });

export interface MonthlyReportRow {
  sectionId: string;
  className: string;
  sectionName: string;
  students: number;
  /** Days on which attendance was taken for the section. */
  workingDays: number;
  averagePercentage: number | null;
  /** Students below ATTENDANCE_LOW_THRESHOLD for the month. */
  lowAttendance: number;
}

export interface MonthlyReport {
  month: string;
  academicYear: { id: string; name: string } | null;
  rows: MonthlyReportRow[];
}

export const sectionRegisterQuerySchema = z.object({ sectionId: uuidSchema, month: monthSchema });

export interface RegisterRow extends AttendanceCounts {
  enrolmentId: string;
  studentId: string;
  rollNumber: string | null;
  fullName: string;
  /** YYYY-MM-DD → status, only for days that were marked. */
  days: Record<string, AttendanceStatus>;
  marked: number;
  percentage: number | null;
}

export interface SectionRegister {
  section: {
    id: string;
    className: string;
    sectionName: string;
    academicYear: { id: string; name: string };
  };
  month: string;
  /** Every date of the month that falls inside the academic year. */
  days: string[];
  /** Dates on which attendance was taken. */
  workingDays: string[];
  rows: RegisterRow[];
}

export const studentAttendanceQuerySchema = z.object({ academicYearId: uuidSchema.optional() });

export interface StudentAttendanceMonth extends AttendanceCounts {
  month: string;
  marked: number;
  percentage: number | null;
}

export interface StudentAttendanceSummary {
  studentId: string;
  enrolment: {
    id: string;
    className: string;
    sectionName: string;
    academicYear: { id: string; name: string };
  } | null;
  totals: AttendanceCounts & { marked: number; percentage: number | null };
  months: StudentAttendanceMonth[];
  /** Absences and late arrivals, newest first (at most 30). */
  recent: { date: string; status: AttendanceStatus; remarks: string | null }[];
}
