import {
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
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
import { Throttle } from '@nestjs/throttler';
import {
  IMPORT_TYPES,
  MAX_IMPORT_BYTES,
  PERMISSIONS,
  importQuerySchema,
  type ImportType,
} from '@school/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { ImportsService } from './imports.service.js';

const type = () => Param('type', { schema: z.enum(IMPORT_TYPES) });

@ApiTags('Data import')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /** Blank spreadsheet (CSV) with the right columns and an example row. */
  @Get('templates/:type')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  template(@type() t: ImportType, @Res({ passthrough: true }) res: Response) {
    const body = this.imports.template(t);
    res.setHeader('Content-Disposition', `attachment; filename="${t}-template.csv"`);
    return new StreamableFile(body, { type: 'text/csv; charset=utf-8', length: body.length });
  }

  @Get('history')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  history() {
    return this.imports.history();
  }

  /** Validate (dryRun=true, the default) or import (dryRun=false) a .csv / .xlsx file. */
  @Post(':type')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @RequirePermissions(PERMISSIONS.DATA_IMPORT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  run(
    @type() t: ImportType,
    @Query({ schema: importQuerySchema }) q: { dryRun: boolean },
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.imports.run(t, file, q.dryRun, user, getRequestContext(req));
  }
}

@Module({
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
