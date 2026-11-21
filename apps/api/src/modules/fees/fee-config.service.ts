import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type BillingFrequency,
  type CreateFeeHeadInput,
  type CreateFeeStructureData,
  type FeeHeadItem,
  type FeeStructureRow,
  type GenerateDuesResult,
  type UpdateFeeHeadInput,
  type UpdateFeeStructureData,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, isoDayOrNull } from '../../common/utils/content.js';
import { paiseToDb, rupees, toPaise } from '../../common/utils/money.js';
import { AuditService } from '../audit/audit.service.js';

const structureInclude = {
  academicYear: { select: { id: true, name: true, status: true } },
  class: { select: { id: true, name: true, levelOrder: true } },
  items: {
    include: { feeHead: { select: { id: true, code: true, name: true } } },
    orderBy: { sequenceNo: 'asc' },
  },
} satisfies Prisma.FeeStructureInclude;

type StructureRow = Prisma.FeeStructureGetPayload<{ include: typeof structureInclude }>;

/** Fee heads, fee plans (structures) per class and year, and generating student dues from them. */
@Injectable()
export class FeeConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Heads ---------------------------------------------------------------------------------

  async listHeads(): Promise<FeeHeadItem[]> {
    return this.prisma.feeHead.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  async createHead(input: CreateFeeHeadInput, actor: RequestUser, context: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const head = await tx.feeHead.create({
        data: { code: input.code, name: input.name, description: input.description ?? null },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.FEE_HEAD_CREATED,
          entityType: 'fee_head',
          entityId: head.id,
          userId: actor.id,
          after: head,
          context,
        },
        tx,
      );
      return head;
    });
  }

  async updateHead(
    id: string,
    input: UpdateFeeHeadInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.prisma.feeHead.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Fee head not found');
    return this.prisma.$transaction(async (tx) => {
      const head = await tx.feeHead.update({
        where: { id },
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.FEE_HEAD_UPDATED,
          entityType: 'fee_head',
          entityId: id,
          userId: actor.id,
          before,
          after: head,
          context,
        },
        tx,
      );
      return head;
    });
  }

  // --- Structures ----------------------------------------------------------------------------

  private async toRow(s: StructureRow): Promise<FeeStructureRow> {
    const billed = await this.prisma.studentFeeDue.findMany({
      where: { feeStructureItemId: { in: s.items.map((i) => i.id) } },
      distinct: ['studentEnrolmentId'],
      select: { studentEnrolmentId: true },
    });
    return {
      id: s.id,
      academicYear: { id: s.academicYear.id, name: s.academicYear.name },
      class: { id: s.class.id, name: s.class.name },
      name: s.name,
      billingFrequency: s.billingFrequency as BillingFrequency,
      isActive: s.isActive,
      items: s.items.map((i) => ({
        id: i.id,
        feeHead: i.feeHead,
        amount: rupees(toPaise(i.amount)),
        dueDate: isoDayOrNull(i.dueDate),
        installmentLabel: i.installmentLabel,
        sequenceNo: i.sequenceNo,
      })),
      total: rupees(s.items.reduce((sum, i) => sum + toPaise(i.amount), 0)),
      studentsBilled: billed.length,
    };
  }

  async listStructures(academicYearId: string): Promise<FeeStructureRow[]> {
    const rows = await this.prisma.feeStructure.findMany({
      where: { academicYearId },
      include: structureInclude,
      orderBy: [{ class: { levelOrder: 'asc' } }, { name: 'asc' }],
    });
    return Promise.all(rows.map((r) => this.toRow(r)));
  }

  private async assertYearOpen(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id: academicYearId } });
    if (!year) throw new BadRequestException(['academicYearId: Academic year not found']);
    if (year.status === 'CLOSED') {
      throw new BadRequestException([
        `academicYearId: ${year.name} is closed — fees can no longer be set up for it`,
      ]);
    }
    return year;
  }

  private async assertHeadsActive(ids: string[]) {
    const heads = await this.prisma.feeHead.findMany({
      where: { id: { in: ids }, isActive: true },
    });
    if (heads.length !== new Set(ids).size) {
      throw new BadRequestException(['items: Choose active fee heads only']);
    }
  }

  private itemsData(items: CreateFeeStructureData['items']) {
    return items.map((it, i) => ({
      feeHeadId: it.feeHeadId,
      amount: paiseToDb(Math.round(it.amount * 100)),
      dueDate: it.dueDate ? dayToDate(it.dueDate) : null,
      installmentLabel: it.installmentLabel ?? null,
      sequenceNo: i + 1,
    }));
  }

  async createStructure(
    input: CreateFeeStructureData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.assertYearOpen(input.academicYearId);
    await this.assertHeadsActive(input.items.map((i) => i.feeHeadId));
    const row = await this.prisma.$transaction(async (tx) => {
      const s = await tx.feeStructure.create({
        data: {
          academicYearId: input.academicYearId,
          classId: input.classId,
          name: input.name,
          billingFrequency: input.billingFrequency,
          items: { create: this.itemsData(input.items) },
        },
        include: structureInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.FEE_STRUCTURE_CREATED,
          entityType: 'fee_structure',
          entityId: s.id,
          userId: actor.id,
          after: {
            name: s.name,
            class: s.class.name,
            year: s.academicYear.name,
            items: input.items,
          },
          context,
        },
        tx,
      );
      return s;
    });
    return this.toRow(row);
  }

  async updateStructure(
    id: string,
    input: UpdateFeeStructureData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.prisma.feeStructure.findUnique({
      where: { id },
      include: structureInclude,
    });
    if (!before) throw new NotFoundException('Fee plan not found');
    await this.assertYearOpen(before.academicYearId);
    if (input.items) {
      const billed = await this.prisma.studentFeeDue.count({
        where: { feeStructureItemId: { in: before.items.map((i) => i.id) } },
      });
      if (billed) {
        throw new BadRequestException([
          'items: Dues have already been generated from this plan, so its fees can no longer change. Create a new plan, or add one-off charges to students.',
        ]);
      }
      await this.assertHeadsActive(input.items.map((i) => i.feeHeadId));
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.feeStructureItem.deleteMany({ where: { feeStructureId: id } });
        await tx.feeStructureItem.createMany({
          data: this.itemsData(input.items).map((d) => ({ ...d, feeStructureId: id })),
        });
      }
      const s = await tx.feeStructure.update({
        where: { id },
        data: {
          name: input.name,
          billingFrequency: input.billingFrequency,
          isActive: input.isActive,
        },
        include: structureInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.FEE_STRUCTURE_UPDATED,
          entityType: 'fee_structure',
          entityId: id,
          userId: actor.id,
          before: { name: before.name, isActive: before.isActive, items: before.items.length },
          after: { name: s.name, isActive: s.isActive, items: s.items.length },
          context,
        },
        tx,
      );
      return s;
    });
    return this.toRow(row);
  }

  // --- Generating dues -----------------------------------------------------------------------

  /** Bills every active student of the plan's class and year. Never bills a student twice. */
  async generateForStructure(
    id: string,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<GenerateDuesResult> {
    const s = await this.prisma.feeStructure.findUnique({
      where: { id },
      include: structureInclude,
    });
    if (!s) throw new NotFoundException('Fee plan not found');
    if (!s.isActive) throw new BadRequestException('This fee plan is inactive');
    await this.assertYearOpen(s.academicYearId);
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: { academicYearId: s.academicYearId, classId: s.classId, status: 'ACTIVE' },
      select: { id: true },
    });
    return this.generate(
      [s],
      enrolments.map((e) => e.id),
      actor,
      context,
      { structure: s.name, class: s.class.name },
    );
  }

  /** Bills one student with every active plan of their class (e.g. a mid-year admission). */
  async generateForEnrolment(
    enrolmentId: string,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<GenerateDuesResult> {
    const enrolment = await this.prisma.studentEnrolment.findUnique({ where: { id: enrolmentId } });
    if (!enrolment) throw new NotFoundException('Enrolment not found');
    await this.assertYearOpen(enrolment.academicYearId);
    const structures = await this.prisma.feeStructure.findMany({
      where: {
        academicYearId: enrolment.academicYearId,
        classId: enrolment.classId,
        isActive: true,
      },
      include: structureInclude,
    });
    if (!structures.length)
      throw new BadRequestException('No active fee plan exists for this class yet');
    return this.generate(structures, [enrolmentId], actor, context, { enrolmentId });
  }

  private async generate(
    structures: StructureRow[],
    enrolmentIds: string[],
    actor: RequestUser,
    context: RequestContext,
    about: Record<string, string>,
  ): Promise<GenerateDuesResult> {
    const data = enrolmentIds.flatMap((studentEnrolmentId) =>
      structures.flatMap((s) =>
        s.items.map((it) => ({
          studentEnrolmentId,
          academicYearId: s.academicYearId,
          feeHeadId: it.feeHeadId,
          feeStructureItemId: it.id,
          description: it.installmentLabel
            ? `${it.feeHead.name} — ${it.installmentLabel}`
            : it.feeHead.name,
          amountDue: it.amount,
          dueDate: it.dueDate,
          status: toPaise(it.amount) === 0 ? 'PAID' : 'OPEN',
        })),
      ),
    );
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studentFeeDue.createMany({ data, skipDuplicates: true });
      if (count) {
        await this.audit.log(
          {
            action: AUDIT_ACTIONS.FEE_DUES_GENERATED,
            entityType: 'fee_structure',
            entityId: structures.length === 1 ? structures[0].id : null,
            userId: actor.id,
            after: { ...about, students: enrolmentIds.length, duesCreated: count },
            context,
          },
          tx,
        );
      }
      return { students: enrolmentIds.length, duesCreated: count, skipped: data.length - count };
    });
  }
}
