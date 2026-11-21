import { Body, Controller, Get, Module, Param, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  attendanceSheetQuerySchema,
  dailyReportQuerySchema,
  markAttendanceSchema,
  monthlyReportQuerySchema,
  sectionRegisterQuerySchema,
  studentAttendanceQuerySchema,
  uuidSchema,
  type AttendanceSheetQuery,
  type MarkAttendanceData,
} from '@school/shared';
import type { Request } from 'express';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { AttendanceReportsService } from './attendance-reports.service.js';
import { AttendanceService } from './attendance.service.js';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly reports: AttendanceReportsService,
  ) {}

  /** The class sheet for one date. Class teacher (own section) or attendance.read. */
  @Get('sheet')
  @Authenticated()
  sheet(
    @Query({ schema: attendanceSheetQuerySchema }) query: AttendanceSheetQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attendance.sheet(query, user);
  }

  /**
   * Mark or correct attendance: the whole class or a single student (1..n entries).
   * Class teacher: today only. attendance.manage: any day; past days need `correctionReason`.
   */
  @Put('sheet')
  @Authenticated()
  mark(
    @Body({ schema: markAttendanceSchema }) body: MarkAttendanceData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.attendance.mark(body, user, getRequestContext(req));
  }

  /** Teacher portal: sections the user is class teacher of, with today's progress. */
  @Get('my-sections')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_MARK)
  mySections(@CurrentUser() user: RequestUser) {
    return this.attendance.mySections(user);
  }

  @Get('reports/daily')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  daily(@Query({ schema: dailyReportQuerySchema }) query: { date: string }) {
    return this.reports.daily(query.date);
  }

  @Get('reports/monthly')
  @RequirePermissions(PERMISSIONS.ATTENDANCE_READ)
  monthly(@Query({ schema: monthlyReportQuerySchema }) query: { month: string }) {
    return this.reports.monthly(query.month);
  }

  /** Monthly register for one section. Class teacher (own section) or attendance.read. */
  @Get('reports/register')
  @Authenticated()
  register(
    @Query({ schema: sectionRegisterQuerySchema }) query: { sectionId: string; month: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.reports.register(query.sectionId, query.month, user);
  }

  /** One student's attendance for a year. Class teacher (own section) or attendance.read. */
  @Get('students/:id')
  @Authenticated()
  student(
    @Param('id', { schema: uuidSchema }) studentId: string,
    @Query({ schema: studentAttendanceQuerySchema }) query: { academicYearId?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.reports.student(studentId, query.academicYearId, user);
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceReportsService],
  exports: [AttendanceService, AttendanceReportsService],
})
export class AttendanceModule {}
