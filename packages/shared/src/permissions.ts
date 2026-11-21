/**
 * Single source of truth for permission codes.
 * The API seeds these into the `permissions` table and enforces them in guards;
 * the web app uses the same constants to show/hide actions.
 *
 * Convention: `<module>.<action>`. Add new modules phase by phase.
 */
export const PERMISSIONS = {
  // Phase 1 — identity & access
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DEACTIVATE: 'users.deactivate',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_LOGS_READ: 'audit_logs.read',

  // Phase 2 — public website, CMS & admissions
  WEBSITE_MANAGE: 'website.manage',
  ANNOUNCEMENTS_MANAGE: 'announcements.manage',
  EVENTS_MANAGE: 'events.manage',
  MEDIA_MANAGE: 'media.manage',
  NOTICES_MANAGE: 'notices.manage',
  ENQUIRIES_READ: 'enquiries.read',
  ENQUIRIES_MANAGE: 'enquiries.manage',
  CONTACT_MESSAGES_MANAGE: 'contact_messages.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  code: PermissionCode;
  name: string;
  module: string;
  description?: string;
}

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  { code: PERMISSIONS.USERS_READ, name: 'View users', module: 'users' },
  { code: PERMISSIONS.USERS_CREATE, name: 'Create users', module: 'users' },
  { code: PERMISSIONS.USERS_UPDATE, name: 'Update users', module: 'users' },
  { code: PERMISSIONS.USERS_DEACTIVATE, name: 'Deactivate users', module: 'users' },
  { code: PERMISSIONS.ROLES_READ, name: 'View roles & permissions', module: 'access_control' },
  { code: PERMISSIONS.ROLES_MANAGE, name: 'Manage roles & permissions', module: 'access_control' },
  { code: PERMISSIONS.AUDIT_LOGS_READ, name: 'View audit logs', module: 'audit' },
  {
    code: PERMISSIONS.WEBSITE_MANAGE,
    name: 'Edit & publish website pages and school details',
    module: 'website',
  },
  {
    code: PERMISSIONS.ANNOUNCEMENTS_MANAGE,
    name: 'Manage public announcements',
    module: 'website',
  },
  { code: PERMISSIONS.EVENTS_MANAGE, name: 'Manage events', module: 'website' },
  { code: PERMISSIONS.MEDIA_MANAGE, name: 'Upload & manage gallery images', module: 'website' },
  {
    code: PERMISSIONS.NOTICES_MANAGE,
    name: 'Publish internal staff notices',
    module: 'communication',
  },
  { code: PERMISSIONS.ENQUIRIES_READ, name: 'View admission enquiries', module: 'admissions' },
  {
    code: PERMISSIONS.ENQUIRIES_MANAGE,
    name: 'Update, assign & follow up admission enquiries',
    module: 'admissions',
  },
  {
    code: PERMISSIONS.CONTACT_MESSAGES_MANAGE,
    name: 'View & handle contact form messages',
    module: 'communication',
  },
];
