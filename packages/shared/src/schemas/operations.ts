import { z } from 'zod';
import { optionalText, paginationQuerySchema, phoneSchema, uuidSchema } from './common.js';
import { moneySchema } from './fees.js';

const isoDate = z.iso.date('Enter a valid date');
const optionalDate = isoDate
  .or(z.literal(''))
  .optional()
  .transform((v) => v || undefined);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const optionalTime = time
  .or(z.literal(''))
  .optional()
  .transform((v) => v || undefined);
const optionalUuid = uuidSchema
  .or(z.literal(''))
  .optional()
  .transform((v) => v || undefined);

// =============================================================================================
// Transport
// =============================================================================================

export const VEHICLE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const saveVehicleSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/\s+/g, ' '))
    .pipe(z.string().min(4, 'Enter the registration number').max(30)),
  vehicleType: optionalText(50),
  capacity: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  insuranceExpiry: optionalDate,
  permitExpiry: optionalDate,
  status: z.enum(VEHICLE_STATUSES).default('ACTIVE'),
  notes: optionalText(1000),
});
export type SaveVehicleInput = z.input<typeof saveVehicleSchema>;
export type SaveVehicleData = z.output<typeof saveVehicleSchema>;

export interface VehicleItem {
  id: string;
  registrationNumber: string;
  vehicleType: string | null;
  capacity: number | null;
  insuranceExpiry: string | null;
  permitExpiry: string | null;
  status: VehicleStatus;
  notes: string | null;
  /** Insurance or permit expires within 30 days (or has expired). */
  documentsDue: boolean;
}

export const routeStopInputSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2, 'Enter the stop name').max(120),
  pickupTime: optionalTime,
  dropTime: optionalTime,
});

export const saveRouteSchema = z.object({
  name: z.string().trim().min(2, 'Enter a route name').max(100),
  description: optionalText(1000),
  vehicleId: optionalUuid,
  driverEmployeeId: optionalUuid,
  attendantEmployeeId: optionalUuid,
  isActive: z.boolean().default(true),
  stops: z.array(routeStopInputSchema).max(50).default([]),
});
export type SaveRouteInput = z.input<typeof saveRouteSchema>;
export type SaveRouteData = z.output<typeof saveRouteSchema>;

export interface RouteStopItem {
  id: string;
  name: string;
  pickupTime: string | null;
  dropTime: string | null;
  sequenceNo: number;
  students: number;
}

export interface RouteItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  vehicle: { id: string; registrationNumber: string; capacity: number | null } | null;
  driver: { id: string; fullName: string; phone: string | null } | null;
  attendant: { id: string; fullName: string; phone: string | null } | null;
  stops: RouteStopItem[];
  /** Students currently assigned. */
  students: number;
}

export const assignTransportSchema = z.object({
  enrolmentId: uuidSchema,
  routeId: uuidSchema,
  routeStopId: optionalUuid,
  startDate: isoDate,
});
export type AssignTransportInput = z.input<typeof assignTransportSchema>;

export const endTransportSchema = z.object({ endDate: isoDate });

export interface TransportAssignmentItem {
  id: string;
  route: { id: string; name: string };
  stop: { id: string; name: string; pickupTime: string | null; dropTime: string | null } | null;
  startDate: string;
  endDate: string | null;
  status: 'ACTIVE' | 'ENDED';
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    className: string;
    sectionName: string;
    guardianPhone: string | null;
  };
}

// =============================================================================================
// Complaints
// =============================================================================================

export const COMPLAINT_CATEGORIES = [
  'ACADEMIC',
  'TRANSPORT',
  'FEES',
  'FACILITIES',
  'STAFF',
  'SAFETY',
  'OTHER',
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  ACADEMIC: 'Academics',
  TRANSPORT: 'Transport',
  FEES: 'Fees',
  FACILITIES: 'Facilities / maintenance',
  STAFF: 'Staff conduct',
  SAFETY: 'Safety',
  OTHER: 'Other',
};

export const COMPLAINT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const createComplaintSchema = z.object({
  category: z.enum(COMPLAINT_CATEGORIES),
  subject: z.string().trim().min(3, 'Enter a subject').max(180),
  description: z.string().trim().min(5, 'Describe the complaint').max(5000),
  submittedByName: optionalText(160),
  contactPhone: phoneSchema
    .or(z.literal(''))
    .optional()
    .transform((v) => v || undefined),
  assignedTo: optionalUuid,
});
export type CreateComplaintInput = z.input<typeof createComplaintSchema>;

