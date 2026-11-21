import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  pageKeySchema,
  publicContactMessageSchema,
  publicEnquirySchema,
  publicEventsQuerySchema,
  publicGalleryQuerySchema,
  uuidSchema,
  type PageKey,
  type PublicContactMessageInput,
  type PublicEnquiryInput,
} from '@school/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { EnquiriesService } from '../admissions/enquiries.service.js';
import { AnnouncementsService } from '../cms/announcements.service.js';
import { CmsModule } from '../cms/cms.module.js';
import { EventsService } from '../cms/events.service.js';
import { MediaService } from '../cms/media.service.js';
import { WebsitePagesService } from '../cms/website-pages.service.js';
import { ContactMessagesService } from '../contact/contact-messages.service.js';
import { ContactModule } from '../contact/contact.module.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,200}$/);
const limitSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });

/**
 * Content endpoints: browsers must revalidate every time (cheap 304 thanks to ETags), so a
 * freshly published change is visible on the next page load. Image files are immutable per id
 * and may be cached for longer.
 */
const revalidate = (res: Response) => res.setHeader('Cache-Control', 'public, no-cache');
const cacheFor = (res: Response, seconds: number) =>
  res.setHeader('Cache-Control', `public, max-age=${seconds}`);

/**
 * Unauthenticated endpoints used by the public website. They only ever return published,
 * currently visible content — never drafts, internal notices, enquiries or staff data.
 */
@ApiTags('Public website')
@Public()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller('public')
export class PublicController {
  constructor(
    private readonly pages: WebsitePagesService,
    private readonly announcements: AnnouncementsService,
    private readonly events: EventsService,
    private readonly media: MediaService,
    private readonly enquiries: EnquiriesService,
    private readonly contact: ContactMessagesService,
  ) {}

  @Get('pages/:key')
  async page(
    @Param('key', { schema: pageKeySchema }) key: PageKey,
    @Res({ passthrough: true }) res: Response,
  ) {
    revalidate(res);
    return this.pages.getPublished(key);
  }

  @Get('announcements')
  announcementsList(
    @Query({ schema: limitSchema }) q: { limit: number },
    @Res({ passthrough: true }) res: Response,
  ) {
    revalidate(res);
    return this.announcements.listPublic(q.limit);
  }

  @Get('announcements/:slug')
  announcement(@Param('slug', { schema: slugSchema }) slug: string) {
    return this.announcements.getPublic(slug);
  }

  @Get('events')
  eventsList(
    @Query({ schema: publicEventsQuerySchema }) q: { when: 'upcoming' | 'past'; limit: number },
    @Res({ passthrough: true }) res: Response,
  ) {
    revalidate(res);
    return this.events.listPublic(q.when, q.limit);
  }

  @Get('events/:slug')
  event(@Param('slug', { schema: slugSchema }) slug: string) {
    return this.events.getPublic(slug);
  }

  @Get('gallery')
  gallery(
    @Query({ schema: publicGalleryQuerySchema }) q: { category?: string; limit: number },
    @Res({ passthrough: true }) res: Response,
  ) {
    revalidate(res);
    return this.media.listPublicGallery(q.category, q.limit);
  }

  @Get('media/:id')
  async mediaFile(
    @Param('id', { schema: uuidSchema }) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.media.openFile(id, true);
    cacheFor(res, 86_400);
    return new StreamableFile(file.stream, { type: file.mimeType, length: file.size });
  }

  @Get('classes')
  classes(@Res({ passthrough: true }) res: Response) {
    revalidate(res);
    return this.enquiries.activeClasses();
  }

  /** Admission enquiry form. Rate-limited and protected by a honeypot field. */
  @Post('enquiries')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  submitEnquiry(
    @Body({ schema: publicEnquirySchema }) body: PublicEnquiryInput,
    @Req() req: Request,
  ) {
    return this.enquiries.submitPublic(body, getRequestContext(req));
  }

  /** Contact page message form. Rate-limited and protected by a honeypot field. */
  @Post('contact-messages')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async submitContact(
    @Body({ schema: publicContactMessageSchema }) body: PublicContactMessageInput,
    @Req() req: Request,
  ) {
    await this.contact.submitPublic(body, getRequestContext(req));
  }
}

@Module({
  imports: [CmsModule, AdmissionsModule, ContactModule],
  controllers: [PublicController],
})
export class PublicModule {}
