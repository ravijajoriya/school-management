import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

/** ISO date-time with offset (e.g. from `new Date().toISOString()`), or null to clear. */
const dateTime = z.iso.datetime({ offset: true, message: 'Enter a valid date and time' });
const nullableDateTime = z.union([dateTime, z.null()]).optional();

/** Refinement (for `.refine(...)`) checking that `end` is not before `start` when both are set. */
function afterIfBoth<T extends Record<string, unknown>>(
  start: keyof T & string,
  end: keyof T & string,
  message: string,
): [(v: T) => boolean, { path: string[]; message: string }] {
  return [
    (v) => !v[start] || !v[end] || new Date(v[end] as string) >= new Date(v[start] as string),
    { path: [end], message },
  ];
}

// --- Announcements (public) ---------------------------------------------------------------

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

const announcementFields = z.object({
  title: z.string().trim().min(3, 'Enter a title').max(180),
  body: z.string().trim().min(1, 'Enter the announcement text').max(10_000),
  status: z.enum(ANNOUNCEMENT_STATUSES).default('DRAFT'),
  /** When it becomes visible; null = as soon as it is published. */
  publishAt: nullableDateTime,
  /** When it stops being visible; null = never. */
  expiresAt: nullableDateTime,
});

export const createAnnouncementSchema = announcementFields.refine(
  ...afterIfBoth('publishAt', 'expiresAt', 'Expiry must be after the publish time'),
);
export const updateAnnouncementSchema = announcementFields
  .partial()
  .refine(...afterIfBoth('publishAt', 'expiresAt', 'Expiry must be after the publish time'));
export type CreateAnnouncementInput = z.input<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.input<typeof updateAnnouncementSchema>;

export const listAnnouncementsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;

export interface AnnouncementItem {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: AnnouncementStatus;
  publishAt: string | null;
  expiresAt: string | null;
  /** True when published and inside its visibility window right now. */
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string };
}

export interface PublicAnnouncement {
  title: string;
  slug: string;
  body: string;
  publishedAt: string;
  /** Published within the last 7 days. */
  isNew: boolean;
}

// --- Events (public) ------------------------------------------------------------------------

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

const eventFields = z.object({
  title: z.string().trim().min(3, 'Enter a title').max(180),
  description: z.string().trim().max(5000).nullable().optional(),
  venue: z.string().trim().max(160).nullable().optional(),
  startsAt: dateTime,
  endsAt: nullableDateTime,
  status: z.enum(EVENT_STATUSES).default('DRAFT'),
});

export const createEventSchema = eventFields.refine(
  ...afterIfBoth('startsAt', 'endsAt', 'End must be after the start'),
);
export const updateEventSchema = eventFields
  .partial()
  .refine(...afterIfBoth('startsAt', 'endsAt', 'End must be after the start'));
export type CreateEventInput = z.input<typeof createEventSchema>;
export type UpdateEventInput = z.input<typeof updateEventSchema>;

export const listEventsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(EVENT_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  when: z.enum(['upcoming', 'past']).optional(),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  venue: string | null;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
  createdAt: string;
  createdBy: { id: string; fullName: string };
}

export type PublicEvent = Pick<
  EventItem,
  'title' | 'slug' | 'description' | 'venue' | 'startsAt' | 'endsAt'
> & { status: Exclude<EventStatus, 'DRAFT'> };

export const publicEventsQuerySchema = z.object({
  when: z.enum(['upcoming', 'past']).default('upcoming'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// --- Media library -----------------------------------------------------------------------

export const MEDIA_CATEGORIES = [
  'ACADEMIC',
  'SPORTS',
  'EVENTS',
  'ACTIVITIES',
  'CAMPUS',
  'BANNER',
  'FACILITY',
  'GENERAL',
] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** Categories shown as filter tabs in the public gallery. */
export const GALLERY_CATEGORIES = ['ACADEMIC', 'SPORTS', 'EVENTS', 'ACTIVITIES', 'CAMPUS'] as const;

export const MEDIA_CATEGORY_LABELS: Record<MediaCategory, string> = {
  ACADEMIC: 'Academic',
  SPORTS: 'Sports',
  EVENTS: 'Events',
  ACTIVITIES: 'Activities',
  CAMPUS: 'Campus',
  BANNER: 'Banner',
  FACILITY: 'Facility',
  GENERAL: 'General',
};

export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

/** Form fields sent alongside an uploaded file (multipart/form-data, so values arrive as strings). */
export const uploadMediaSchema = z.object({
  title: z.string().trim().max(160).optional(),
  category: z.enum(MEDIA_CATEGORIES).default('GENERAL'),
  altText: z.string().trim().max(255).optional(),
  isPublic: booleanish.default(true),
});
export type UploadMediaInput = z.input<typeof uploadMediaSchema>;

export const updateMediaSchema = z.object({
  title: z.string().trim().max(160).nullable().optional(),
  category: z.enum(MEDIA_CATEGORIES).optional(),
  altText: z.string().trim().max(255).nullable().optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>;

export const listMediaQuerySchema = paginationQuerySchema.extend({
  category: z.enum(MEDIA_CATEGORIES).optional(),
  search: z.string().trim().max(100).optional(),
  publicOnly: booleanish.optional(),
});
export type ListMediaQuery = z.infer<typeof listMediaQuerySchema>;

export interface MediaItem {
  id: string;
  title: string | null;
  category: MediaCategory;
  mimeType: string;
  fileSizeBytes: number;
  altText: string | null;
  isPublic: boolean;
  /** Public URL (only works while the image is public). */
  url: string;
  createdAt: string;
  uploadedBy: { id: string; fullName: string };
}

export interface PublicMedia {
  id: string;
  title: string | null;
  category: MediaCategory;
  altText: string | null;
  url: string;
}

export const publicGalleryQuerySchema = z.object({
  category: z.enum(GALLERY_CATEGORIES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

// --- Internal notices (staff only) ----------------------------------------------------------

const noticeFields = z.object({
  title: z.string().trim().min(3, 'Enter a title').max(180),
  body: z.string().trim().min(1, 'Enter the notice text').max(5000),
  /** Role code the notice is for (e.g. TEACHER); null = all staff. */
  audienceRoleCode: z.string().trim().max(50).nullable().default(null),
  publishAt: nullableDateTime,
  expiresAt: nullableDateTime,
});

export const createNoticeSchema = noticeFields.refine(
  ...afterIfBoth('publishAt', 'expiresAt', 'Expiry must be after the publish time'),
);
export const updateNoticeSchema = noticeFields
  .partial()
  .refine(...afterIfBoth('publishAt', 'expiresAt', 'Expiry must be after the publish time'));
export type CreateNoticeInput = z.input<typeof createNoticeSchema>;
export type UpdateNoticeInput = z.input<typeof updateNoticeSchema>;

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  audienceRoleCode: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  isLive: boolean;
  createdAt: string;
  createdBy: { id: string; fullName: string };
}
