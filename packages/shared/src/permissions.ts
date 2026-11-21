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
];
