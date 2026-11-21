import { z } from 'zod';
import { optionalText, uuidSchema } from './common.js';

// --- Constants ---------------------------------------------------------------------------------

export const EXAM_TYPES = ['UNIT_TEST', 'HALF_YEARLY', 'ANNUAL', 'PRE_BOARD', 'OTHER'] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  UNIT_TEST: 'Unit test',
  HALF_YEARLY: 'Half-yearly',
  ANNUAL: 'Annual',
  PRE_BOARD: 'Pre-board',
  OTHER: 'Other',
};

/** DRAFT → SCHEDULED → MARKS_ENTRY → FINALIZED (final; results are then locked). */
export const EXAM_STATUSES = ['DRAFT', 'SCHEDULED', 'MARKS_ENTRY', 'FINALIZED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];
export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  MARKS_ENTRY: 'Marks entry open',
  FINALIZED: 'Finalised',
};

/** Per student mark: DRAFT (teacher editing) → SUBMITTED → APPROVED → FINAL (exam finalised). */
export const MARK_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'FINAL'] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];
export const MARK_STATUS_LABELS: Record<MarkStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  FINAL: 'Final',
};

export const EXAM_COMPONENTS = ['Theory', 'Practical', 'Internal assessment'] as const;

/** Default pass mark when none is set: 33% of the maximum (RBSE). */
export const DEFAULT_PASS_PERCENT = 33;

/** RBSE-style divisions for a passed result (school to confirm — ADR 0007). */
export const RESULT_DIVISIONS = [
  { label: 'First division', minPercentage: 60 },
  { label: 'Second division', minPercentage: 45 },
  { label: 'Third division', minPercentage: 33 },
] as const;

export function divisionFor(percentage: number): string | null {
  return RESULT_DIVISIONS.find((d) => percentage >= d.minPercentage)?.label ?? null;
}

/** Suggested starting scale (8 bands); every scale is editable until a finalised exam uses it. */
export const DEFAULT_GRADE_BANDS = [
  { minPercentage: 91, maxPercentage: 100, gradeLabel: 'A1', remark: 'Outstanding' },
  { minPercentage: 81, maxPercentage: 90.99, gradeLabel: 'A2', remark: 'Excellent' },
  { minPercentage: 71, maxPercentage: 80.99, gradeLabel: 'B1', remark: 'Very good' },
  { minPercentage: 61, maxPercentage: 70.99, gradeLabel: 'B2', remark: 'Good' },
  { minPercentage: 51, maxPercentage: 60.99, gradeLabel: 'C1', remark: 'Above average' },
  { minPercentage: 41, maxPercentage: 50.99, gradeLabel: 'C2', remark: 'Average' },
  { minPercentage: 33, maxPercentage: 40.99, gradeLabel: 'D', remark: 'Pass' },
  { minPercentage: 0, maxPercentage: 32.99, gradeLabel: 'E', remark: 'Needs improvement' },
] as const;

const isoDate = z.iso.date('Enter a valid date');
const optionalDate = isoDate
  .or(z.literal(''))
  .optional()
  .transform((v) => v || undefined);
const marksNumber = z.coerce
  .number({ error: 'Enter a number' })
  .min(0, 'Cannot be negative')
  .max(9999.99)
  .refine((v) => Math.round(v * 100) === Math.round(v * 100000) / 1000, {
    message: 'Use at most 2 decimal places',
  });

// --- Examinations ------------------------------------------------------------------------------

export const createExaminationSchema = z
  .object({
    academicYearId: uuidSchema,
    classId: uuidSchema,
    name: z.string().trim().min(2, 'Enter a name').max(120),
    examType: z.enum(EXAM_TYPES),
    startDate: optionalDate,
    endDate: optionalDate,
    gradingScaleId: uuidSchema
      .or(z.literal(''))
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  });
export type CreateExaminationInput = z.input<typeof createExaminationSchema>;
export type CreateExaminationData = z.output<typeof createExaminationSchema>;

export const updateExaminationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  examType: z.enum(EXAM_TYPES).optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  gradingScaleId: uuidSchema.nullable().optional(),
});
export type UpdateExaminationInput = z.infer<typeof updateExaminationSchema>;

export const examSubjectInputSchema = z
  .object({
    classSubjectId: uuidSchema,
    componentName: optionalText(80),
    examDate: optionalDate,
    maxMarks: marksNumber.refine((v) => v > 0, { message: 'Maximum marks must be more than zero' }),
    passMarks: marksNumber.optional(),
  })
  .refine((v) => v.passMarks === undefined || v.passMarks <= v.maxMarks, {
    path: ['passMarks'],
    message: 'Pass marks cannot exceed maximum marks',
  });
