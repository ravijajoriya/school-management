import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  idCardLayoutSchema,
  type CreateIdCardBatchInput,
  type IdCardAudience,
  type IdCardBatchItem,
  type IdCardBatchView,
  type IdCardPerson,
  type IdCardTemplateItem,
  type SaveIdCardTemplateInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { fullName } from '../../common/utils/content.js';
import { schoolDetails } from '../../common/utils/school.js';
import { AuditService } from '../audit/audit.service.js';

type TemplateRow = Prisma.IdCardTemplateGetPayload<object>;
const toTemplate = (t: TemplateRow): IdCardTemplateItem => ({
  id: t.id,
  name: t.name,
  audience: t.audience as IdCardAudience,
  layout: idCardLayoutSchema.parse(t.layout ?? {}),
  isActive: t.isActive,
});

const batchInclude = {
  template: true,
  academicYear: { select: { id: true, name: true } },
  creator: { select: { fullName: true } },
} satisfies Prisma.IdCardBatchInclude;
type BatchRow = Prisma.IdCardBatchGetPayload<{ include: typeof batchInclude }>;

/**
 * ID cards: a template (colours and which fields show) plus a batch (which people). A batch
 * records who printed what; cards always render from the current records, so a reprint picks up
 * a corrected phone number or new photo.
 */
@Injectable()
export class IdCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async templates(): Promise<IdCardTemplateItem[]> {
    const rows = await this.prisma.idCardTemplate.findMany({
      orderBy: [{ audience: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toTemplate);
  }

  async saveTemplate(
    id: string | null,
    input: Required<SaveIdCardTemplateInput>,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.idCardTemplate.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('ID card template not found');
      const data = {
        name: input.name,
        audience: input.audience,
        layout: input.layout,
        isActive: input.isActive,
      };
      const saved = id
        ? await tx.idCardTemplate.update({ where: { id }, data })
        : await tx.idCardTemplate.create({ data });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ID_CARD_TEMPLATE_SAVED,
          entityType: 'id_card_template',
          entityId: saved.id,
          userId: actor.id,
          before,
          after: saved,
          context,
        },
        tx,
      );
      return saved;
    });
    return toTemplate(row);
  }

  private label(b: BatchRow, sectionNames: string[]) {
    if (b.template.audience === 'STAFF') return 'All active staff';
    return sectionNames.length ? sectionNames.join(', ') : 'Students';
  }

  private async sectionNames(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.section.findMany({
      where: { id: { in: ids } },
      include: { class: { select: { name: true, levelOrder: true } } },
      orderBy: [{ class: { levelOrder: 'asc' } }, { name: 'asc' }],
    });
    return rows.map((s) => `${s.class.name} – ${s.name}`);
  }

  private toBatch(b: BatchRow, sectionNames: string[]): IdCardBatchItem {
    return {
      id: b.id,
      template: toTemplate(b.template),
      academicYear: b.academicYear,
      createdBy: b.creator.fullName,
      createdAt: b.createdAt.toISOString(),
      cardCount: b.cardCount,
      label: this.label(b, sectionNames),
    };
  }

  async batches(): Promise<IdCardBatchItem[]> {
    const rows = await this.prisma.idCardBatch.findMany({
      include: batchInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Promise.all(
      rows.map(async (b) => this.toBatch(b, await this.sectionNames(sectionIdsOf(b.filters)))),
    );
  }

  private async people(audience: string, sectionIds: string[]): Promise<IdCardPerson[]> {
    if (audience === 'STAFF') {
      const staff = await this.prisma.employee.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      return staff.map((e) => ({
        id: e.id,
        name: fullName(e.firstName, e.lastName),
        code: e.employeeCode,
        line1: e.designation,
        line2: e.department,
        bloodGroup: null,
        phone: e.phone,
        address: null,
        photoPath: null,
      }));
    }
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: { sectionId: { in: sectionIds }, status: 'ACTIVE' },
      include: {
        class: { select: { name: true, levelOrder: true } },
        section: { select: { name: true } },
        student: {
          include: {
            guardians: { where: { isPrimary: true }, select: { fullName: true, phone: true } },
          },
        },
      },
    });
    enrolments.sort(
      (a, b) =>
        a.class.levelOrder - b.class.levelOrder ||
        a.section.name.localeCompare(b.section.name) ||
        (a.rollNumber ?? '').localeCompare(b.rollNumber ?? '', undefined, { numeric: true }) ||
        a.student.firstName.localeCompare(b.student.firstName),
    );
    return enrolments.map((e) => {
      const s = e.student;
      const g = s.guardians[0];
      return {
        id: s.id,
        name: fullName(s.firstName, s.middleName, s.lastName),
        code: s.admissionNumber,
        line1: `${e.class.name} – ${e.section.name}`,
        line2: e.rollNumber ? `Roll no. ${e.rollNumber}` : null,
        bloodGroup: s.bloodGroup,
        phone: g?.phone ?? null,
        address: [s.addressLine1, s.addressLine2, s.city].filter(Boolean).join(', ') || null,
        photoPath: s.photoStorageKey ? `/id-cards/photos/${s.id}` : null,
      };
    });
  }

  async create(
    input: Required<CreateIdCardBatchInput>,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const template = await this.prisma.idCardTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!template?.isActive)
      throw new BadRequestException(['templateId: Choose an active ID card template']);
    let academicYearId: string | null = null;
    let sectionIds: string[] = [];
    if (template.audience === 'STUDENT') {
      if (!input.sectionIds.length)
        throw new BadRequestException(['sectionIds: Choose at least one section']);
      const sections = await this.prisma.section.findMany({
        where: { id: { in: input.sectionIds } },
        select: { id: true, academicYearId: true },
      });
      if (sections.length !== new Set(input.sectionIds).size)
        throw new BadRequestException(['sectionIds: Section not found']);
      const years = new Set(sections.map((s) => s.academicYearId));
      if (years.size > 1)
        throw new BadRequestException(['sectionIds: Choose sections from one academic year']);
      academicYearId = sections[0].academicYearId;
      sectionIds = sections.map((s) => s.id);
    }
    const people = await this.people(template.audience, sectionIds);
    if (!people.length)
      throw new BadRequestException(
        'Nobody to print: the chosen sections have no current students',
      );
    const row = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.idCardBatch.create({
        data: {
          templateId: template.id,
          academicYearId,
          filters: { sectionIds },
          cardCount: people.length,
          createdBy: actor.id,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ID_CARDS_GENERATED,
          entityType: 'id_card_batch',
          entityId: batch.id,
          userId: actor.id,
          after: { template: template.name, sectionIds, cards: people.length },
          context,
        },
        tx,
      );
      return batch;
    });
    return this.view(row.id);
  }

  async view(id: string): Promise<IdCardBatchView> {
    const b = await this.prisma.idCardBatch.findUnique({ where: { id }, include: batchInclude });
    if (!b) throw new NotFoundException('ID card batch not found');
    const sectionIds = sectionIdsOf(b.filters);
    const [names, people, school] = await Promise.all([
      this.sectionNames(sectionIds),
      this.people(b.template.audience, sectionIds),
      schoolDetails(this.prisma),
    ]);
    return {
      ...this.toBatch(b, names),
      school: { name: school.name, address: school.address, phone: school.phone },
      people,
    };
  }
}

function sectionIdsOf(filters: Prisma.JsonValue): string[] {
  const ids = (filters as { sectionIds?: unknown } | null)?.sectionIds;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
}
