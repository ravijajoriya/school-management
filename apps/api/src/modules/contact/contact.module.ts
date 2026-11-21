import { Body, Controller, Get, Module, Param, Patch, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  listContactMessagesQuerySchema,
  updateContactMessageSchema,
  uuidSchema,
  type ContactMessageStatus,
  type ListContactMessagesQuery,
} from '@school/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { ContactMessagesService } from './contact-messages.service.js';

@ApiTags('Contact messages')
@ApiBearerAuth()
@Controller('contact-messages')
export class ContactMessagesController {
  constructor(private readonly messages: ContactMessagesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CONTACT_MESSAGES_MANAGE)
  list(@Query({ schema: listContactMessagesQuerySchema }) query: ListContactMessagesQuery) {
    return this.messages.list(query);
  }

  @Get('unread-count')
  @RequirePermissions(PERMISSIONS.CONTACT_MESSAGES_MANAGE)
  async unreadCount() {
    return { count: await this.messages.countNew() };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CONTACT_MESSAGES_MANAGE)
  update(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateContactMessageSchema }) body: { status: ContactMessageStatus },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.messages.updateStatus(id, body.status, actor, getRequestContext(req));
  }
}

@Module({
  controllers: [ContactMessagesController],
  providers: [ContactMessagesService],
  exports: [ContactMessagesService],
})
export class ContactModule {}
