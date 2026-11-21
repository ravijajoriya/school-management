import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTIONS, type GradingScaleItem, type SaveGradingScaleData } from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { AuditService } from '../audit/audit.service.js';
import { toBands } from './exams-core.js';

const include = {
  academicYear: { select: { id: true, name: true } },
  class: { select: { id: true, name: true } },
  bands: { orderBy: { minPercentage: 'desc' } },
  _count: { select: { examinations: { where: { status: 'FINALIZED' } } } },
} satisfies Prisma.GradingScaleInclude;

type Row = Prisma.GradingScaleGetPayload<{ include: typeof include }>;

const toItem = (s: Row): GradingScaleItem => ({
  id: s.id,
  name: s.name,
  academicYear: s.academicYear,
  class: s.class,
  isActive: s.isActive,
  bands: toBands(s.bands),
  locked: s._count.examinations > 0,
});

/** Grading scales and their bands. A scale used by a finalised exam is locked (also by trigger). */
@Injectable()
export class GradingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<GradingScaleItem[]> {
    const rows = await this.prisma.gradingScale.findMany({
      include,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toItem);
  }

  async save(
    id: string | null,
    input: SaveGradingScaleData,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<GradingScaleItem> {
    if (id) {
      const existing = await this.prisma.gradingScale.findUnique({ where: { id }, include });
      if (!existing) throw new NotFoundException('Grading scale not found');
      if (existing._count.examinations > 0) {
        throw new BadRequestException(
          'This scale is used by a finalised examination, so its bands are locked. Create a new scale for future exams.',
        );
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const data = {
        name: input.name,
        academicYearId: input.academicYearId ?? null,
        classId: input.classId ?? null,
        isActive: input.isActive,
      };
      const scale = id
        ? await tx.gradingScale.update({ where: { id }, data })
        : await tx.gradingScale.create({ data });
      await tx.gradeBand.deleteMany({ where: { gradingScaleId: scale.id } });
      await tx.gradeBand.createMany({
        data: input.bands.map((b) => ({
          gradingScaleId: scale.id,
          minPercentage: b.minPercentage.toFixed(2),
          maxPercentage: b.maxPercentage.toFixed(2),
          gradeLabel: b.gradeLabel,
          remark: b.remark ?? null,
        })),
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.GRADING_SCALE_SAVED,
          entityType: 'grading_scale',
          entityId: scale.id,
          userId: actor.id,
          after: {
            name: input.name,
            bands: input.bands.map((b) => `${b.gradeLabel} ${b.minPercentage}–${b.maxPercentage}`),
          },
          context,
        },
        tx,
      );
      return tx.gradingScale.findUniqueOrThrow({ where: { id: scale.id }, include });
    });
    return toItem(row);
  }
}