export const updateComplaintSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  assignedTo: uuidSchema.nullable().optional(),
  resolutionNotes: z.string().trim().max(5000).nullable().optional(),
  category: z.enum(COMPLAINT_CATEGORIES).optional(),
});
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;

export const listComplaintsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  category: z.enum(COMPLAINT_CATEGORIES).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuerySchema>;

export interface ComplaintItem {
  id: string;
  referenceNumber: string;
  category: ComplaintCategory;
  subject: string;
  description: string;
  submittedByName: string | null;
  contactPhone: string | null;
  status: ComplaintStatus;
  assignedTo: { id: string; fullName: string } | null;
  resolutionNotes: string | null;
  createdBy: string;
  createdAt: string;
  history: { action: string; at: string; user: string | null; detail: string | null }[];
}

// =============================================================================================
// Parent–teacher meetings
// =============================================================================================

export const MEETING_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const createMeetingSchema = z.object({
  enrolmentId: uuidSchema,
  /** Office only; a teacher always schedules for themselves. */
  teacherEmployeeId: optionalUuid,
  meetingAt: z.iso.datetime({ offset: true, message: 'Enter the date and time' }),
  venue: optionalText(160),
  purpose: optionalText(2000),
});
export type CreateMeetingInput = z.input<typeof createMeetingSchema>;

export const updateMeetingSchema = z.object({
  status: z.enum(MEETING_STATUSES).optional(),
  meetingAt: z.iso.datetime({ offset: true }).optional(),
  venue: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export const listMeetingsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(MEETING_STATUSES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ListMeetingsQuery = z.infer<typeof listMeetingsQuerySchema>;

export interface MeetingItem {
  id: string;
  meetingAt: string;
  venue: string | null;
  purpose: string | null;
  status: MeetingStatus;
  notes: string | null;
  student: {
    id: string;
    fullName: string;
    admissionNumber: string;
    className: string;
    sectionName: string;
  };
  guardian: { fullName: string; phone: string } | null;
  teacher: { id: string; fullName: string };
  createdBy: string;
}

// =============================================================================================
// Inventory (asset register; no stock movements in this phase)
// =============================================================================================

export const ITEM_CONDITIONS = ['GOOD', 'NEEDS_REPAIR', 'DAMAGED', 'DISPOSED'] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];
export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  GOOD: 'Good',
  NEEDS_REPAIR: 'Needs repair',
  DAMAGED: 'Damaged',
  DISPOSED: 'Disposed',
};

export const saveInventoryCategorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(100),
  description: optionalText(1000),
});

export const saveInventoryItemSchema = z.object({
  categoryId: uuidSchema,
  /** Leave empty to generate one automatically. */
  assetCode: optionalText(50).transform((v) => v?.toUpperCase()),
  name: z.string().trim().min(2, 'Enter a name').max(160),
  quantity: z.coerce.number().min(0).max(99_999_999),
  unit: optionalText(30),
  location: optionalText(120),
  conditionStatus: z.enum(ITEM_CONDITIONS).default('GOOD'),
  purchaseDate: optionalDate,
  purchaseCost: moneySchema.optional().or(z.literal('').transform(() => undefined)),
  notes: optionalText(2000),
});
export type SaveInventoryItemInput = z.input<typeof saveInventoryItemSchema>;
export type SaveInventoryItemData = z.output<typeof saveInventoryItemSchema>;

export const listInventoryQuerySchema = paginationQuerySchema.extend({
  categoryId: uuidSchema.optional(),
  conditionStatus: z.enum(ITEM_CONDITIONS).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;

export interface InventoryCategoryItem {
  id: string;
  name: string;
  description: string | null;
  items: number;
}

export interface InventoryItemRow {
  id: string;
  category: { id: string; name: string };
  assetCode: string;
  name: string;
  quantity: number;
  unit: string | null;
  location: string | null;
  conditionStatus: ItemCondition;
  purchaseDate: string | null;
  purchaseCost: number | null;
  notes: string | null;
}
