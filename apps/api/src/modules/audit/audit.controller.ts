import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, listAuditLogsQuerySchema, type ListAuditLogsQuery } from '@school/shared';
import { RequirePermissions } from '../../common/decorators/access.decorators.js';
import { AuditService } from './audit.service.js';

@ApiTags('Audit logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_LOGS_READ)
  list(@Query({ schema: listAuditLogsQuerySchema }) query: ListAuditLogsQuery) {
    return this.audit.list(query);
  }
}
