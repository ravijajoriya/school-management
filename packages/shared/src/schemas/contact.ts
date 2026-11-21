import { z } from 'zod';
import { emailSchema, paginationQuerySchema, phoneSchema } from './common.js';

/** Contact page "Send Us a Message" form. `website` is a honeypot field for bots. */
export const publicContactMessageSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(160),
  email: emailSchema,
  phone: phoneSchema,
  message: z.string().trim().min(5, 'Write your message').max(3000),
  website: z.string().max(200).optional(),
});
export type PublicContactMessageInput = z.input<typeof publicContactMessageSchema>;

export const CONTACT_MESSAGE_STATUSES = ['NEW', 'READ', 'ARCHIVED'] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

export const updateContactMessageSchema = z.object({
  status: z.enum(CONTACT_MESSAGE_STATUSES),
});

export const listContactMessagesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CONTACT_MESSAGE_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListContactMessagesQuery = z.infer<typeof listContactMessagesQuerySchema>;

export interface ContactMessageItem {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  message: string;
  status: ContactMessageStatus;
  createdAt: string;
  handledBy: { id: string; fullName: string } | null;
  handledAt: string | null;
}
