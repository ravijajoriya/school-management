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
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createRoleSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
  uuidSchema,
  type CreateRoleInput,
  type SetRolePermissionsInput,
  type UpdateRoleInput,
} from '@school/shared';
import type { Request } from 'express';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { RolesService } from './roles.service.js';

@ApiTags('Roles & permissions')
@ApiBearerAuth()
@Controller()
export class AccessControlController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  listPermissions() {
    return this.roles.listPermissions();
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  listRoles() {
    return this.roles.listRoles();
  }

  @Get('roles/:id')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  getRole(@Param('id', { schema: uuidSchema }) id: string) {
    return this.roles.getRole(id);
  }

  @Post('roles')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  createRole(
    @Body({ schema: createRoleSchema }) body: CreateRoleInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.roles.createRole(body, actor, getRequestContext(req));
  }

  @Patch('roles/:id')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  updateRole(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateRoleSchema }) body: UpdateRoleInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.roles.updateRole(id, body, actor, getRequestContext(req));
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async deleteRole(
    @Param('id', { schema: uuidSchema }) id: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    await this.roles.deleteRole(id, actor, getRequestContext(req));
  }

  /** Replaces the full permission set of a role. */
  @Put('roles/:id/permissions')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  setPermissions(
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: setRolePermissionsSchema }) body: SetRolePermissionsInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.roles.setPermissions(id, body.permissionCodes, actor, getRequestContext(req));
  }
}
