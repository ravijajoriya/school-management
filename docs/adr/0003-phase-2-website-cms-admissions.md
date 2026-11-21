# ADR 0003 — Phase 2: public website, CMS & admission enquiries

Status: accepted (defaults pending school confirmation) · Date: 2026-11-21

## Open design questions — defaults used

The school had not yet answered these; the recommended defaults were applied and can be changed later.

| Question                                         | Default applied                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| School name, address, phone, email, logo, photos | Taken from the design mock-up; editable in **Admin → Website Pages → School details**. Logo is a placeholder emblem. Photos are uploaded through the Media Library. |
| Contact page form                                | New `contact_messages` table + **Admin → Contact Messages** inbox.                                                                                                  |
| Class dropdown on the admission form             | `classes` table moved from Phase 3 into Phase 2 (migration 004). Seeded: Nursery, LKG, UKG, Class 1–12 — **to be confirmed**.                                       |
| Home-page statistics band                        | Admin-editable numbers (not calculated live).                                                                                                                       |
| Mobile / tablet layout                           | Designed responsively from the desktop mock-up; hamburger menu below 1280 px.                                                                                       |
| Footer & social links                            | Footer added (about text, quick links, contact); social links are CMS fields, hidden while empty.                                                                   |
| Language                                         | English only for now.                                                                                                                                               |
| Font                                             | Poppins, self-hosted (`@fontsource/poppins`) — no request to Google Fonts.                                                                                          |

## Content model

| Decision                                                                                                                                               | Reason                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Each editable page is one `website_pages` row with **structured JSON** validated by a Zod schema per page (`@school/shared` → `PAGE_CONTENT_SCHEMAS`). | Admins get proper forms (lists, images, icons) instead of a free-form editor, and the public site can rely on the shape. |
| Added `published_content_json` + `published_at` to `website_pages`.                                                                                    | True draft/publish: editors save drafts freely; the public site serves only the published copy.                          |
| All CMS text is **plain text** rendered with preserved line breaks — never HTML.                                                                       | CMS content cannot inject scripts (XSS).                                                                                 |
| School details live in the `site` page (no separate settings table).                                                                                   | One mechanism for all editable content, with the same draft/publish flow.                                                |
| Starter content is seeded and published once; re-running the seed never overwrites edits.                                                              | Site works out of the box; safe to seed on every deploy.                                                                 |
| Publishing checks every referenced image still exists and is public; images used by a page cannot be deleted or hidden.                                | Prevents broken images on the live site.                                                                                 |

## Announcements, events, notices

- Announcements are public when `PUBLISHED` and inside `publish_at`/`expires_at`. Publishing without a schedule stamps `publish_at = now` (used for ordering and the “New” badge, 7 days).
- Slugs are generated from the title, kept stable when the title changes (shared links keep working).
- Events: drafts are hidden; `CANCELLED` events stay visible with a “Cancelled” label so parents are informed. “Upcoming” includes events happening today (school time zone, Asia/Kolkata).
- Internal notices are staff-only (`GET /notices/feed`), targeted at all staff or one role, and never exposed on public endpoints.

## Media

- Uploads: JPEG/PNG/WebP up to 5 MB, type detected from the **file contents** (client MIME/extension ignored); stored under generated keys `media/YYYY/MM/<uuid>.<ext>`.
- Storage driver: local folder (`STORAGE_DIR`) for now; to be swapped for S3-compatible object storage before production (Nest's `@nestjs/storage` is the candidate).
- Public files are served by id with a 1-day cache; hidden images return 404 publicly and are previewable by staff.

## Admission enquiries

| Decision                                                                                                                  | Reason                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reference numbers `ENQ-YYYY-NNNNN` from a PostgreSQL sequence.                                                            | Unique under concurrent submissions without locking; gaps are acceptable.                                              |
| Statuses: New, Contacted, Visit scheduled, Admission confirmed, Not interested, Closed — **to be confirmed**.             | Covers a typical admissions funnel. “Converted to student” arrives in Phase 3 (`converted_student_id`, FK added then). |
| Sources: Website, Walk-in, Phone, Referral, Other. Staff can record walk-in/phone enquiries.                              | Single queue for every channel.                                                                                        |
| Follow-ups can change status in the same step; the first action on an unassigned enquiry assigns it to that staff member. | Fewer clicks; clear ownership.                                                                                         |
| History = follow-ups + audit log entries for the enquiry.                                                                 | No extra history table; audit log is already append-only.                                                              |
| Enquiries can only be assigned to active staff with `enquiries.read` or `enquiries.manage`.                               | Avoids assigning to people who can't see the queue.                                                                    |
| Spam controls: honeypot field (bots get a fake success, nothing stored) + 5 submissions per 10 minutes per IP.            | No CAPTCHA friction for parents.                                                                                       |

## Caching

Public content endpoints send `Cache-Control: public, no-cache` (browsers revalidate; ETag makes it a cheap 304), so a newly published change is visible on the next page load. Image files are cached for a day.

## New permissions

`website.manage`, `announcements.manage`, `events.manage`, `media.manage`, `notices.manage`,
`enquiries.read`, `enquiries.manage`, `contact_messages.manage` (ADMIN holds all automatically).
