import { z } from 'zod';

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z][A-Z0-9_]{1,49}$/,
      'Use capital letters, digits and underscores, e.g. ACCOUNTANT',
    ),
  name: z.string().trim().min(2, 'Enter a role name').max(100),
  description: z.string().trim().max(500).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a role name').max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(1).max(120)),
});

export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

export interface RoleItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  /** System roles whose permissions are fixed (ADMIN always has every permission). */
  permissionsLocked: boolean;
  userCount: number;
  permissionCodes: string[];
}
