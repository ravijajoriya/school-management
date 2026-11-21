import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createIdCardBatchSchema,
  issueCertificateSchema,
  paginationQuerySchema,
  saveCertificateTemplateSchema,
  saveIdCardTemplateSchema,
  uuidSchema,
  type CreateIdCardBatchInput,
  type IssueCertificateInput,
  type SaveCertificateTemplateInput,
  type SaveIdCardTemplateInput,
} from '@school/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { StudentsModule } from '../students/students.module.js';
import { StudentsService } from '../students/students.service.js';
import { CertificatesService } from './certificates.service.js';
import { IdCardsService } from './id-cards.service.js';

const id = () => Param('id', { schema: uuidSchema });
const listIssuesQuerySchema = paginationQuerySchema.extend({
  studentId: uuidSchema.optional(),
  templateId: uuidSchema.optional(),
});
type TemplateBody = Required<SaveCertificateTemplateInput>;
type IdTemplateBody = Required<SaveIdCardTemplateInput>;

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Issuers need the list to choose a template; editors to edit it. */
  @Get('templates')
  @Authenticated()
  templates(@CurrentUser() user: RequestUser) {
    if (
      !user.permissions.has(PERMISSIONS.CERTIFICATES_ISSUE) &&
      !user.permissions.has(PERMISSIONS.CERTIFICATES_TEMPLATES)
    )
      throw new ForbiddenException('You do not have permission to view certificate templates');
    return this.certificates.templates();
  }

  @Post('templates')
  @RequirePermissions(PERMISSIONS.CERTIFICATES_TEMPLATES)
  createTemplate(
    @Body({ schema: saveCertificateTemplateSchema }) body: TemplateBody,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.certificates.saveTemplate(null, body, user, getRequestContext(req));
  }

  @Patch('templates/:id')
  @RequirePermissions(PERMISSIONS.CERTIFICATES_TEMPLATES)
  updateTemplate(
    @id() templateId: string,
    @Body({ schema: saveCertificateTemplateSchema }) body: TemplateBody,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.certificates.saveTemplate(templateId, body, user, getRequestContext(req));
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CERTIFICATES_ISSUE)
  list(@Query({ schema: listIssuesQuerySchema }) q: z.output<typeof listIssuesQuerySchema>) {
    return this.certificates.list(q);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CERTIFICATES_ISSUE)
  get(@id() issueId: string) {
    return this.certificates.get(issueId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CERTIFICATES_ISSUE)
  issue(
    @Body({ schema: issueCertificateSchema }) body: IssueCertificateInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.certificates.issue(body, user, getRequestContext(req));
  }
}

@ApiTags('ID cards')
@ApiBearerAuth()
@Controller('id-cards')
export class IdCardsController {
  constructor(
    private readonly idCards: IdCardsService,
    private readonly students: StudentsService,
  ) {}

  @Get('templates')
  @RequirePermissions(PERMISSIONS.ID_CARDS_GENERATE)
  templates() {
    return this.idCards.templates();
  }

  @Post('templates')
  @RequirePermissions(PERMISSIONS.ID_CARDS_GENERATE)
  createTemplate(
    @Body({ schema: saveIdCardTemplateSchema }) body: IdTemplateBody,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.idCards.saveTemplate(null, body, user, getRequestContext(req));
  }

  @Patch('templates/:id')
  @RequirePermissions(PERMISSIONS.ID_CARDS_GENERATE)
  updateTemplate(
    @id() templateId: string,
    @Body({ schema: saveIdCardTemplateSchema }) body: IdTemplateBody,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.idCards.saveTemplate(templateId, body, user, getRequestContext(req));
  }

  @Get('batches')
  @RequirePermissions(PERMISSIONS.ID_CARDS_GENERATE)
  batches() {
    return this.idCards.batches();
  }

  @Post('batches')
  @RequirePermissions(PERMISSIONS.ID_CARDS_GENERATE)
  create(
    @Body({ schema: createIdCardBatchSchema }) body: Required<CreateIdCardBatchInput>,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.idCards.create(body, user, getRequestContext(req));
  }

  @Get('batches/:id')
  @RequirePermissions(PERMISSIONS.ID_CARDS_GENERATE)
  view(@id() batchId: string) {
    return this.idCards.view(batchId);
  }

  /** Student photo for printing cards (ID card printers may not hold students.read). */
  @Get('photos/:id')
  @RequirePermissions(PERMISSIONS.ID_CARDS_GENERATE)
  async photo(@id() studentId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.students.openPhoto(studentId);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.stream, { type: file.mimeType, length: file.size });
  }
}

@Module({
  imports: [StudentsModule],
  controllers: [CertificatesController, IdCardsController],
  providers: [CertificatesService, IdCardsService],
})
export class CertificatesModule {}
