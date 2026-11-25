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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  copyStructureSchema,
  createAcademicYearSchema,
  createSectionSchema,
  createSubjectSchema,
  createTeacherAssignmentSchema,
  listTeacherAssignmentsQuerySchema,
  setClassSubjectsSchema,
  structureQuerySchema,
  updateAcademicYearSchema,
  updateSectionSchema,
  updateSubjectSchema,
  uuidSchema,
  type CreateAcademicYearInput,
  type CreateSectionInput,
  type CreateSubjectInput,
  type CreateTeacherAssignmentInput,
  type ListTeacherAssignmentsQuery,
  type SetClassSubjectsInput,
  type UpdateAcademicYearInput,
  type UpdateSectionInput,
  type UpdateSubjectInput,
} from '@school/shared';
import type { Request } from 'express';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AcademicYearsService } from './academic-years.service.js';
import { StructureService } from './structure.service.js';
import { TeacherScopeService } from './teacher-scope.service.js';
import { HolidaysController, HolidaysService } from './holidays.service.js';

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Academics · Years')
@ApiBearerAuth()
@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  list() {
    return this.years.list();
  }

  /** The active year (or null). Any signed-in user may read it. */
  @Get('active')
  @Authenticated()
  active() {
    return this.years.getActive();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  create(
    @Body({ schema: createAcademicYearSchema }) body: CreateAcademicYearInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.years.create(body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  update(
    @id() yearId: string,
    @Body({ schema: updateAcademicYearSchema }) body: UpdateAcademicYearInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.years.update(yearId, body, actor, getRequestContext(req));
  }

  /** Makes a draft year active and closes the previous one. */
  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  activate(@id() yearId: string, @CurrentUser() actor: RequestUser, @Req() req: Request) {
    return this.years.activate(yearId, actor, getRequestContext(req));
  }

  @Post(':id/copy-structure')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  copy(
    @id() yearId: string,
    @Body({ schema: copyStructureSchema }) body: { fromAcademicYearId: string },
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.years.copyStructure(yearId, body.fromAcademicYearId, actor, getRequestContext(req));
  }
}

@ApiTags('Academics · Subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly structure: StructureService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  list() {
    return this.structure.listSubjects();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  create(
    @Body({ schema: createSubjectSchema }) body: CreateSubjectInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.structure.createSubject(body, actor, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  update(
    @id() subjectId: string,
    @Body({ schema: updateSubjectSchema }) body: UpdateSubjectInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.structure.updateSubject(subjectId, body, actor, getRequestContext(req));
  }
}

@ApiTags('Academics · Structure')
@ApiBearerAuth()
@Controller()
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  /** Every class with its sections and subjects for one academic year. */
  @Get('academic-structure')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  get(@Query({ schema: structureQuerySchema }) q: { academicYearId: string }) {
    return this.structure.structure(q.academicYearId);
  }

  @Put('class-subjects')
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  setClassSubjects(
    @Body({ schema: setClassSubjectsSchema }) body: SetClassSubjectsInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.structure.setClassSubjects(body, actor, getRequestContext(req));
  }

  @Post('sections')
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  createSection(
    @Body({ schema: createSectionSchema }) body: CreateSectionInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.structure.createSection(body, actor, getRequestContext(req));
  }

  @Patch('sections/:id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  updateSection(
    @id() sectionId: string,
    @Body({ schema: updateSectionSchema }) body: UpdateSectionInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.structure.updateSection(sectionId, body, actor, getRequestContext(req));
  }

  @Delete('sections/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  async deleteSection(
    @id() sectionId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    await this.structure.deleteSection(sectionId, actor, getRequestContext(req));
  }

  @Get('teacher-assignments')
  @RequirePermissions(PERMISSIONS.ACADEMICS_READ)
  listAssignments(
    @Query({ schema: listTeacherAssignmentsQuerySchema }) q: ListTeacherAssignmentsQuery,
  ) {
    return this.structure.listAssignments(q);
  }

  @Post('teacher-assignments')
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  createAssignment(
    @Body({ schema: createTeacherAssignmentSchema }) body: CreateTeacherAssignmentInput,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    return this.structure.createAssignment(body, actor, getRequestContext(req));
  }

  @Delete('teacher-assignments/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  async deleteAssignment(
    @id() assignmentId: string,
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
  ) {
    await this.structure.deleteAssignment(assignmentId, actor, getRequestContext(req));
  }
}

/** Teacher portal: only the sections the signed-in teacher is assigned to. */
@ApiTags('Teacher portal')
@ApiBearerAuth()
@Controller('teacher')
export class TeacherPortalController {
  constructor(private readonly scope: TeacherScopeService) {}

  @Get('sections')
  @Authenticated()
  mySections(@CurrentUser() user: RequestUser) {
    return this.scope.mySections(user.id);
  }

  @Get('sections/:id/students')
  @Authenticated()
  roster(@id() sectionId: string, @CurrentUser() user: RequestUser) {
    return this.scope.roster(user.id, sectionId);
  }
}

@Module({
  controllers: [
    AcademicYearsController,
    SubjectsController,
    StructureController,
    TeacherPortalController,
    HolidaysController,
  ],
  providers: [AcademicYearsService, StructureService, TeacherScopeService, HolidaysService],
  exports: [AcademicYearsService, StructureService, TeacherScopeService, HolidaysService],
})
export class AcademicsModule {}
