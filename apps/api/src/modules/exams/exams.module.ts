import {
  Body,
  Controller,
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
  createExaminationSchema,
  examStatusSchema,
  listExaminationsQuerySchema,
  marksActionSchema,
  marksSheetQuerySchema,
  reviewMarksSchema,
  saveGradingScaleSchema,
  saveMarksSchema,
  sectionResultsQuerySchema,
  setExamSubjectsSchema,
  updateExaminationSchema,
  uuidSchema,
  type CreateExaminationData,
  type ReviewMarksInput,
  type SaveGradingScaleData,
  type SaveMarksData,
  type SetExamSubjectsData,
  type UpdateExaminationInput,
} from '@school/shared';
import type { Request } from 'express';
import { z } from 'zod';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { ExamsService } from './exams.service.js';
import { GradingService } from './grading.service.js';
import { MarksService } from './marks.service.js';
import { ResultsService } from './results.service.js';

const id = () => Param('id', { schema: uuidSchema });
type Ids = { examSubjectId: string; sectionId: string };

@ApiTags('Examinations')
@ApiBearerAuth()
@Controller('exams')
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly grading: GradingService,
    private readonly marks: MarksService,
    private readonly results: ResultsService,
  ) {}

  // --- Grading scales (declared before ':id' routes) -------------------------------------------

  @Get('grading-scales')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  scales() {
    return this.grading.list();
  }

  @Post('grading-scales')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  createScale(
    @Body({ schema: saveGradingScaleSchema }) body: SaveGradingScaleData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.grading.save(null, body, user, getRequestContext(req));
  }

  @Put('grading-scales/:id')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  updateScale(
    @id() scaleId: string,
    @Body({ schema: saveGradingScaleSchema }) body: SaveGradingScaleData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.grading.save(scaleId, body, user, getRequestContext(req));
  }

  // --- Marks -----------------------------------------------------------------------------------

  /** Teacher portal: subject × section lists for scheduled/open/finalised exams. */
  @Get('marks/my-tasks')
  @RequirePermissions(PERMISSIONS.MARKS_ENTER)
  myTasks(@CurrentUser() user: RequestUser) {
    return this.marks.myTasks(user);
  }

  /** Marks sheet: the assigned teacher, exams.read or exams.manage. */
  @Get('marks/sheet')
  @Authenticated()
  sheet(@Query({ schema: marksSheetQuerySchema }) q: Ids, @CurrentUser() user: RequestUser) {
    return this.marks.sheet(q.examSubjectId, q.sectionId, user);
  }

  @Put('marks/sheet')
  @Authenticated()
  saveMarks(
    @Body({ schema: saveMarksSchema }) body: SaveMarksData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.marks.save(body, user, getRequestContext(req));
  }

  @Post('marks/submit')
  @HttpCode(200)
  @Authenticated()
  submit(
    @Body({ schema: marksActionSchema }) body: Ids,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.marks.submit(body.examSubjectId, body.sectionId, user, getRequestContext(req));
  }

  @Post('marks/review')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.MARKS_APPROVE)
  review(
    @Body({ schema: reviewMarksSchema }) body: ReviewMarksInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.marks.review(body, user, getRequestContext(req));
  }

  // --- Results ---------------------------------------------------------------------------------

  /** Section results & performance: exams.read, or the section's class teacher. */
  @Get('results')
  @Authenticated()
  sectionResults(
    @Query({ schema: sectionResultsQuerySchema }) q: { examinationId: string; sectionId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.results.sectionResults(q.examinationId, q.sectionId, user);
  }

  @Get(':id/report-cards/:enrolmentId')
  @Authenticated()
  reportCard(
    @id() examId: string,
    @Param('enrolmentId', { schema: uuidSchema }) enrolmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.results.reportCard(examId, enrolmentId, user);
  }

  // --- Examinations ----------------------------------------------------------------------------

  @Get()
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  list(
    @Query({ schema: listExaminationsQuerySchema }) q: { academicYearId: string; classId?: string },
  ) {
    return this.exams.list(q.academicYearId, q.classId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  create(
    @Body({ schema: createExaminationSchema }) body: CreateExaminationData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.exams.create(body, user, getRequestContext(req));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  get(@id() examId: string) {
    return this.exams.get(examId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  update(
    @id() examId: string,
    @Body({ schema: updateExaminationSchema }) body: UpdateExaminationInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.exams.update(examId, body, user, getRequestContext(req));
  }

  @Put(':id/subjects')
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  setSubjects(
    @id() examId: string,
    @Body({ schema: setExamSubjectsSchema }) body: SetExamSubjectsData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.exams.setSubjects(examId, body, user, getRequestContext(req));
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  setStatus(
    @id() examId: string,
    @Body({ schema: examStatusSchema }) body: z.infer<typeof examStatusSchema>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.exams.setStatus(examId, body.status, user, getRequestContext(req));
  }

  @Get(':id/progress')
  @RequirePermissions(PERMISSIONS.EXAMS_READ)
  progress(@id() examId: string) {
    return this.exams.progress(examId);
  }

  @Post(':id/finalize')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.EXAMS_MANAGE)
  finalize(@id() examId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.exams.finalize(examId, user, getRequestContext(req));
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [ExamsController],
  providers: [ExamsService, GradingService, MarksService, ResultsService],
})
export class ExamsModule {}