export type ExamSubjectInput = z.input<typeof examSubjectInputSchema>;

export const setExamSubjectsSchema = z.object({
  subjects: z
    .array(examSubjectInputSchema)
    .min(1, 'Add at least one subject')
    .max(60)
    .refine(
      (s) =>
        new Set(s.map((x) => `${x.classSubjectId}|${(x.componentName ?? '').toLowerCase()}`))
          .size === s.length,
      { message: 'A subject can appear only once per component' },
    ),
});
export type SetExamSubjectsInput = z.input<typeof setExamSubjectsSchema>;
export type SetExamSubjectsData = z.output<typeof setExamSubjectsSchema>;

export const examStatusSchema = z.object({ status: z.enum(['DRAFT', 'SCHEDULED', 'MARKS_ENTRY']) });
export const listExaminationsQuerySchema = z.object({
  academicYearId: uuidSchema,
  classId: uuidSchema.optional(),
});

export interface ExamSubjectItem {
  id: string;
  classSubjectId: string;
  subject: { id: string; name: string; code: string | null };
  subjectType: string;
  componentName: string | null;
  /** "Science — Practical" */
  label: string;
  examDate: string | null;
  maxMarks: number;
  passMarks: number;
  sequenceNo: number;
}

export interface ExaminationItem {
  id: string;
  academicYear: { id: string; name: string };
  class: { id: string; name: string };
  name: string;
  examType: ExamType;
  startDate: string | null;
  endDate: string | null;
  status: ExamStatus;
  gradingScale: { id: string; name: string } | null;
  subjects: ExamSubjectItem[];
  /** Marks progress over every (subject × section × student). */
  progress: { expected: number; entered: number; approved: number };
}

export interface ExamProgressRow {
  examSubjectId: string;
  subjectLabel: string;
  sectionId: string;
  sectionLabel: string;
  teachers: string[];
  students: number;
  notEntered: number;
  draft: number;
  submitted: number;
  approved: number;
  final: number;
}

// --- Marks -------------------------------------------------------------------------------------

export const marksSheetQuerySchema = z.object({ examSubjectId: uuidSchema, sectionId: uuidSchema });

export const saveMarksSchema = z.object({
  examSubjectId: uuidSchema,
  sectionId: uuidSchema,
  entries: z
    .array(
      z.object({
        enrolmentId: uuidSchema,
        /** null with isAbsent=false clears a draft entry. */
        marks: marksNumber.nullable(),
        isAbsent: z.boolean().default(false),
        remarks: optionalText(255),
      }),
    )
    .min(1)
    .max(300)
    .refine((e) => new Set(e.map((x) => x.enrolmentId)).size === e.length, {
      message: 'Each student can appear only once',
    }),
});
export type SaveMarksInput = z.input<typeof saveMarksSchema>;
export type SaveMarksData = z.output<typeof saveMarksSchema>;

export const marksActionSchema = z.object({ examSubjectId: uuidSchema, sectionId: uuidSchema });
export const reviewMarksSchema = marksActionSchema.extend({
  decision: z.enum(['APPROVE', 'RETURN']),
  remarks: optionalText(500),
});
export type ReviewMarksInput = z.input<typeof reviewMarksSchema>;

export interface MarksSheetRow {
  enrolmentId: string;
  studentId: string;
  rollNumber: string | null;
  fullName: string;
  marks: number | null;
  isAbsent: boolean;
  remarks: string | null;
  status: MarkStatus | null;
  enteredBy: string | null;
  approvedBy: string | null;
}

export interface MarksSheet {
  exam: { id: string; name: string; status: ExamStatus; className: string };
  subject: ExamSubjectItem;
  section: { id: string; className: string; sectionName: string };
  /** The signed-in user may edit DRAFT marks now. */
  canEdit: boolean;
  canSubmit: boolean;
  canReview: boolean;
  lockedReason: string | null;
  summary: {
    students: number;
    notEntered: number;
    draft: number;
    submitted: number;
    approved: number;
    final: number;
  };
  rows: MarksSheetRow[];
}

export type MarksTaskStatus = 'NOT_STARTED' | MarkStatus | 'MIXED';

/** One line of a teacher's "marks to enter" list. */
export interface MarksTask {
  examId: string;
  examName: string;
  examSubjectId: string;
  subjectLabel: string;
  examDate: string | null;
  maxMarks: number;
  sectionId: string;
  className: string;
  sectionName: string;
  students: number;
  entered: number;
  status: MarksTaskStatus;
}

