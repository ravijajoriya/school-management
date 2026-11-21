import { z } from 'zod';

/** Login accepts either an email address or a phone number as the identifier. */
export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number').max(255),
  password: z.string().min(1, 'Enter your password').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
