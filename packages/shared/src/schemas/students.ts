import { z } from 'zod';
import { emailSchema, paginationQuerySchema, phoneSchema, uuidSchema } from './common.js';
import type { DocumentItem } from './staff.js';

export const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const STUDENT_STATUSES = ['ACTIVE', 'INACTIVE', 'WITHDRAWN'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  WITHDRAWN: 'Withdrawn',
};

/** COMPLETED (finished the final class) is an addition to the PDF's list — see ADR 0004. */
export const ENROLMENT_STATUSES = [
  'ACTIVE',
  'PROMOTED',
  'RETAINED',
  'TRANSFERRED',
  'WITHDRAWN',
  'COMPLETED',
] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];
export const ENROLMENT_STATUS_LABELS: Record<EnrolmentStatus, string> = {
  ACTIVE: 'Studying',
  PROMOTED: 'Promoted',
  RETAINED: 'Retained',
  TRANSFERRED: 'Transferred out',
  WITHDRAWN: 'Withdrawn',
  COMPLETED: 'Completed final class',
};

export const GUARDIAN_RELATIONSHIPS = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];
export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
  OTHER: 'Other',
};

const blankToUndefined = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .optional()
    .transform((v) => (v === '' ? undefined : v));
const blankToNull = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), z.null(), schema])
    .optional()
    .transform((v) => (v === '' ? null : v));

const admissionNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9/_-]{0,39}$/, 'Use letters, digits, /, - or _');
const pastDate = z.iso
  .date('Enter a valid date')
  .refine((d) => d <= new Date().toISOString().slice(0, 10), {
    message: 'Date cannot be in the future',
  });
const rollNumber = z.string().trim().max(20);

// --- Guardians ----------------------------------------------------------------------------

export const guardianSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the guardian name').max(160),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS),
  phone: phoneSchema,
  email: blankToUndefined(emailSchema),
  occupation: blankToUndefined(z.string().trim().max(100)),
  isPrimary: z.boolean().default(false),
  addressSameAsStudent: z.boolean().default(true),
});
export type GuardianInput = z.input<typeof guardianSchema>;

export const updateGuardianSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  relationship: z.enum(GUARDIAN_RELATIONSHIPS).optional(),
  phone: phoneSchema.optional(),
  email: blankToNull(emailSchema),
  occupation: blankToNull(z.string().trim().max(100)),
  isPrimary: z.boolean().optional(),
  addressSameAsStudent: z.boolean().optional(),
});
export type UpdateGuardianInput = z.input<typeof updateGuardianSchema>;

// --- Students -----------------------------------------------------------------------------

const studentFields = {
  /** Leave empty to generate one automatically (ADM-2026-00001). */
  admissionNumber: blankToUndefined(admissionNumber),
  firstName: z.string().trim().min(1, 'Enter the first name').max(80),
  middleName: blankToUndefined(z.string().trim().max(80)),
  lastName: blankToUndefined(z.string().trim().max(80)),
  dateOfBirth: pastDate,
  gender: blankToUndefined(z.enum(GENDERS)),
  bloodGroup: blankToUndefined(z.enum(BLOOD_GROUPS)),
  addressLine1: blankToUndefined(z.string().trim().max(200)),
  addressLine2: blankToUndefined(z.string().trim().max(200)),
  city: blankToUndefined(z.string().trim().max(100)),
  state: blankToUndefined(z.string().trim().max(100)),
  postalCode: blankToUndefined(
    z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  ),
};

export const enrolmentInputSchema = z.object({
  academicYearId: uuidSchema,
  sectionId: uuidSchema.or(z.literal('')).pipe(z.uuid('Select a section')),
  rollNumber: blankToUndefined(rollNumber),
  enrolmentDate: z.iso.date('Enter the enrolment date'),
});
export type EnrolmentInput = z.input<typeof enrolmentInputSchema>;

const exactlyOnePrimary = (guardians: { isPrimary?: boolean }[]) =>
  guardians.filter((g) => g.isPrimary).length === 1;

export const createStudentSchema = z.object({
  ...studentFields,
  guardians: z
    .array(guardianSchema)
    .min(1, 'Add at least one parent or guardian')
    .max(4)
    .refine(exactlyOnePrimary, 'Mark exactly one guardian as the primary contact'),
  /** Optional: enrol straight away. */
  enrolment: enrolmentInputSchema.optional(),
});
export type CreateStudentInput = z.input<typeof createStudentSchema>;
export type CreateStudentData = z.output<typeof createStudentSchema>;

