import { z } from 'zod';
import { emailSchema, paginationQuerySchema, phoneSchema, uuidSchema } from './common.js';

// --- Classes (catalogue; managed fully in Phase 3) -----------------------------------------

export interface ClassItem {
  id: string;
  name: string;
  levelOrder: number;
}

// --- Admission enquiries -----------------------------------------------------------------

export const ENQUIRY_STATUSES = [
  'NEW',
  'CONTACTED',
  'VISIT_SCHEDULED',
  'ADMISSION_CONFIRMED',
  'NOT_INTERESTED',
  'CLOSED',
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  VISIT_SCHEDULED: 'Visit scheduled',
  ADMISSION_CONFIRMED: 'Admission confirmed',
  NOT_INTERESTED: 'Not interested',
  CLOSED: 'Closed',
};

export const ENQUIRY_SOURCES = ['WEBSITE', 'WALK_IN', 'PHONE', 'REFERRAL', 'OTHER'] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const ENQUIRY_SOURCE_LABELS: Record<EnquirySource, string> = {
  WEBSITE: 'Website',
  WALK_IN: 'Walk-in',
  PHONE: 'Phone call',
  REFERRAL: 'Referral',
  OTHER: 'Other',
};

const optionalEmail = z
  .union([z.literal(''), emailSchema])
  .optional()
  .transform((v) => (v ? v : undefined));

const enquiryFields = {
  guardianName: z.string().trim().min(2, "Enter the parent's name").max(160),
  phone: phoneSchema,
  email: optionalEmail,
  studentName: z.string().trim().min(2, "Enter the child's name").max(160),
  classSoughtId: uuidSchema.or(z.literal('')).pipe(z.uuid('Select a class')),
  dateOfBirth: z
    .union([z.literal(''), z.iso.date('Enter a valid date')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  message: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
};

/** Public website form. `website` is a honeypot: humans never see it, bots fill it in. */
export const publicEnquirySchema = z.object({
  ...enquiryFields,
  website: z.string().max(200).optional(),
});
export type PublicEnquiryInput = z.input<typeof publicEnquirySchema>;

export interface PublicEnquiryResponse {
  referenceNumber: string;
}

/** Staff-entered enquiry (walk-in, phone call…). */
export const createEnquirySchema = z.object({
  ...enquiryFields,
  source: z.enum(ENQUIRY_SOURCES).default('WALK_IN'),
});
export type CreateEnquiryInput = z.input<typeof createEnquirySchema>;

export const updateEnquirySchema = z.object({
  status: z.enum(ENQUIRY_STATUSES).optional(),
  /** null = unassign */
  assignedToId: uuidSchema.nullable().optional(),
});
export type UpdateEnquiryInput = z.infer<typeof updateEnquirySchema>;

export const createFollowUpSchema = z.object({
  notes: z.string().trim().min(1, 'Write what happened').max(2000),
  outcome: z.string().trim().max(60).optional(),
  nextFollowUpAt: z.union([z.iso.datetime({ offset: true }), z.null()]).optional(),
  /** Optionally move the enquiry to a new status in the same step. */
  status: z.enum(ENQUIRY_STATUSES).optional(),
});
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const listEnquiriesQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(ENQUIRY_STATUSES).optional(),
  classSoughtId: uuidSchema.optional(),
  /** 'me', 'unassigned' or a user id */
  assignedTo: z.union([z.literal('me'), z.literal('unassigned'), uuidSchema]).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ListEnquiriesQuery = z.infer<typeof listEnquiriesQuerySchema>;

export interface EnquiryListItem {
  id: string;
  referenceNumber: string;
  studentName: string;
  guardianName: string;
  phone: string;
  email: string | null;
  classSought: { id: string; name: string };
  status: EnquiryStatus;
  source: EnquirySource;
  assignedTo: { id: string; fullName: string } | null;
  submittedAt: string;
  /** From the most recent follow-up, if one is scheduled. */
  nextFollowUpAt: string | null;
}

export interface EnquiryFollowUpItem {
  id: string;
  followUpAt: string;
  outcome: string | null;
  notes: string | null;
  nextFollowUpAt: string | null;
  user: { id: string; fullName: string };
}

export interface EnquiryHistoryItem {
  action: string;
  at: string;
  user: { id: string; fullName: string } | null;
  before: unknown;
  after: unknown;
}

export interface EnquiryDetail extends EnquiryListItem {
  dateOfBirth: string | null;
  message: string | null;
  /** Set once the enquiry has been converted into a student record. */
  convertedStudent: { id: string; admissionNumber: string; fullName: string } | null;
  followUps: EnquiryFollowUpItem[];
  history: EnquiryHistoryItem[];
}

export interface EnquiryAssignee {
  id: string;
  fullName: string;
}

export interface EnquirySummary {
  byStatus: Record<EnquiryStatus, number>;
  dueFollowUps: number;
}
