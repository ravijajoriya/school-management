import { z } from 'zod';
import { optionalText, paginationQuerySchema, uuidSchema } from './common.js';

/** Default leave types (ADR 0005) — to be confirmed by the school. */
export const LEAVE_TYPES = [
  'CASUAL',
  'SICK',
  'EARNED',
  'MATERNITY',
  'ON_DUTY',
  'UNPAID',
  'OTHER',
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  CASUAL: 'Casual leave',
  SICK: 'Sick / medical leave',
  EARNED: 'Earned leave',
  MATERNITY: 'Maternity leave',
  ON_DUTY: 'On duty',
  UNPAID: 'Leave without pay',
  OTHER: 'Other',
};

export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** Longest single request, in calendar days. */
export const LEAVE_MAX_DAYS = 180;

/** Calendar days from start to end, both included. */
export function leaveDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
}

const isoDate = z.iso.date('Enter a valid date');

export const createLeaveRequestSchema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES, 'Choose a leave type'),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(1000),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  })
  .refine((v) => v.endDate < v.startDate || leaveDays(v.startDate, v.endDate) <= LEAVE_MAX_DAYS, {
    path: ['endDate'],
    message: `A single request can cover at most ${LEAVE_MAX_DAYS} days`,
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const approveLeaveSchema = z.object({ remarks: optionalText(1000) });
export const rejectLeaveSchema = z.object({
  remarks: z.string().trim().min(3, 'Give a reason for rejecting').max(1000),
});
export type ReviewLeaveInput = { remarks?: string };

export const listLeaveRequestsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(LEAVE_STATUSES).optional(),
  employeeId: uuidSchema.optional(),
  /** Staff name, employee code or reason (every word must match). */
  search: z.string().trim().max(100).optional(),
  leaveType: z.enum(LEAVE_TYPES).optional(),
  department: z.string().trim().max(100).optional(),
  /** Requests overlapping [from, to]. */
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>;

export interface LeaveRequestItem {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string; designation: string };
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewedBy: { id: string; fullName: string } | null;
  reviewedAt: string | null;
  reviewRemarks: string | null;
  createdAt: string;
  /** The applicant may still cancel it (pending, or approved and not yet started). */
  canCancel: boolean;
}

export interface LeaveSummary {
  pending: number;
  /** Requests per status (all time). */
  byStatus: Record<LeaveStatus, number>;
  /** Requests (not cancelled) with days in the current month. */
  thisMonth: number;
  /** Departments on staff records, for the filter. */
  departments: string[];
  /** Staff on approved leave today. */
  onLeaveToday: { employeeId: string; fullName: string; leaveType: LeaveType; endDate: string }[];
}
