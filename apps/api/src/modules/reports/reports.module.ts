import {
  BadRequestException,
  Controller,
  Get,
  Module,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  REPORT_EXPORTS,
  exportFormatQuerySchema,
  strengthQuerySchema,
} from '@school/shared';
import type { Request, Response } from 'express';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { schoolDate } from '../../common/utils/content.js';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AuditService } from '../audit/audit.service.js';
import { ComplaintsModule } from '../complaints/complaints.module.js';
import { ContactModule } from '../contact/contact.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { FeesModule } from '../fees/fees.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LeaveModule } from '../leave/leave.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { StudentsModule } from '../students/students.module.js';
import { TransportModule } from '../transport/transport.module.js';
import { exportFileName, toCsv, toXlsx } from './export-format.js';
import { OverviewService } from './overview.service.js';
import { ReportExportsService } from './report-exports.service.js';

const MIME = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly overview: OverviewService,
    private readonly exports: ReportExportsService,
    private readonly audit: AuditService,
  ) {}

  /** Admin dashboard in one request; sections the user can't see are null. */
  @Get('overview')
  @Authenticated()
  dashboard(@CurrentUser() user: RequestUser) {
    return this.overview.dashboard(user);
  }

  @Get('strength')
  @RequirePermissions(PERMISSIONS.STUDENTS_READ)
  strength(@Query({ schema: strengthQuerySchema }) q: { academicYearId?: string }) {
    return this.overview.strength(q.academicYearId);
  }

  /**
   * Download an approved report as CSV or Excel. The report's own permission is checked, the
   * export is audited (who, which report, which filters, how many rows) and rate-limited.
   */
  @Get('exports/:key')
  @Authenticated()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async export(
    @Param('key') key: string,
    @Query() query: Record<string, unknown>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = exportFormatQuerySchema.safeParse({ format: query.format });
    if (!parsed.success) throw new BadRequestException(['format: Use csv or xlsx']);
    const { format } = parsed.data;
    const { key: k, params, table } = await this.exports.build(key, query, user);
    const body = format === 'xlsx' ? await toXlsx(table) : toCsv(table);
    await this.audit.log({
      action: AUDIT_ACTIONS.REPORT_EXPORTED,
      entityType: 'report',
      entityId: null,
      userId: user.id,
      after: { report: k, label: REPORT_EXPORTS[k].label, format, params, rows: table.rows.length },
      context: getRequestContext(req),
    });
    const fileName = exportFileName(table.title, schoolDate(), format);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(body, { type: MIME[format], length: body.length });
  }
}

@Module({
  imports: [
    StudentsModule,
    StaffModule,
    AttendanceModule,
    FeesModule,
    ExamsModule,
    PayrollModule,
    InventoryModule,
    TransportModule,
    ComplaintsModule,
    AdmissionsModule,
    LeaveModule,
    ContactModule,
  ],
  controllers: [ReportsController],
  providers: [OverviewService, ReportExportsService],
})
export class ReportsModule {}
