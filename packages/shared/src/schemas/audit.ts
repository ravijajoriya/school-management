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