// --- Grading -----------------------------------------------------------------------------------

export const gradeBandSchema = z
  .object({
    minPercentage: z.coerce.number().min(0).max(100),
    maxPercentage: z.coerce.number().min(0).max(100),
    gradeLabel: z.string().trim().min(1, 'Enter a grade').max(10),
    remark: optionalText(100),
  })
  .refine((b) => b.maxPercentage >= b.minPercentage, {
    path: ['maxPercentage'],
    message: 'Max must be ≥ min',
  });

/** Bands must cover 0–100 with no gaps or overlaps (steps of 0.01). */
function bandsCoverAll(bands: { minPercentage: number; maxPercentage: number }[]) {
  const sorted = [...bands].sort((a, b) => a.minPercentage - b.minPercentage);
  if (!sorted.length || sorted[0].minPercentage !== 0 || sorted.at(-1)!.maxPercentage !== 100)
    return false;
  return sorted.every(
    (b, i) => i === 0 || Math.round((b.minPercentage - sorted[i - 1].maxPercentage) * 100) === 1,
  );
}

export const saveGradingScaleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(100),
  academicYearId: uuidSchema.nullable().optional(),
  classId: uuidSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  bands: z.array(gradeBandSchema).min(2).max(20).refine(bandsCoverAll, {
    message:
      'Grade bands must cover 0 to 100% with no gaps or overlaps (e.g. 81–90.99, then 91–100)',
  }),
});
export type SaveGradingScaleInput = z.input<typeof saveGradingScaleSchema>;
export type SaveGradingScaleData = z.output<typeof saveGradingScaleSchema>;

export interface GradeBandItem {
  minPercentage: number;
  maxPercentage: number;
  gradeLabel: string;
  remark: string | null;
}

export interface GradingScaleItem {
  id: string;
  name: string;
  academicYear: { id: string; name: string } | null;
  class: { id: string; name: string } | null;
  isActive: boolean;
  bands: GradeBandItem[];
  /** Used by a finalised exam: locked so published results never change. */
  locked: boolean;
}

// --- Results -----------------------------------------------------------------------------------

export type ResultStatus = 'PASS' | 'FAIL' | 'INCOMPLETE';

export interface SubjectResult {
  classSubjectId: string;
  subjectName: string;
  optional: boolean;
  components: {
    name: string | null;
    max: number;
    pass: number;
    obtained: number | null;
    absent: boolean;
    passed: boolean;
  }[];
  obtained: number;
  max: number;
  percentage: number;
  grade: string | null;
  passed: boolean;
  /** Not entered (an optional subject the student did not take is left out instead). */
  missing: boolean;
}

export interface StudentResult {
  enrolmentId: string;
  studentId: string;
  rollNumber: string | null;
  fullName: string;
  subjects: SubjectResult[];
  obtained: number;
  max: number;
  percentage: number;
  grade: string | null;
  result: ResultStatus;
  division: string | null;
  /** Among passed students of the section, by percentage (ties share a rank). */
  rank: number | null;
}

export const sectionResultsQuerySchema = z.object({
  examinationId: uuidSchema,
  sectionId: uuidSchema,
});

export interface SubjectPerformance {
  classSubjectId: string;
  subjectName: string;
  appeared: number;
  passed: number;
  passPercent: number | null;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  gradeDistribution: Record<string, number>;
}

export interface SectionResults {
  exam: { id: string; name: string; examType: ExamType; status: ExamStatus; final: boolean };
  section: { id: string; className: string; sectionName: string; academicYear: string };
  gradingScale: { id: string; name: string } | null;
  students: StudentResult[];
  subjects: SubjectPerformance[];
  overall: {
    students: number;
    passed: number;
    failed: number;
    incomplete: number;
    passPercent: number | null;
    average: number | null;
  };
}

export interface ReportCard {
  school: { name: string; address: string; phone: string; email: string };
  exam: { id: string; name: string; examType: ExamType; status: ExamStatus; final: boolean };
  student: {
    name: string;
    admissionNumber: string;
    dateOfBirth: string;
    guardianName: string | null;
  };
  enrolment: {
    className: string;
    sectionName: string;
    rollNumber: string | null;
    academicYear: string;
  };
  classTeacher: string | null;
  result: StudentResult;
  sectionSize: number;
  attendance: { present: number; marked: number; percentage: number | null } | null;
}
