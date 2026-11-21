import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  DOCUMENT_MAX_BYTES,
  PERMISSIONS,
  createEmployeeLoginSchema,
  createEmployeeSchema,
  linkEmployeeUserSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
  uuidSchema,
  type CreateEmployeeData,
  type ListEmployeesQuery,
  type UpdateEmployeeData,
} from '@school/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import type { UploadedFile as Upload } from '../../infrastructure/storage/private-files.service.js';
import { UsersModule } from '../users/users.module.js';
import { EmployeesService } from './employees.service.js';

const id = () => Param('id', { schema: uuidSchema });

/** Streams a private file as a download (never rendered inline). */
export function downloadResponse(
  res: Response,
  file: { stream: NodeJS.ReadableStream; size: number; mimeType: string; fileName: string },
) {
  res.setHeader('Cache-Control', 'private, no-store');
  return new StreamableFile(file.stream as never, {
    type: file.mimeType,
    length: file.size,
    disposition: `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
  });
}

@ApiTags('Staff · Employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  list(@Query({ schema: listEmployeesQuerySchema }) query: ListEmployeesQuery) {
    return this.employees.list(query);
  }

  /** Active staff names for dropdowns (class teacher, assignments). */
  @Get('options')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  options() {
    return this.employees.options();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  get(@id() employeeId: string) {
    return this.employees.get(employeeId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  create(
    @Body({ schema: createEmployeeSchema }) body: CreateEmployeeData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.employees.create(body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  update(
    @id() employeeId: string,
    @Body({ schema: updateEmployeeSchema }) body: UpdateEmployeeData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.employees.update(employeeId, body, actor, getRequestContext(req));
  }

  @Patch(':id/user')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE, PERMISSIONS.USERS_UPDATE)
  linkUser(
    @id() employeeId: string,
    @Body({ schema: linkEmployeeUserSchema }) body: { userId: string | null },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.employees.linkUser(employeeId, body.userId, actor, getRequestContext(req));
  }

  @Post(':id/create-login')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE, PERMISSIONS.USERS_CREATE)
  createLogin(
    @id() employeeId: string,
    @Body({ schema: createEmployeeLoginSchema }) body: { roleIds: string[] },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.employees.createLogin(employeeId, body.roleIds, actor, getRequestContext(req));
  }

  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } }))
  upload(
    @id() employeeId: string,
    @UploadedFile() file: Upload | undefined,
    @Body({ schema: z.object({ documentType: z.string().max(60) }) })
    body: { documentType: string },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.employees.uploadDocument(
      employeeId,
      body.documentType,
      file,
      actor,
      getRequestContext(req),
    );
  }

  @Get(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  async download(
    @id() employeeId: string,
    @Param('documentId', { schema: uuidSchema }) documentId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return downloadResponse(
      res,
      await this.employees.openDocument(employeeId, documentId, actor, getRequestContext(req)),
    );
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  async deleteDocument(
    @id() employeeId: string,
    @Param('documentId', { schema: uuidSchema }) documentId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    await this.employees.deleteDocument(employeeId, documentId, actor, getRequestContext(req));
  }
}

@Module({
  imports: [UsersModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class StaffModule {}