export const updateStudentSchema = z.object({
  admissionNumber: admissionNumber.optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  middleName: blankToNull(z.string().trim().max(80)),
  lastName: blankToNull(z.string().trim().max(80)),
  dateOfBirth: pastDate.optional(),
  gender: blankToNull(z.enum(GENDERS)),
  bloodGroup: blankToNull(z.enum(BLOOD_GROUPS)),
  addressLine1: blankToNull(z.string().trim().max(200)),
  addressLine2: blankToNull(z.string().trim().max(200)),
  city: blankToNull(z.string().trim().max(100)),
  state: blankToNull(z.string().trim().max(100)),
  postalCode: blankToNull(
    z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  ),
});
export type UpdateStudentInput = z.input<typeof updateStudentSchema>;
export type UpdateStudentData = z.output<typeof updateStudentSchema>;

export const listStudentsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  /** Defaults to the active year. */
  academicYearId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  sectionId: uuidSchema.optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
  /** Only students without an enrolment in the selected year. */
  notEnrolled: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  /** Calendar year / month (1–12) of admission (the student's first enrolment). */
  admissionYear: z.coerce.number().int().min(1990).max(2100).optional(),
  admissionMonth: z.coerce.number().int().min(1).max(12).optional(),
  /** YES = owes fees due up to today; NO = nothing due. Needs fees.read. */
  pendingFees: z.enum(['YES', 'NO']).optional(),
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

export interface EnrolmentSummary {
  id: string;
  academicYear: { id: string; name: string };
  classId: string;
  className: string;
  sectionId: string;
  sectionName: string;
  rollNumber: string | null;
  status: EnrolmentStatus;
}

export interface StudentListItem {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  fullName: string;
  dateOfBirth: string;
  gender: Gender | null;
  status: StudentStatus;
  primaryGuardian: { fullName: string; relationship: string; phone: string } | null;
  /** Enrolment in the selected (or active) year. */
  enrolment: EnrolmentSummary | null;
  /** Date of the student's first enrolment (YYYY-MM-DD). */
  admissionDate: string | null;
  /**
   * Unpaid balance of dues with a due date up to today (or no due date), across all years.
   * Null when the user can't see fees.
   */
  pendingFees: number | null;
}

export interface GuardianItem {
  id: string;
  fullName: string;
  relationship: GuardianRelationship;
  phone: string;
  email: string | null;
  occupation: string | null;
  isPrimary: boolean;
  addressSameAsStudent: boolean;
}

export interface EnrolmentHistoryItem extends EnrolmentSummary {
  enrolmentDate: string;
  previousEnrolmentId: string | null;
  exitDate: string | null;
  exitReason: string | null;
  createdAt: string;
}

export interface StudentDetail extends Omit<StudentListItem, 'enrolment' | 'pendingFees'> {
  bloodGroup: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  hasPhoto: boolean;
  createdAt: string;
  guardians: GuardianItem[];
  /** Newest first. */
  enrolments: EnrolmentHistoryItem[];
  documents: DocumentItem[];
  /** The admission enquiry this student was converted from, if any. */
  enquiry: { id: string; referenceNumber: string } | null;
}

// --- Enrolment changes & lifecycle --------------------------------------------------------

export const createEnrolmentSchema = enrolmentInputSchema;

/** Section change or roll number within the same year. */
export const updateEnrolmentSchema = z.object({
  sectionId: uuidSchema.optional(),
  rollNumber: blankToNull(rollNumber),
});
export type UpdateEnrolmentInput = z.input<typeof updateEnrolmentSchema>;

/** Transfer out (TC) or withdrawal. */
export const enrolmentExitSchema = z.object({
  exitDate: z.iso.date('Enter the date'),
  reason: z.string().trim().min(3, 'Enter a reason').max(500),
});
export type EnrolmentExitInput = z.infer<typeof enrolmentExitSchema>;

export const PROMOTION_ACTIONS = ['PROMOTE', 'RETAIN', 'COMPLETE'] as const;
export type PromotionAction = (typeof PROMOTION_ACTIONS)[number];

export const promotionSchema = z.object({
  toAcademicYearId: uuidSchema,
  entries: z
    .array(
      z
        .object({
          enrolmentId: uuidSchema,
          action: z.enum(PROMOTION_ACTIONS),
          toSectionId: uuidSchema.optional(),
        })
        .refine((e) => e.action === 'COMPLETE' || !!e.toSectionId, {
          path: ['toSectionId'],
          message: 'Choose the new section',
        }),
    )
    .min(1, 'Select at least one student')
    .max(500),
});
export type PromotionInput = z.infer<typeof promotionSchema>;

export interface PromotionResult {
  promoted: number;
  retained: number;
  completed: number;
}

export const assignRollNumbersSchema = z.object({
  order: z.enum(['NAME', 'ADMISSION_NUMBER']).default('NAME'),
});

// --- Enquiry → student conversion ---------------------------------------------------------

export const convertEnquirySchema = z.object({
  ...studentFields,
  guardian: guardianSchema.omit({ isPrimary: true }),
  enrolment: enrolmentInputSchema,
});
export type ConvertEnquiryInput = z.input<typeof convertEnquirySchema>;
export type ConvertEnquiryData = z.output<typeof convertEnquirySchema>;
