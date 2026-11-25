import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  listHolidaysQuerySchema,
  saveHolidaySchema,
  uuidSchema,
  type HolidayItem,
  type ListHolidaysQuery,
  type SaveHolidayInput,
} from '@school/shared';
import type { Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  Authenticated,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/access.decorators.js';
import { getRequestContext, type RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, isoDay } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

type HolidayRow = Prisma.HolidayGetPayload<object>;

const toItem = (h: HolidayRow): HolidayItem => ({
  id: h.id,
  academicYearId: h.academicYearId,
  name: h.name,
  startDate: isoDay(h.startDate),
  endDate: isoDay(h.endDate),
  days: Math.round((h.endDate.getTime() - h.startDate.getTime()) / 86_400_000) + 1,
});

/** True for Sunday (school days are Monday–Saturday). `day` is YYYY-MM-DD. */
export const isSunday = (day: string) => dayToDate(day).getUTCDay() === 0;

/**
 * School holiday calendar. Holidays are managed by the office (academics.manage); every signed-in
 * user can read them (teachers see them on their timetable). Attendance can't be marked on a
 * holiday, and the database refuses overlapping holidays within a year.
 */
@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListHolidaysQuery): Promise<HolidayItem[]> {
    const where: Prisma.HolidayWhereInput = {
      ...(q.academicYearId
        ? { academicYearId: q.academicYearId }
        : q.from || q.to
          ? {}
          : { academicYear: { isActive: true } }),
      ...(q.to ? { startDate: { lte: dayToDate(q.to) } } : {}),
      ...(q.from ? { endDate: { gte: dayToDate(q.from) } } : {}),
    };
    const rows = await this.prisma.holiday.findMany({ where, orderBy: { startDate: 'asc' } });
    return rows.map(toItem);
  }

  /** The holiday covering `day` (YYYY-MM-DD), if any. */
  async on(day: string): Promise<HolidayItem | null> {
    const d = dayToDate(day);
    const row = await this.prisma.holiday.findFirst({
      where: { startDate: { lte: d }, endDate: { gte: d } },
    });
    return row ? toItem(row) : null;
  }

  /** Holidays overlapping [from, to]. */
  between(from: string, to: string) {
    return this.list({ from, to });
  }

  async save(
    id: string | null,
    input: SaveHolidayInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const year = await this.prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
    if (!year) throw new BadRequestException(['academicYearId: Academic year not found']);
    if (year.status === 'CLOSED')
      throw new BadRequestException(`${year.name} is closed, so its holidays can't change`);
    if (input.startDate < isoDay(year.startDate) || input.endDate > isoDay(year.endDate))
      throw new BadRequestException([
        `startDate: The holiday must fall within ${year.name} (${isoDay(year.startDate)} to ${isoDay(year.endDate)})`,
      ]);
    const data = {
      academicYearId: year.id,
      name: input.name,
      startDate: dayToDate(input.startDate),
      endDate: dayToDate(input.endDate),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.holiday.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('Holiday not found');
      const saved = id
        ? await tx.holiday.update({ where: { id }, data })
        : await tx.holiday.create({ data: { ...data, createdBy: actor.id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.HOLIDAY_SAVED,
          entityType: 'holiday',
          entityId: saved.id,
          userId: actor.id,
          before: before ? toItem(before) : null,
          after: toItem(saved),
          context,
        },
        tx,
      );
      return saved;
    });
    return toItem(row);
  }

  async remove(id: string, actor: RequestUser, context: RequestContext) {
    const before = await this.prisma.holiday.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Holiday not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.holiday.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.HOLIDAY_DELETED,
          entityType: 'holiday',
          entityId: id,
          userId: actor.id,
          before: toItem(before),
          context,
        },
        tx,
      );
    });
  }
}

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Holidays')
@ApiBearerAuth()
@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  /** Any signed-in user: the current year's holidays, or a year / date range. */
  @Get()
  @Authenticated()
  list(@Query({ schema: listHolidaysQuerySchema }) q: ListHolidaysQuery) {
    return this.holidays.list(q);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  create(
    @Body({ schema: saveHolidaySchema }) body: SaveHolidayInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.holidays.save(null, body, user, getRequestContext(req));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  update(
    @id() holidayId: string,
    @Body({ schema: saveHolidaySchema }) body: SaveHolidayInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.holidays.save(holidayId, body, user, getRequestContext(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ACADEMICS_MANAGE)
  async remove(@id() holidayId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    await this.holidays.remove(holidayId, user, getRequestContext(req));
  }
}
