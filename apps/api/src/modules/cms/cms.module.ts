import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service.js';
import {
  AnnouncementsController,
  EventsController,
  MediaController,
  NoticesController,
  WebsitePagesController,
} from './cms.controllers.js';
import { EventsService } from './events.service.js';
import { MediaService } from './media.service.js';
import { NoticesService } from './notices.service.js';
import { WebsitePagesService } from './website-pages.service.js';

@Module({
  controllers: [
    WebsitePagesController,
    AnnouncementsController,
    EventsController,
    MediaController,
    NoticesController,
  ],
  providers: [
    WebsitePagesService,
    AnnouncementsService,
    EventsService,
    MediaService,
    NoticesService,
  ],
  exports: [WebsitePagesService, AnnouncementsService, EventsService, MediaService],
})
export class CmsModule {}
