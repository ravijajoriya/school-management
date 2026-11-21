import { z } from 'zod';

/*
 * Structured content for the public website. Each editable page is one `website_pages` row
 * (keyed by `page_key`) whose JSON content must match the schema below. Text is plain text
 * (rendered with line breaks preserved) — never HTML — so CMS content cannot inject scripts.
 */

/** Icons the CMS may assign to highlights, stats and facilities (mapped to SVG icons in the web app). */
export const SITE_ICONS = [
  'award',
  'graduation-cap',
  'users',
  'building',
  'leaf',
  'book-open',
  'flask',
  'monitor',
  'trophy',
  'bus',
  'library',
  'shield',
  'heart',
  'star',
  'calendar',
  'school',
  'music',
  'palette',
] as const;
export type SiteIcon = (typeof SITE_ICONS)[number];

const text = (max: number, label = 'This field') =>
  z.string().trim().min(1, `${label} is required`).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default('');
const imageId = z.uuid().nullable().default(null);
const icon = z.enum(SITE_ICONS);
const optionalUrl = z
  .union([
    z.literal(''),
    z.url({ protocol: /^https?$/, message: 'Enter a full URL starting with https://' }),
  ])
  .default('');

// --- School details (page_key: site) -------------------------------------------------

export const siteContentSchema = z.object({
  schoolName: text(120, 'School name'),
  tagline: optionalText(120),
  address: text(300, 'Address'),
  phone: text(40, 'Phone'),
  email: z.union([z.literal(''), z.email('Enter a valid email address')]).default(''),
  officeHours: optionalText(120),
  /** Google Maps "embed" URL (https://www.google.com/maps/embed?...). */
  mapEmbedUrl: z
    .union([
      z.literal(''),
      z.url().refine((u) => u.startsWith('https://www.google.com/maps/embed'), {
        message: 'Use the "Embed a map" link from Google Maps',
      }),
    ])
    .default(''),
  social: z
    .object({ facebook: optionalUrl, instagram: optionalUrl, youtube: optionalUrl })
    .default({ facebook: '', instagram: '', youtube: '' }),
  footerText: optionalText(400),
});

// --- Home ------------------------------------------------------------------------------

export const homeContentSchema = z.object({
  heroSlides: z
    .array(
      z.object({
        heading: text(60, 'Heading'),
        highlight: optionalText(60),
        text: optionalText(300),
        imageId,
      }),
    )
    .min(1, 'Add at least one slide')
    .max(5),
  highlights: z.array(z.object({ title: text(40, 'Title'), icon })).max(6),
  about: z.object({
    heading: text(80, 'Heading'),
    text: text(1200, 'Text'),
    points: z.array(text(80, 'Point')).max(6),
    imageId,
  }),
  stats: z.array(z.object({ value: text(12, 'Value'), label: text(40, 'Label'), icon })).max(4),
});

// --- About -----------------------------------------------------------------------------

export const aboutContentSchema = z.object({
  intro: z.object({ heading: text(80, 'Heading'), text: text(3000, 'Text'), imageId }),
  vision: text(1500, 'Vision'),
  mission: text(1500, 'Mission'),
  principal: z.object({
    name: optionalText(120),
    designation: optionalText(120),
    message: optionalText(4000),
    imageId,
  }),
  coreValues: z
    .array(z.object({ title: text(60, 'Title'), description: optionalText(300) }))
    .max(8),
});

// --- Academics -------------------------------------------------------------------------

export const academicsContentSchema = z.object({
  overview: z.object({ text: text(3000, 'Overview'), imageId }),
  classesOffered: optionalText(1500),
  curriculum: optionalText(3000),
  subjects: z
    .array(z.object({ stage: text(60, 'Stage'), subjects: text(500, 'Subjects') }))
    .max(10),
  calendar: z.array(z.object({ period: text(40, 'Period'), event: text(160, 'Event') })).max(24),
});

// --- Facilities ------------------------------------------------------------------------

export const facilitiesContentSchema = z.object({
  intro: optionalText(600),
  items: z
    .array(z.object({ title: text(60, 'Title'), description: optionalText(400), icon, imageId }))
    .max(16),
});

// --- Admissions ------------------------------------------------------------------------

export const admissionsContentSchema = z.object({
  intro: optionalText(800),
  whyChooseUs: z.array(text(60, 'Reason')).max(8),
});

// --- Registry --------------------------------------------------------------------------

export const PAGE_CONTENT_SCHEMAS = {
  site: siteContentSchema,
  home: homeContentSchema,
  about: aboutContentSchema,
  academics: academicsContentSchema,
  facilities: facilitiesContentSchema,
  admissions: admissionsContentSchema,
} as const;

export type PageKey = keyof typeof PAGE_CONTENT_SCHEMAS;
export const PAGE_KEYS = Object.keys(PAGE_CONTENT_SCHEMAS) as PageKey[];

export const PAGE_LABELS: Record<PageKey, string> = {
  site: 'School details & contact',
  home: 'Home page',
  about: 'About Us',
  academics: 'Academics',
  facilities: 'Facilities',
  admissions: 'Admissions page',
};

export type SiteContent = z.output<typeof siteContentSchema>;
export type HomeContent = z.output<typeof homeContentSchema>;
export type AboutContent = z.output<typeof aboutContentSchema>;
export type AcademicsContent = z.output<typeof academicsContentSchema>;
export type FacilitiesContent = z.output<typeof facilitiesContentSchema>;
export type AdmissionsContent = z.output<typeof admissionsContentSchema>;

export interface PageContentMap {
  site: SiteContent;
  home: HomeContent;
  about: AboutContent;
  academics: AcademicsContent;
  facilities: FacilitiesContent;
  admissions: AdmissionsContent;
}

export const pageKeySchema = z.enum(PAGE_KEYS as [PageKey, ...PageKey[]]);

/** Body for saving a page draft; `content` is validated against the page's schema server-side. */
export const savePageDraftSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  content: z.unknown(),
});
export type SavePageDraftInput = z.infer<typeof savePageDraftSchema>;

export const PAGE_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

/** Admin view of a page: the working draft plus what is currently live. */
export interface WebsitePageItem<K extends PageKey = PageKey> {
  pageKey: K;
  title: string;
  status: PageStatus;
  content: PageContentMap[K];
  publishedContent: PageContentMap[K] | null;
  hasUnpublishedChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: { id: string; fullName: string } | null;
}
