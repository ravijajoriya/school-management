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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  cancelPaymentSchema,
  collectionReportQuerySchema,
  concessionReportQuerySchema,
  createAdjustmentSchema,
  createChargeSchema,
  createFeeHeadSchema,
  createFeeStructureSchema,
  duesReportQuerySchema,
  listFeeStructuresQuerySchema,
  listPaymentsQuerySchema,
  recordPaymentSchema,
  studentLedgerQuerySchema,
  updateFeeHeadSchema,
  updateFeeStructureSchema,
  uuidSchema,
  type AdjustmentType,
  type CancelPaymentInput,
  type CreateAdjustmentInput,
  type CreateChargeInput,
  type CreateFeeHeadInput,
  type CreateFeeStructureData,
  type DuesReportQuery,
  type ListPaymentsQuery,
  type RecordPaymentData,
  type UpdateFeeHeadInput,
  type UpdateFeeStructureData,
} from '@school/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { FeeConfigService } from './fee-config.service.js';
import { FeeLedgerService } from './fee-ledger.service.js';
import { FeeReportsService } from './fee-reports.service.js';
import { PaymentsService } from './payments.service.js';

const id = () => Param('id', { schema: uuidSchema });
const reasonSchema = z.object({ reason: z.string().trim().max(1000).optional() });

@ApiTags('Fees')
@ApiBearerAuth()
@Controller('fees')
export class FeesController {
  constructor(
    private readonly config: FeeConfigService,
    private readonly ledger: FeeLedgerService,
    private readonly payments: PaymentsService,
    private readonly reports: FeeReportsService,
  ) {}

  // --- Set-up --------------------------------------------------------------------------------

  @Get('heads')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  heads() {
    return this.config.listHeads();
  }

  @Post('heads')
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  createHead(
    @Body({ schema: createFeeHeadSchema }) body: CreateFeeHeadInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.config.createHead(body, user, getRequestContext(req));
  }

  @Patch('heads/:id')
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  updateHead(
    @id() headId: string,
    @Body({ schema: updateFeeHeadSchema }) body: UpdateFeeHeadInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.config.updateHead(headId, body, user, getRequestContext(req));
  }

  @Get('structures')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  structures(@Query({ schema: listFeeStructuresQuerySchema }) query: { academicYearId: string }) {
    return this.config.listStructures(query.academicYearId);
  }

  @Post('structures')
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  createStructure(
    @Body({ schema: createFeeStructureSchema }) body: CreateFeeStructureData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.config.createStructure(body, user, getRequestContext(req));
  }

  @Patch('structures/:id')
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  updateStructure(
    @id() structureId: string,
    @Body({ schema: updateFeeStructureSchema }) body: UpdateFeeStructureData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.config.updateStructure(structureId, body, user, getRequestContext(req));
  }

  /** Bill every active student of the plan's class (safe to repeat: never bills twice). */
  @Post('structures/:id/generate-dues')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  generate(@id() structureId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.config.generateForStructure(structureId, user, getRequestContext(req));
  }

  @Post('enrolments/:id/generate-dues')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  generateForEnrolment(
    @id() enrolmentId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.config.generateForEnrolment(enrolmentId, user, getRequestContext(req));
  }

  // --- Ledger --------------------------------------------------------------------------------

  @Get('students/:id/ledger')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  studentLedger(
    @id() studentId: string,
    @Query({ schema: studentLedgerQuerySchema }) query: { academicYearId?: string },
  ) {
    return this.ledger.ledger(studentId, query.academicYearId);
  }

  @Post('enrolments/:id/charges')
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  addCharge(
    @id() enrolmentId: string,
    @Body({ schema: createChargeSchema }) body: CreateChargeInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.ledger.addCharge(enrolmentId, body, user, getRequestContext(req));
  }

  @Delete('dues/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.FEES_CONFIGURE)
  deleteDue(@id() dueId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.ledger.deleteDue(dueId, user, getRequestContext(req));
  }

  @Post('dues/:id/adjustments')
  @RequirePermissions(PERMISSIONS.FEES_ADJUST)
  addAdjustment(
    @id() dueId: string,
    @Body({ schema: createAdjustmentSchema }) body: CreateAdjustmentInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.ledger.addAdjustment(dueId, body, user, getRequestContext(req));
  }

  // --- Payments & receipts -------------------------------------------------------------------

  @Get('payments')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  listPayments(@Query({ schema: listPaymentsQuerySchema }) query: ListPaymentsQuery) {
    return this.payments.list(query);
  }

  @Post('payments')
  @RequirePermissions(PERMISSIONS.FEES_COLLECT)
  recordPayment(
    @Body({ schema: recordPaymentSchema }) body: RecordPaymentData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payments.record(body, user, getRequestContext(req));
  }

  @Get('payments/:id/receipt')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  receipt(@id() paymentId: string) {
    return this.payments.receipt(paymentId);
  }

  @Post('payments/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FEES_VOID)
  cancel(
    @id() paymentId: string,
    @Body({ schema: cancelPaymentSchema }) body: CancelPaymentInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payments.cancel(paymentId, body, user, getRequestContext(req));
  }

  @Post('payments/:id/cheque-cleared')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FEES_COLLECT)
  chequeCleared(@id() paymentId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.payments.chequeCleared(paymentId, user, getRequestContext(req));
  }

  @Post('payments/:id/cheque-bounced')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.FEES_VOID)
  chequeBounced(
    @id() paymentId: string,
    @Body({ schema: reasonSchema }) body: { reason?: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.payments.chequeBounced(paymentId, body.reason, user, getRequestContext(req));
  }

  // --- Reports -------------------------------------------------------------------------------

  @Get('reports/dues')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  duesReport(@Query({ schema: duesReportQuerySchema }) query: DuesReportQuery) {
    return this.reports.dues(query);
  }

  @Get('reports/collection')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  collectionReport(
    @Query({ schema: collectionReportQuerySchema }) query: { from: string; to: string },
  ) {
    return this.reports.collection(query.from, query.to);
  }

  @Get('reports/concessions')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  concessionReport(
    @Query({ schema: concessionReportQuerySchema })
    query: {
      from: string;
      to: string;
      adjustmentType?: AdjustmentType;
    },
  ) {
    return this.reports.concessions(query.from, query.to, query.adjustmentType);
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.FEES_READ)
  summary() {
    return this.reports.summary();
  }
}

@Module({
  controllers: [FeesController],
  providers: [FeeConfigService, FeeLedgerService, PaymentsService, FeeReportsService],
  exports: [FeeLedgerService, PaymentsService, FeeReportsService],
})
export class FeesModule {}
