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
  Put,
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
  assignRollNumbersSchema,
  convertEnquirySchema,
  createEnrolmentSchema,
  createStudentSchema,
  enrolmentExitSchema,
  guardianSchema,
  listStudentsQuerySchema,
  promotionSchema,
  updateEnrolmentSchema,
  updateGuardianSchema,
  updateStudentSchema,
  uuidSchema,
  type ConvertEnquiryData,
  type CreateStudentData,
  type EnrolmentExitInput,
  type GuardianInput,
  type ListStudentsQuery,
  type PromotionInput,
  type UpdateEnrolmentInput,
  type UpdateGuardianInput,
  type UpdateStudentData,
} from '@school/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import type { UploadedFile as Upload } from '../../infrastructure/storage/private-files.service.js';
import { downloadResponse } from '../staff/staff.module.js';
import { EnrolmentsService, type EnrolmentData } from './enrolments.service.js';
import { StudentsService } from './students.service.js';

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly enrolments: EnrolmentsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  list(@Query({ schema: listStudentsQuerySchema }) query: ListStudentsQuery) {
    return this.students.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  get(@id() studentId: string) {
    return this.students.get(studentId);
  }

  /** Register a student with guardians and (optionally) enrol in one step. */
  @Post()
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  create(
    @Body({ schema: createStudentSchema }) body: CreateStudentData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.students.create(body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  update(
    @id() studentId: string,
    @Body({ schema: updateStudentSchema }) body: UpdateStudentData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.students.update(studentId, body, actor, getRequestContext(req));
  }

  @Post(':id/guardians')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  addGuardian(
    @id() studentId: string,
    @Body({ schema: guardianSchema }) body: GuardianInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.students.addGuardian(studentId, body, actor, getRequestContext(req));
  }

  @Patch(':id/guardians/:guardianId')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  updateGuardian(
    @id() studentId: string,
    @Param('guardianId', { schema: uuidSchema }) guardianId: string,
    @Body({ schema: updateGuardianSchema }) body: UpdateGuardianInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.students.updateGuardian(studentId, guardianId, body, actor, getRequestContext(req));
  }

  @Delete(':id/guardians/:guardianId')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  removeGuardian(
    @id() studentId: string,
    @Param('guardianId', { schema: uuidSchema }) guardianId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.students.removeGuardian(studentId, guardianId, actor, getRequestContext(req));
  }

  @Post(':id/enrolments')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  enrol(
    @id() studentId: string,
    @Body({ schema: createEnrolmentSchema }) body: EnrolmentData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enrolments.enrol(studentId, body, actor, getRequestContext(req));
  }

  @Put(':id/photo')
  @HttpCode(204)
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  async setPhoto(
    @id() studentId: string,
    @UploadedFile() file: Upload | undefined,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    await this.students.setPhoto(studentId, file, actor, getRequestContext(req));
  }

  @Get(':id/photo')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  async photo(@id() studentId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.students.openPhoto(studentId);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.stream, { type: file.mimeType, length: file.size });
  }

  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } }))
  upload(
    @id() studentId: string,
    @UploadedFile() file: Upload | undefined,
    @Body({ schema: z.object({ documentType: z.string().max(60) }) })
    body: { documentType: string },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.students.uploadDocument(
      studentId,
      body.documentType,
      file,
      actor,
      getRequestContext(req),
    );
  }

  @Get(':id/documents/:documentId')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  async download(
    @id() studentId: string,
    @Param('documentId', { schema: uuidSchema }) documentId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return downloadResponse(
      res,
      await this.students.openDocument(studentId, documentId, actor, getRequestContext(req)),
    );
  }

  @Delete(':id/documents/:documentId')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  async deleteDocument(
    @id() studentId: string,
    @Param('documentId', { schema: uuidSchema }) documentId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    await this.students.deleteDocument(studentId, documentId, actor, getRequestContext(req));
  }
}

@ApiTags('Students · Enrolments')
@ApiBearerAuth()
@Controller()
export class EnrolmentsController {
  constructor(
    private readonly enrolments: EnrolmentsService,
    private readonly students: StudentsService,
  ) {}

  /** Change section or roll number within the same year. */
  @Patch('enrolments/:id')
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  update(
    @id() enrolmentId: string,
    @Body({ schema: updateEnrolmentSchema }) body: UpdateEnrolmentInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enrolments.update(enrolmentId, body, actor, getRequestContext(req));
  }

  @Post('enrolments/:id/transfer')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.STUDENTS_LIFECYCLE)
  transfer(
    @id() enrolmentId: string,
    @Body({ schema: enrolmentExitSchema }) body: EnrolmentExitInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enrolments.exit(enrolmentId, 'TRANSFERRED', body, actor, getRequestContext(req));
  }

  @Post('enrolments/:id/withdraw')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.STUDENTS_LIFECYCLE)
  withdraw(
    @id() enrolmentId: string,
    @Body({ schema: enrolmentExitSchema }) body: EnrolmentExitInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enrolments.exit(enrolmentId, 'WITHDRAWN', body, actor, getRequestContext(req));
  }

  /** Promote / retain / complete a batch of students into the next academic year. */
  @Post('promotions')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.STUDENTS_LIFECYCLE)
  promote(
    @Body({ schema: promotionSchema }) body: PromotionInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enrolments.promote(body, actor, getRequestContext(req));
  }

  @Post('sections/:id/assign-roll-numbers')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.STUDENTS_MANAGE)
  assignRollNumbers(
    @id() sectionId: string,
    @Body({ schema: assignRollNumbersSchema }) body: { order: 'NAME' | 'ADMISSION_NUMBER' },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.enrolments.assignRollNumbers(sectionId, body.order, actor, getRequestContext(req));
  }

  /** Convert an admission enquiry into a registered, enrolled student. */
  @Post('enquiries/:id/convert')
  @RequirePermissions(PERMISSIONS.ENQUIRIES_MANAGE, PERMISSIONS.STUDENTS_MANAGE)
  convert(
    @id() enquiryId: string,
    @Body({ schema: convertEnquirySchema }) body: ConvertEnquiryData,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.students.convertEnquiry(enquiryId, body, actor, getRequestContext(req));
  }
}

@Module({
  controllers: [StudentsController, EnrolmentsController],
  providers: [StudentsService, EnrolmentsService],
  exports: [StudentsService, EnrolmentsService],
})
export class StudentsModule {}
