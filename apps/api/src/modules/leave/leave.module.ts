import { Body, Controller, Get, HttpCode, Module, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  approveLeaveSchema,
  createLeaveRequestSchema,
  listLeaveRequestsQuerySchema,
  rejectLeaveSchema,
  uuidSchema,
  type CreateLeaveRequestInput,
  type ListLeaveRequestsQuery,
  type ReviewLeaveInput,
} from '@school/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { LeaveService } from './leave.service.js';

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Leave')
@ApiBearerAuth()
@Controller('leave-requests')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  // --- Self-service (teacher portal) ---------------------------------------------------------

  @Get('mine')
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  mine(@CurrentUser() user: RequestUser) {
    return this.leave.listMine(user);
  }

  @Post('mine')
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  apply(
    @Body({ schema: createLeaveRequestSchema }) body: CreateLeaveRequestInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.leave.apply(body, user, getRequestContext(req));
  }

  @Post('mine/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAVE_APPLY)
  cancel(@id() leaveId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.leave.cancel(leaveId, user, getRequestContext(req));
  }

  // --- Office ----------------------------------------------------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  list(@Query({ schema: listLeaveRequestsQuerySchema }) query: ListLeaveRequestsQuery) {
    return this.leave.list(query);
  }

  /** Pending count and who is on leave today (dashboard). */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.LEAVE_READ)
  summary() {
    return this.leave.summary();
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  approve(
    @id() leaveId: string,
    @Body({ schema: approveLeaveSchema }) body: ReviewLeaveInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.leave.review(leaveId, 'APPROVED', body.remarks, user, getRequestContext(req));
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.LEAVE_APPROVE)
  reject(
    @id() leaveId: string,
    @Body({ schema: rejectLeaveSchema }) body: ReviewLeaveInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.leave.review(leaveId, 'REJECTED', body.remarks, user, getRequestContext(req));
  }
}

@Module({
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
