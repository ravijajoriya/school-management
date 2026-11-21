import { z } from 'zod';
import { uuidSchema } from './common.js';

// --- Academic years ----------------------------------------------------------------------

export const ACADEMIC_YEAR_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'] as const;
export type AcademicYearStatus = (typeof ACADEMIC_YEAR_STATUSES)[number];

const isoDate = z.iso.date('Enter a valid date');

const yearFields = z.object({
  /** e.g. 2026-2027 */
  name: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, 'Use the format 2026-2027')
    .refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, {
      message: 'The second year must follow the first (e.g. 2026-2027)',
    }),
  startDate: isoDate,
  endDate: isoDate,
});

export const createAcademicYearSchema = yearFields.refine((v) => v.endDate > v.startDate, {
  path: ['endDate'],
  message: 'End date must be after the start date',
});
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

export const updateAcademicYearSchema = yearFields
  .partial()
  .refine((v) => !v.startDate || !v.endDate || v.endDate > v.startDate, {
    path: ['endDate'],
    message: 'End date must be after the start date',
  });
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;

export const copyStructureSchema = z.object({ fromAcademicYearId: uuidSchema });

export interface AcademicYearItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AcademicYearStatus;
  isActive: boolean;
  sectionCount: number;
  enrolmentCount: number;
}

// --- Subjects & class-subject mapping -----------------------------------------------------

export const SUBJECT_TYPES = ['CORE', 'OPTIONAL', 'PRACTICAL'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];
export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  CORE: 'Core',
  OPTIONAL: 'Optional',
  PRACTICAL: 'Practical',
};

const subjectCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,29}$/, 'Use letters, digits, - or _ (max 30)');

export const createSubjectSchema = z.object({
  code: z
    .union([z.literal(''), subjectCode])
    .optional()
    .transform((v) => v || undefined),
  name: z.string().trim().min(2, 'Enter the subject name').max(100),
  description: z.string().trim().max(500).optional(),
});
export type CreateSubjectInput = z.input<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  code: z
    .union([z.literal(''), z.null(), subjectCode])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSubjectInput = z.input<typeof updateSubjectSchema>;

export interface SubjectItem {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
}

/** Replaces the full subject list of one class in one academic year. */
export const setClassSubjectsSchema = z.object({
  academicYearId: uuidSchema,
  classId: uuidSchema,
  subjects: z
    .array(z.object({ subjectId: uuidSchema, subjectType: z.enum(SUBJECT_TYPES).default('CORE') }))
    .max(40),
});
export type SetClassSubjectsInput = z.input<typeof setClassSubjectsSchema>;

export interface ClassSubjectItem {
  id: string;
  academicYearId: string;
  classId: string;
  subject: { id: string; code: string | null; name: string };
  subjectType: SubjectType;
  isActive: boolean;
}

// --- Sections ------------------------------------------------------------------------------

const sectionName = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a section name')
  .max(20)
  .regex(/^[A-Z0-9 -]+$/, 'Use letters, digits, spaces or -');

export const createSectionSchema = z.object({
  academicYearId: uuidSchema,
  classId: uuidSchema,
  name: sectionName,
  roomLabel: z.string().trim().max(50).optional(),
  capacity: z.coerce.number().int().min(1).max(200).optional(),
  classTeacherId: uuidSchema.nullable().optional(),
});
export type CreateSectionInput = z.input<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  name: sectionName.optional(),
  roomLabel: z.string().trim().max(50).nullable().optional(),
  capacity: z.coerce.number().int().min(1).max(200).nullable().optional(),
  classTeacherId: uuidSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSectionInput = z.input<typeof updateSectionSchema>;

export interface SectionItem {
  id: string;
  academicYearId: string;
  classId: string;
  className: string;
  name: string;
  roomLabel: string | null;
  capacity: number | null;
  classTeacher: { id: string; fullName: string } | null;
  isActive: boolean;
  /** Students with an ACTIVE enrolment in this section. */
  studentCount: number;
}

/** One class in one academic year with its sections and subjects (structure screen). */
export interface ClassStructure {
  class: { id: string; name: string; levelOrder: number };
  sections: SectionItem[];
  subjects: ClassSubjectItem[];
}

export const structureQuerySchema = z.object({ academicYearId: uuidSchema });

// --- Teacher assignments -------------------------------------------------------------------

export const createTeacherAssignmentSchema = z.object({
  academicYearId: uuidSchema,
  employeeId: uuidSchema,
  sectionId: uuidSchema,
  classSubjectId: uuidSchema,
});
export type CreateTeacherAssignmentInput = z.infer<typeof createTeacherAssignmentSchema>;

export const listTeacherAssignmentsQuerySchema = z.object({
  academicYearId: uuidSchema,
  employeeId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
});
export type ListTeacherAssignmentsQuery = z.infer<typeof listTeacherAssignmentsQuerySchema>;

export interface TeacherAssignmentItem {
  id: string;
  academicYearId: string;
  employee: { id: string; fullName: string; employeeCode: string };
  section: { id: string; name: string; classId: string; className: string };
  classSubjectId: string;
  subject: { id: string; name: string };
  createdAt: string;
}

// --- Teacher portal ------------------------------------------------------------------------

export interface TeacherSectionItem {
  sectionId: string;
  className: string;
  sectionName: string;
  academicYear: { id: string; name: string };
  isClassTeacher: boolean;
  subjects: string[];
  studentCount: number;
}

export interface RosterItem {
  enrolmentId: string;
  studentId: string;
  rollNumber: string | null;
  fullName: string;
  gender: string | null;
  dateOfBirth: string;
  guardian: { fullName: string; relationship: string; phone: string } | null;
}
