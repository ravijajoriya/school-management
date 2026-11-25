import { z } from 'zod';
import { emailSchema, paginationQuerySchema, phoneSchema, uuidSchema } from './common.js';

// --- Private documents (shared by staff and students) ------------------------------------

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export const STUDENT_DOCUMENT_TYPES = [
  'BIRTH_CERTIFICATE',
  'AADHAAR',
  'TRANSFER_CERTIFICATE',
  'PREVIOUS_MARKSHEET',
  'PHOTO',
  'MEDICAL',
  'OTHER',
] as const;
export const EMPLOYEE_DOCUMENT_TYPES = [
  'RESUME',
  'ID_PROOF',
  'QUALIFICATION',
  'EXPERIENCE',
  'APPOINTMENT_LETTER',
  'PHOTO',
  'OTHER',
] as const;

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  BIRTH_CERTIFICATE: 'Birth certificate',
  AADHAAR: 'Aadhaar card',
  TRANSFER_CERTIFICATE: 'Transfer certificate',
  PREVIOUS_MARKSHEET: 'Previous marksheet',
  PHOTO: 'Photograph',
  MEDICAL: 'Medical record',
  RESUME: 'Resume / CV',
  ID_PROOF: 'ID proof',
  QUALIFICATION: 'Qualification certificate',
  EXPERIENCE: 'Experience letter',
  APPOINTMENT_LETTER: 'Appointment letter',
  OTHER: 'Other',
};

export interface DocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: { id: string; fullName: string };
  createdAt: string;
}

// --- Employees ----------------------------------------------------------------------------

export const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE', 'LEFT'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  LEFT: 'Left the school',
};

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
  VISITING: 'Visiting',
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

/** Indian driving licence number, e.g. RJ14 20190012345. */
const licenceNumber = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9][A-Z0-9 /-]{5,39}$/,
        'Enter the licence number as printed (letters and digits)',
      ),
  );

const employeeCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9/_-]{0,39}$/, 'Use letters, digits, /, - or _');

export const createEmployeeSchema = z.object({
  /** Leave empty to generate one automatically (EMP-0001). */
  employeeCode: blankToUndefined(employeeCode),
  firstName: z.string().trim().min(1, 'Enter the first name').max(80),
  lastName: blankToUndefined(z.string().trim().max(80)),
  email: blankToUndefined(emailSchema),
  phone: blankToUndefined(phoneSchema),
  dateOfBirth: blankToUndefined(z.iso.date('Enter a valid date')),
  joiningDate: z.iso.date('Enter the joining date'),
  designation: z.string().trim().min(2, 'Enter the designation').max(100),
  department: blankToUndefined(z.string().trim().max(100)),
  employmentType: blankToUndefined(z.enum(EMPLOYMENT_TYPES)),
  status: z.enum(EMPLOYEE_STATUSES).default('ACTIVE'),
  /** Drivers: needed before they can be put on a vehicle. */
  licenceNumber: blankToUndefined(licenceNumber),
  licenceExpiry: blankToUndefined(z.iso.date('Enter a valid date')),
});
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type CreateEmployeeData = z.output<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  employeeCode: employeeCode.optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: blankToNull(z.string().trim().max(80)),
  email: blankToNull(emailSchema),
  phone: blankToNull(phoneSchema),
  dateOfBirth: blankToNull(z.iso.date()),
  joiningDate: z.iso.date().optional(),
  designation: z.string().trim().min(2).max(100).optional(),
  department: blankToNull(z.string().trim().max(100)),
  employmentType: blankToNull(z.enum(EMPLOYMENT_TYPES)),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  licenceNumber: blankToNull(licenceNumber),
  licenceExpiry: blankToNull(z.iso.date('Enter a valid date')),
});
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;
export type UpdateEmployeeData = z.output<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  department: z.string().trim().max(100).optional(),
  /** Only staff on approved leave today. */
  onLeave: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

/** Link an existing login to this employee (null = unlink). */
export const linkEmployeeUserSchema = z.object({ userId: uuidSchema.nullable() });

/** Create a login for this employee using their email/phone. */
export const createEmployeeLoginSchema = z.object({
  roleIds: z.array(uuidSchema).min(1, 'Select at least one role'),
});

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  designation: string;
  department: string | null;
  email: string | null;
  phone: string | null;
  employmentType: EmploymentType | null;
  status: EmployeeStatus;
  user: { id: string; email: string | null; phone: string | null; status: string } | null;
  licenceNumber: string | null;
  licenceExpiry: string | null;
  /** Approved leave covering today (listed first in the staff list). */
  onLeave: { leaveType: string; startDate: string; endDate: string } | null;
}

export interface EmployeeDetail extends EmployeeListItem {
  dateOfBirth: string | null;
  joiningDate: string;
  documents: DocumentItem[];
  /** Teaching assignments and class-teacher roles in the active academic year. */
  assignments: { sectionLabel: string; subject: string }[];
  classTeacherOf: string[];
}

export interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string;
}
