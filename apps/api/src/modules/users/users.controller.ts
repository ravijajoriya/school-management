import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createUserSchema,
  listUsersQuerySchema,
  setUserRolesSchema,
  updateUserSchema,
  uuidSchema,
  type CreateUserData,
  type ListUsersQuery,
  type SetUserRolesInput,
  type UpdateUserData,
} from '@school/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@Query({ schema: listUsersQuerySchema }) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  get(@Param('id', { schema: uuidSchema }) id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  create(
    @Body({ schema: createUserSchema }) body: CreateUserData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.users.create(body, actor, getRequestContext(req));
  }

  /** Updates profile fields and/or status (ACTIVE / INACTIVE / LOCKED). */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  update(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateUserSchema }) body: UpdateUserData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    if (body.status !== undefined && body.status !== 'ACTIVE') {
      // Deactivation additionally requires the dedicated permission.
      if (!actor.permissions.has(PERMISSIONS.USERS_DEACTIVATE)) {
        throw new ForbiddenException('You do not have permission to deactivate users');
      }
    }
    return this.users.update(id, body, actor, getRequestContext(req));
  }

  @Put(':id/roles')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  setRoles(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: setUserRolesSchema }) body: SetUserRolesInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.users.setRoles(id, body.roleIds, actor, getRequestContext(req));
  }

  /** Generates a temporary password (shown once) and ends the user's sessions. */
  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  resetPassword(
    @Param('id', { schema: uuidSchema }) id: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.users.resetPassword(id, actor, getRequestContext(req));
  }
}
