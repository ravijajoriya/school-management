import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  MEDIA_MAX_BYTES,
  PERMISSIONS,
  createAnnouncementSchema,
  createEventSchema,
  createNoticeSchema,
  listAnnouncementsQuerySchema,
  listEventsQuerySchema,
  listMediaQuerySchema,
  pageKeySchema,
  paginationQuerySchema,
  savePageDraftSchema,
  updateAnnouncementSchema,
  updateEventSchema,
  updateMediaSchema,
  updateNoticeSchema,
  uploadMediaSchema,
  uuidSchema,
  type CreateAnnouncementInput,
  type CreateEventInput,
  type CreateNoticeInput,
  type ListAnnouncementsQuery,
  type ListEventsQuery,
  type ListMediaQuery,
  type MediaCategory,
  type PageKey,
  type PaginationQuery,
  type SavePageDraftInput,
  type UpdateAnnouncementInput,
  type UpdateEventInput,
  type UpdateMediaInput,
  type UpdateNoticeInput,
} from '@school/shared';
import type { Request } from 'express';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AnnouncementsService } from './announcements.service.js';
import { EventsService } from './events.service.js';
import { MediaService, type UploadedFile as Upload } from './media.service.js';
import { NoticesService } from './notices.service.js';
import { WebsitePagesService } from './website-pages.service.js';

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('CMS · Website pages')
@ApiBearerAuth()
@Controller('website-pages')
export class WebsitePagesController {
  constructor(private readonly pages: WebsitePagesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.WEBSITE_MANAGE)
  list() {
    return this.pages.list();
  }

  @Get(':key')
  @RequirePermissions(PERMISSIONS.WEBSITE_MANAGE)
  get(@Param('key', { schema: pageKeySchema }) key: PageKey) {
    return this.pages.get(key);
  }

  /** Saves the draft; the live site changes only when the page is published. */
  @Put(':key')
  @RequirePermissions(PERMISSIONS.WEBSITE_MANAGE)
  save(
    @Param('key', { schema: pageKeySchema }) key: PageKey,
    @Body({ schema: savePageDraftSchema }) body: SavePageDraftInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.pages.saveDraft(key, body, actor, getRequestContext(req));
  }

  @Post(':key/publish')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.WEBSITE_MANAGE)
  publish(
    @Param('key', { schema: pageKeySchema }) key: PageKey,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.pages.publish(key, actor, getRequestContext(req));
  }
}

@ApiTags('CMS · Announcements')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE)
  list(@Query({ schema: listAnnouncementsQuerySchema }) query: ListAnnouncementsQuery) {
    return this.announcements.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE)
  get(@id() announcementId: string) {
    return this.announcements.get(announcementId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE)
  create(
    @Body({ schema: createAnnouncementSchema }) body: CreateAnnouncementInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.announcements.create(body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE)
  update(
    @id() announcementId: string,
    @Body({ schema: updateAnnouncementSchema }) body: UpdateAnnouncementInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.announcements.update(announcementId, body, actor, getRequestContext(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ANNOUNCEMENTS_MANAGE)
  async remove(
    @id() announcementId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    await this.announcements.remove(announcementId, actor, getRequestContext(req));
  }
}

@ApiTags('CMS · Events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  list(@Query({ schema: listEventsQuerySchema }) query: ListEventsQuery) {
    return this.events.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  get(@id() eventId: string) {
    return this.events.get(eventId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  create(
    @Body({ schema: createEventSchema }) body: CreateEventInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.events.create(body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  update(
    @id() eventId: string,
    @Body({ schema: updateEventSchema }) body: UpdateEventInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.events.update(eventId, body, actor, getRequestContext(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.EVENTS_MANAGE)
  async remove(@id() eventId: string, @CurrentUser() actor: RequestUser, @Req() req: Request) {
    await this.events.remove(eventId, actor, getRequestContext(req));
  }
}

@ApiTags('CMS · Media library')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
  list(@Query({ schema: listMediaQuerySchema }) query: ListMediaQuery) {
    return this.media.list(query);
  }

  /** Multipart upload: `file` (JPEG/PNG/WebP, ≤ 5 MB) plus title, category, altText, isPublic. */
  @Post()
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_BYTES, files: 1 } }))
  upload(
    @UploadedFile() file: Upload | undefined,
    @Body({ schema: uploadMediaSchema })
    body: { title?: string; category: MediaCategory; altText?: string; isPublic: boolean },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.media.upload(file, body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
  update(
    @id() mediaId: string,
    @Body({ schema: updateMediaSchema }) body: UpdateMediaInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.media.update(mediaId, body, actor, getRequestContext(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
  async remove(@id() mediaId: string, @CurrentUser() actor: RequestUser, @Req() req: Request) {
    await this.media.remove(mediaId, actor, getRequestContext(req));
  }

  /** Staff preview of any image, including hidden ones. */
  @Get(':id/file')
  @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
  async file(@id() mediaId: string) {
    const file = await this.media.openFile(mediaId, false);
    return new StreamableFile(file.stream, { type: file.mimeType, length: file.size });
  }
}

@ApiTags('Internal notices')
@ApiBearerAuth()
@Controller('notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  /** Live notices for the signed-in user (dashboard). */
  @Get('feed')
  @Authenticated()
  feed(@CurrentUser() user: RequestUser) {
    return this.notices.feed(user);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.NOTICES_MANAGE)
  list(@Query({ schema: paginationQuerySchema }) query: PaginationQuery) {
    return this.notices.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.NOTICES_MANAGE)
  create(
    @Body({ schema: createNoticeSchema }) body: CreateNoticeInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.notices.create(body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.NOTICES_MANAGE)
  update(
    @id() noticeId: string,
    @Body({ schema: updateNoticeSchema }) body: UpdateNoticeInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.notices.update(noticeId, body, actor, getRequestContext(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.NOTICES_MANAGE)
  async remove(@id() noticeId: string, @CurrentUser() actor: RequestUser, @Req() req: Request) {
    await this.notices.remove(noticeId, actor, getRequestContext(req));
  }
}
