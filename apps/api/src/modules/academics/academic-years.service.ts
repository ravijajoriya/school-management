import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type AcademicYearItem,
  type AcademicYearStatus,
  type CreateAcademicYearInput,
  type UpdateAcademicYearInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, isoDay } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

type Db = PrismaService | Prisma.TransactionClient;

const include = { _count: { select: { sections: true, enrolments: true } } } as const;
type Row = Prisma.AcademicYearGetPayload<{ include: typeof include }>;

function toItem(r: Row): AcademicYearItem {
  return {
    id: r.id,
    name: r.name,
    startDate: isoDay(r.startDate),
    endDate: isoDay(r.endDate),
    status: r.status as AcademicYearStatus,
    isActive: r.isActive,
    sectionCount: r._count.sections,
    enrolmentCount: r._count.enrolments,
  };
}

@Injectable()
export class AcademicYearsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<AcademicYearItem[]> {
    const rows = await this.prisma.academicYear.findMany({
      include,
      orderBy: { startDate: 'desc' },
    });
    return rows.map(toItem);
  }

  async get(id: string): Promise<AcademicYearItem> {
    const row = await this.prisma.academicYear.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Academic year not found');
    return toItem(row);
  }

  async getActive(): Promise<AcademicYearItem | null> {
    const row = await this.prisma.academicYear.findFirst({ where: { isActive: true }, include });
    return row ? toItem(row) : null;
  }

  /** Closed years are read-only: no structure or enrolment changes. */
  async assertWritable(id: string, db: Db = this.prisma) {
    const year = await db.academicYear.findUnique({
      where: { id },
      select: { status: true, name: true },
    });
    if (!year) throw new NotFoundException('Academic year not found');
    if (year.status === 'CLOSED') {
      throw new BadRequestException(`Academic year ${year.name} is closed and cannot be changed`);
    }
    return year;
  }

  async create(input: CreateAcademicYearInput, actor: RequestUser, context: RequestContext) {
    await this.assertNoOverlap(input.startDate, input.endDate);
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.academicYear.create({
          data: {
            name: input.name,
            startDate: dayToDate(input.startDate),
            endDate: dayToDate(input.endDate),
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ACADEMIC_YEAR_CREATED,
          entityType: 'academic_year',
          entityId: item.id,
          userId: actor.id,
          after: item,
          context,
        },
        tx,
      );
      return item;
    });
  }

  async update(
    id: string,
    input: UpdateAcademicYearInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.get(id);
    if (before.status === 'CLOSED')
      throw new BadRequestException('Closed academic years cannot be edited');
    const start = input.startDate ?? before.startDate;
    const end = input.endDate ?? before.endDate;
    if (end <= start)
      throw new BadRequestException(['endDate: End date must be after the start date']);
    await this.assertNoOverlap(start, end, id);
    return this.prisma.$transaction(async (tx) => {
      const item = toItem(
        await tx.academicYear.update({
          where: { id },
          data: {
            name: input.name,
            startDate: input.startDate ? dayToDate(input.startDate) : undefined,
            endDate: input.endDate ? dayToDate(input.endDate) : undefined,
          },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ACADEMIC_YEAR_UPDATED,
          entityType: 'academic_year',
          entityId: id,
          userId: actor.id,
          before,
          after: item,
          context,
        },
        tx,
      );
      return item;
    });
  }

  /** Makes a DRAFT year the active one; the previously active year is closed. */
  async activate(id: string, actor: RequestUser, context: RequestContext) {
    const year = await this.get(id);
    if (year.status !== 'DRAFT')
      throw new BadRequestException('Only a draft academic year can be activated');
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true, name: true },
      });
      if (previous) {
        await tx.academicYear.update({
          where: { id: previous.id },
          data: { status: 'CLOSED', isActive: false },
        });
      }
      const item = toItem(
        await tx.academicYear.update({
          where: { id },
          data: { status: 'ACTIVE', isActive: true },
          include,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ACADEMIC_YEAR_ACTIVATED,
          entityType: 'academic_year',
          entityId: id,
          userId: actor.id,
          before: { activeYear: previous?.name ?? null },
          after: { activeYear: item.name, closed: previous?.name ?? null },
          context,
        },
        tx,
      );
      return item;
    });
  }

  /** Copies sections (without class teachers) and class-subject mappings from another year. */
  async copyStructure(id: string, fromId: string, actor: RequestUser, context: RequestContext) {
    if (id === fromId) throw new BadRequestException('Choose a different year to copy from');
    await this.assertWritable(id);
    const target = await this.get(id);
    if (target.sectionCount > 0) {
      throw new ConflictException(
        'This year already has sections. Copying is only possible into an empty year.',
      );
    }
    const [sections, subjects] = await Promise.all([
      this.prisma.section.findMany({ where: { academicYearId: fromId, isActive: true } }),
      this.prisma.classSubject.findMany({ where: { academicYearId: fromId, isActive: true } }),
    ]);
    if (!sections.length && !subjects.length)
      throw new BadRequestException('The selected year has nothing to copy');
    await this.prisma.$transaction(async (tx) => {
      await tx.section.createMany({
        data: sections.map((s) => ({
          academicYearId: id,
          classId: s.classId,
          name: s.name,
          roomLabel: s.roomLabel,
          capacity: s.capacity,
        })),
      });
      await tx.classSubject.createMany({
        data: subjects.map((c) => ({
          academicYearId: id,
          classId: c.classId,
          subjectId: c.subjectId,
          subjectType: c.subjectType,
        })),
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ACADEMIC_STRUCTURE_COPIED,
          entityType: 'academic_year',
          entityId: id,
          userId: actor.id,
          after: {
            fromAcademicYearId: fromId,
            sections: sections.length,
            classSubjects: subjects.length,
          },
          context,
        },
        tx,
      );
    });
    return { sections: sections.length, classSubjects: subjects.length };
  }

  private async assertNoOverlap(start: string, end: string, excludeId?: string) {
    const clash = await this.prisma.academicYear.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        startDate: { lte: dayToDate(end) },
        endDate: { gte: dayToDate(start) },
      },
      select: { name: true },
    });
    if (clash)
      throw new BadRequestException([`startDate: Dates overlap with academic year ${clash.name}`]);
  }
}
