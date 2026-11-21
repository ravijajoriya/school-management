import { z } from 'zod';
import type { PermissionCode } from '../permissions.js';
import type { UserStatus } from '../roles.js';

/** Login accepts either an email address or a phone number as the identifier. */
export const loginSchema = z.object({
  identifier: z
    .string({ error: 'Enter your email or phone number' })
    .trim()
    .min(3, 'Enter your email or phone number')
    .max(255),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Password policy for all staff accounts.
 * Minimum 8 characters with at least one letter and one number.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The signed-in user as returned by /auth/login, /auth/refresh and /auth/me. */
export interface AuthUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  mustChangePassword: boolean;
  roles: string[];
  permissions: PermissionCode[];
}

export interface AuthResponse {
  /** Short-lived bearer token. The refresh token is set as an httpOnly cookie, never returned in JSON. */
  accessToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  user: AuthUser;
}
