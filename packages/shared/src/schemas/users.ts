import { z } from 'zod';
import { USER_STATUSES, type UserStatus } from '../roles.js';
import { passwordSchema } from './auth.js';
import { emailSchema, paginationQuerySchema, phoneSchema, uuidSchema } from './common.js';

const optionalEmail = z
  .union([z.literal(''), emailSchema])
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalPhone = z
  .union([z.literal(''), phoneSchema])
  .optional()
  .transform((v) => (v ? v : undefined));

export const createUserSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter the full name').max(160),
    email: optionalEmail,
    phone: optionalPhone,
    roleIds: z.array(uuidSchema).min(1, 'Select at least one role'),
    /** Optional. If omitted, the API generates a temporary password and returns it once. */
    password: z
      .union([z.literal(''), passwordSchema])
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((v) => v.email || v.phone, {
    path: ['email'],
    message: 'Enter an email or a phone number',
  });

export type CreateUserInput = z.input<typeof createUserSchema>;
export type CreateUserData = z.output<typeof createUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(160).optional(),
  /** `null` clears the value. */
  email: z
    .union([z.literal(''), z.null(), emailSchema])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  phone: z
    .union([z.literal(''), z.null(), phoneSchema])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  status: z.enum(USER_STATUSES).optional(),
});

export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type UpdateUserData = z.output<typeof updateUserSchema>;

export const setUserRolesSchema = z.object({
  roleIds: z.array(uuidSchema).min(1, 'Select at least one role'),
});

export type SetUserRolesInput = z.infer<typeof setUserRolesSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(USER_STATUSES).optional(),
  roleId: uuidSchema.optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export interface UserRoleSummary {
  id: string;
  code: string;
  name: string;
}

export interface UserListItem {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: UserRoleSummary[];
}

export interface UserCreatedResponse {
  user: UserListItem;
  /** Present only when the API generated the password. Show it once; it is never retrievable again. */
  temporaryPassword?: string;
}

export interface PasswordResetResponse {
  temporaryPassword: string;
}
