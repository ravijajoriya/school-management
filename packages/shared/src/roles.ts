/** System roles seeded in Phase 1. Additional admin sub-roles are permission-driven. */
export const ROLE_CODES = {
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
