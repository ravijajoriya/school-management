import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createEnquirySchema,
  createFollowUpSchema,
  listEnquiriesQuerySchema,
  updateEnquirySchema,
  uuidSchema,
  type CreateEnquiryInput,
  type CreateFollowUpInput,
  type ListEnquiriesQuery,
  type UpdateEnquiryInput,
} from '@school/shared';
import type { Request } from 'express';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { EnquiriesService } from './enquiries.service.js';

@ApiTags('Admissions · Enquiries')
@ApiBearerAuth()
@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ENQUIRIES_READ)
  list(
    @Query({ schema: listEnquiriesQuerySchema }) query: ListEnquiriesQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.enquiries.list(query, actor);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.ENQUIRIES_READ)
  summary() {
    return this.enquiries.summary();
  }

  /** Staff who can be assigned enquiries. */
  @Get('assignees')
  @RequirePermissions(PERMISSIONS.ENQUIRIES_READ)
  assignees() {
    return this.enquiries.assignees();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ENQUIRIES_READ)
  get(@Param('id', { schema: uuidSchema }) id: string) {
    return this.enquiries.get(id);
  }

  /** Record a walk-in / phone enquiry. */
  @Post()
  @RequirePermissions(PERMISSIONS.ENQUIRIES_MANAGE)
  create(
    @Body({ schema: createEnquirySchema }) body: CreateEnquiryInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enquiries.create(body, actor, getRequestContext(req));
  }

  /** Change status and/or assignee. */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ENQUIRIES_MANAGE)
  update(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateEnquirySchema }) body: UpdateEnquiryInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enquiries.update(id, body, actor, getRequestContext(req));
  }

  @Post(':id/follow-ups')
  @RequirePermissions(PERMISSIONS.ENQUIRIES_MANAGE)
  addFollowUp(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: createFollowUpSchema }) body: CreateFollowUpInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enquiries.addFollowUp(id, body, actor, getRequestContext(req));
  }
}

@ApiTags('Academics · Classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  /** Active classes (used by filters and forms). Full class management arrives in Phase 3. */
  @Get()
  @Authenticated()
  list() {
    return this.enquiries.activeClasses();
  }
}
