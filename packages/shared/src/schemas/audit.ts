import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common.js';

/** Audit action codes written by the API. Keep in sync when adding new audited operations. */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: 'auth.login_succeeded',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  REFRESH_TOKEN_REUSED: 'auth.refresh_token_reused',
  PASSWORD_CHANGED: 'auth.password_changed',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ROLES_CHANGED: 'user.roles_changed',
  USER_PASSWORD_RESET: 'user.password_reset',
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',
  ROLE_PERMISSIONS_CHANGED: 'role.permissions_changed',
  PAGE_SAVED: 'website_page.saved',
  PAGE_PUBLISHED: 'website_page.published',
  ANNOUNCEMENT_CREATED: 'announcement.created',
  ANNOUNCEMENT_UPDATED: 'announcement.updated',
  ANNOUNCEMENT_DELETED: 'announcement.deleted',
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_DELETED: 'event.deleted',
  MEDIA_UPLOADED: 'media.uploaded',
  MEDIA_UPDATED: 'media.updated',
  MEDIA_DELETED: 'media.deleted',
  NOTICE_CREATED: 'notice.created',
  NOTICE_UPDATED: 'notice.updated',
  NOTICE_DELETED: 'notice.deleted',
  ENQUIRY_SUBMITTED: 'enquiry.submitted',
  ENQUIRY_CREATED: 'enquiry.created',
  ENQUIRY_UPDATED: 'enquiry.updated',
  ENQUIRY_FOLLOW_UP_ADDED: 'enquiry.follow_up_added',
  CONTACT_MESSAGE_UPDATED: 'contact_message.updated',
  ENQUIRY_CONVERTED: 'enquiry.converted',
  ACADEMIC_YEAR_CREATED: 'academic_year.created',
  ACADEMIC_YEAR_UPDATED: 'academic_year.updated',
  ACADEMIC_YEAR_ACTIVATED: 'academic_year.activated',
  ACADEMIC_STRUCTURE_COPIED: 'academic_year.structure_copied',
  SUBJECT_CREATED: 'subject.created',
  SUBJECT_UPDATED: 'subject.updated',
  CLASS_SUBJECTS_CHANGED: 'class_subjects.changed',
  SECTION_CREATED: 'section.created',
  SECTION_UPDATED: 'section.updated',
  SECTION_DELETED: 'section.deleted',
  ROLL_NUMBERS_ASSIGNED: 'section.roll_numbers_assigned',
  TEACHER_ASSIGNED: 'teacher_assignment.created',
  TEACHER_UNASSIGNED: 'teacher_assignment.deleted',
  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_USER_LINKED: 'employee.user_linked',
  STUDENT_CREATED: 'student.created',
  STUDENT_UPDATED: 'student.updated',
  GUARDIAN_ADDED: 'guardian.added',
  GUARDIAN_UPDATED: 'guardian.updated',
  GUARDIAN_REMOVED: 'guardian.removed',
  ENROLMENT_CREATED: 'enrolment.created',
  ENROLMENT_UPDATED: 'enrolment.updated',
  STUDENT_TRANSFERRED: 'enrolment.transferred',
  STUDENT_WITHDRAWN: 'enrolment.withdrawn',
  STUDENTS_PROMOTED: 'enrolment.promotion_run',
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_DELETED: 'document.deleted',
  DOCUMENT_DOWNLOADED: 'document.downloaded',
  // Phase 4
  ATTENDANCE_MARKED: 'attendance.marked',
  ATTENDANCE_CORRECTED: 'attendance.corrected',
  LEAVE_REQUESTED: 'leave.requested',
  LEAVE_APPROVED: 'leave.approved',
  LEAVE_REJECTED: 'leave.rejected',
  LEAVE_CANCELLED: 'leave.cancelled',
  // Phase 5
  FEE_HEAD_CREATED: 'fee_head.created',
  FEE_HEAD_UPDATED: 'fee_head.updated',
  FEE_STRUCTURE_CREATED: 'fee_structure.created',
  FEE_STRUCTURE_UPDATED: 'fee_structure.updated',
  FEE_DUES_GENERATED: 'fee_due.generated',
  FEE_CHARGE_ADDED: 'fee_due.charge_added',
  FEE_DUE_DELETED: 'fee_due.deleted',
  FEE_ADJUSTMENT_ADDED: 'fee_adjustment.added',
  PAYMENT_RECORDED: 'payment.recorded',
  PAYMENT_VOIDED: 'payment.voided',
  PAYMENT_REVERSED: 'payment.reversed',
  CHEQUE_CLEARED: 'payment.cheque_cleared',
  CHEQUE_BOUNCED: 'payment.cheque_bounced',
  // Phase 6
  EXAM_CREATED: 'exam.created',
  EXAM_UPDATED: 'exam.updated',
  EXAM_SUBJECTS_SET: 'exam.subjects_set',
  EXAM_STATUS_CHANGED: 'exam.status_changed',
  EXAM_FINALIZED: 'exam.finalized',
  MARKS_SAVED: 'marks.saved',
  MARKS_SUBMITTED: 'marks.submitted',
  MARKS_APPROVED: 'marks.approved',
  MARKS_RETURNED: 'marks.returned',
  GRADING_SCALE_SAVED: 'grading_scale.saved',
  TIMETABLE_CREATED: 'timetable.created',
  TIMETABLE_UPDATED: 'timetable.updated',
  TIMETABLE_PUBLISHED: 'timetable.published',
  TIMETABLE_ARCHIVED: 'timetable.archived',
  // Phase 7
  VEHICLE_SAVED: 'vehicle.saved',
  ROUTE_SAVED: 'transport_route.saved',
  TRANSPORT_ASSIGNED: 'transport.assigned',
  TRANSPORT_ENDED: 'transport.ended',
  COMPLAINT_CREATED: 'complaint.created',
  COMPLAINT_UPDATED: 'complaint.updated',
  MEETING_SCHEDULED: 'meeting.scheduled',
  MEETING_UPDATED: 'meeting.updated',
  INVENTORY_CATEGORY_SAVED: 'inventory_category.saved',
  INVENTORY_ITEM_CREATED: 'inventory_item.created',
  INVENTORY_ITEM_UPDATED: 'inventory_item.updated',
  INVENTORY_ITEM_DELETED: 'inventory_item.deleted',
  SALARY_COMPONENT_SAVED: 'salary_component.saved',
  PAYROLL_CREATED: 'payroll.created',
  PAYROLL_RECORD_SAVED: 'payroll.record_saved',
  PAYROLL_EMPLOYEE_ADDED: 'payroll.employee_added',
  PAYROLL_EMPLOYEE_REMOVED: 'payroll.employee_removed',
  PAYROLL_APPROVED: 'payroll.approved',
  PAYROLL_REOPENED: 'payroll.reopened',
  PAYROLL_PAID: 'payroll.paid',
  PAYROLL_DELETED: 'payroll.deleted',
  CERTIFICATE_TEMPLATE_SAVED: 'certificate_template.saved',
  CERTIFICATE_ISSUED: 'certificate.issued',
  ID_CARD_TEMPLATE_SAVED: 'id_card_template.saved',
  ID_CARDS_GENERATED: 'id_cards.generated',
  // Phase 8
  REPORT_EXPORTED: 'report.exported',
  DATA_IMPORT_COMMITTED: 'data_import.committed',
  // Development tooling: demo data seed / clear (pnpm demo:seed, pnpm demo:clear)
  DEMO_DATA_SEEDED: 'demo_data.seeded',
  DEMO_DATA_CLEARED: 'demo_data.cleared',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(80).optional(),
  userId: uuidSchema.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  user: { id: string; fullName: string } | null;
  beforeJson: unknown;
  afterJson: unknown;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}
