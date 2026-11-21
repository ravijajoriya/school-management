import { z } from 'zod';
import { optionalText, uuidSchema } from './common.js';

/**
 * Certificate templates are plain text with {{placeholders}} (never HTML), so a template can
 * never inject markup into the printed page. Blank lines separate paragraphs.
 */
export const CERTIFICATE_PLACEHOLDERS: Record<string, string> = {
  student_name: 'Student full name',
  admission_number: 'Admission number',
  date_of_birth: 'Date of birth (e.g. 14 May 2016)',
  gender_pronoun: 'he / she / they',
  gender_possessive: 'his / her / their',
  child_relation: 'son / daughter / child',
  father_name: 'Father’s name (else primary guardian)',
  mother_name: 'Mother’s name',
  guardian_name: 'Primary guardian name',
  class_name: 'Class',
  section_name: 'Section',
  academic_year: 'Academic year',
  admission_date: 'Date of first enrolment',
  leaving_date: 'Date of leaving',
  leaving_reason: 'Reason for leaving',
  last_class: 'Last class attended',
  conduct: 'Conduct (entered when issuing)',
  purpose: 'Purpose (entered when issuing)',
  school_name: 'School name',
  school_address: 'School address',
  issue_date: 'Date of issue',
  certificate_number: 'Certificate number',
};

export type CertificateCode = 'TC' | 'BONAFIDE' | 'CHARACTER' | string;

/** Starter templates (editable under Certificates → Templates). */
export const DEFAULT_CERTIFICATE_TEMPLATES: { code: string; name: string; templateHtml: string }[] =
  [
    {
      code: 'TC',
      name: 'Transfer Certificate',
      templateHtml: `This is to certify that {{student_name}}, {{gender_possessive}} father's name {{father_name}}, admission number {{admission_number}}, date of birth {{date_of_birth}}, was a bona fide student of this school from {{admission_date}} to {{leaving_date}}.

{{gender_pronoun}} was studying in {{last_class}} during the academic year {{academic_year}}. Reason for leaving: {{leaving_reason}}.

All dues to the school have been cleared. {{gender_possessive}} conduct and character were {{conduct}}.

We wish {{student_name}} success in future.`,
    },
    {
      code: 'BONAFIDE',
      name: 'Bonafide Certificate',
      templateHtml: `This is to certify that {{student_name}}, {{child_relation}} of {{father_name}}, admission number {{admission_number}}, is a bona fide student of this school, studying in {{class_name}} – {{section_name}} in the academic year {{academic_year}}.

{{gender_possessive}} date of birth as per school records is {{date_of_birth}}.

This certificate is issued on request for the purpose of {{purpose}}.`,
    },
    {
      code: 'CHARACTER',
      name: 'Character Certificate',
      templateHtml: `This is to certify that {{student_name}}, {{child_relation}} of {{father_name}}, admission number {{admission_number}}, has been a student of this school and last studied in {{last_class}} ({{academic_year}}).

To the best of my knowledge, {{gender_pronoun}} bears a {{conduct}} moral character. {{gender_pronoun}} has not taken part in any activity against the school or society.

I wish {{student_name}} all success in life.`,
    },
  ];

export const saveCertificateTemplateSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,49}$/, 'Use capital letters, digits and _'),
  name: z.string().trim().min(2, 'Enter a name').max(120),
  templateHtml: z.string().trim().min(10, 'Write the certificate text').max(10_000),
  isActive: z.boolean().default(true),
});
export type SaveCertificateTemplateInput = z.input<typeof saveCertificateTemplateSchema>;

export interface CertificateTemplateItem {
  id: string;
  code: string;
  name: string;
  templateHtml: string;
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
  issued: number;
}

export const issueCertificateSchema = z.object({
  templateId: uuidSchema,
  studentId: uuidSchema,
  /** Defaults to the student's latest enrolment. */
  enrolmentId: uuidSchema.optional(),
  conduct: optionalText(60),
  purpose: optionalText(200),
  issuedOn: z.iso.date().optional(),
});
export type IssueCertificateInput = z.input<typeof issueCertificateSchema>;

export interface CertificateSnapshot {
  school: { name: string; address: string; phone: string; email: string };
  title: string;
  certificateNumber: string;
  issuedOn: string;
  issuedBy: string;
  /** Final text with every placeholder filled in. */
  paragraphs: string[];
  student: { name: string; admissionNumber: string };
}

export interface CertificateIssueItem {
  id: string;
  certificateNumber: string;
  template: { id: string; code: string; name: string };
  student: { id: string; fullName: string; admissionNumber: string };
  issuedOn: string;
  issuedBy: string;
  snapshot: CertificateSnapshot;
}

// --- ID cards ---------------------------------------------------------------------------------

export const ID_CARD_AUDIENCES = ['STUDENT', 'STAFF'] as const;
export type IdCardAudience = (typeof ID_CARD_AUDIENCES)[number];

export const idCardLayoutSchema = z.object({
  /** Header/background colour of the card (hex). */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#1e3a5f'),
  showPhoto: z.boolean().default(true),
  showBloodGroup: z.boolean().default(true),
  showGuardianPhone: z.boolean().default(true),
  showAddress: z.boolean().default(false),
  footerText: z.string().trim().max(120).default('If found, please return to the school office.'),
  validity: z.string().trim().max(60).default(''),
});
export type IdCardLayout = z.output<typeof idCardLayoutSchema>;

export const saveIdCardTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  audience: z.enum(ID_CARD_AUDIENCES),
  layout: idCardLayoutSchema,
  isActive: z.boolean().default(true),
});
export type SaveIdCardTemplateInput = z.input<typeof saveIdCardTemplateSchema>;

export interface IdCardTemplateItem {
  id: string;
  name: string;
  audience: IdCardAudience;
  layout: IdCardLayout;
  isActive: boolean;
}

export const createIdCardBatchSchema = z.object({
  templateId: uuidSchema,
  /** Students: one or more sections of the current year. Staff: leave empty for all active staff. */
  sectionIds: z.array(uuidSchema).max(100).default([]),
});
export type CreateIdCardBatchInput = z.input<typeof createIdCardBatchSchema>;

export interface IdCardPerson {
  id: string;
  name: string;
  /** Admission number or employee code. */
  code: string;
  /** "Class 5 – A" or designation. */
  line1: string;
  line2: string | null;
  bloodGroup: string | null;
  phone: string | null;
  address: string | null;
  /** Private photo path (served to signed-in staff). */
  photoPath: string | null;
}

export interface IdCardBatchItem {
  id: string;
  template: IdCardTemplateItem;
  academicYear: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  cardCount: number;
  label: string;
}

export interface IdCardBatchView extends IdCardBatchItem {
  school: { name: string; address: string; phone: string };
  people: IdCardPerson[];
}
