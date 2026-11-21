import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  formatRupees,
  type CertificateIssueItem,
  type CertificateSnapshot,
  type CertificateTemplateItem,
  type IssueCertificateInput,
  type Paginated,
  type SaveCertificateTemplateInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDay, paginated, schoolDate } from '../../common/utils/content.js';
import { rupees } from '../../common/utils/money.js';
import { longDate, schoolDetails } from '../../common/utils/school.js';
import { AuditService } from '../audit/audit.service.js';
import { dueInclude, dueMath } from '../fees/fees-core.js';
import {
  placeholdersIn,
  pronouns,
  renderCertificate,
  unknownPlaceholders,
} from './certificate-render.js';

const LEFT_STATUSES = ['TRANSFERRED', 'WITHDRAWN', 'COMPLETED'];

const issueInclude = {
  template: { select: { id: true, code: true, name: true } },
  student: {
    select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
  },
  issuer: { select: { fullName: true } },
} satisfies Prisma.CertificateIssueInclude;
type IssueRow = Prisma.CertificateIssueGetPayload<{ include: typeof issueInclude }>;

function toIssue(r: IssueRow): CertificateIssueItem {
  return {
    id: r.id,
    certificateNumber: r.certificateNumber,
    template: r.template,
    student: {
      id: r.student.id,
      fullName: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
      admissionNumber: r.student.admissionNumber,
    },
    issuedOn: isoDay(r.issuedOn),
    issuedBy: r.issuer.fullName,
    snapshot: r.snapshot as unknown as CertificateSnapshot,
  };
}

/**
 * Certificates (ADR 0008). Templates are editable plain text; an issued certificate freezes its
 * final wording in `snapshot`, gets a number per template code and year (TC/2026/0001), and can
 * never be changed or deleted (database trigger), only reprinted.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Templates -----------------------------------------------------------------------------

  async templates(): Promise<CertificateTemplateItem[]> {
    const rows = await this.prisma.certificateTemplate.findMany({
      include: { editor: { select: { fullName: true } }, _count: { select: { issues: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      templateHtml: t.templateHtml,
      isActive: t.isActive,
      updatedBy: t.editor.fullName,
      updatedAt: t.updatedAt.toISOString(),
      issued: t._count.issues,
    }));
  }

  async saveTemplate(
    id: string | null,
    input: Required<SaveCertificateTemplateInput>,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const unknown = unknownPlaceholders(input.templateHtml);
    if (unknown.length)
      throw new BadRequestException([
        `templateHtml: Unknown placeholder ${unknown.map((u) => `{{${u}}}`).join(', ')}`,
      ]);
    const row = await this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.certificateTemplate.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('Template not found');
      if (
        before &&
        before.code !== input.code &&
        (await tx.certificateIssue.count({ where: { templateId: before.id } }))
      )
        throw new ConflictException(
          'Certificates have been issued from this template, so its code cannot change',
        );
      const data = { ...input, updatedBy: actor.id };
      const saved = id
        ? await tx.certificateTemplate.update({ where: { id }, data })
        : await tx.certificateTemplate.create({ data });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.CERTIFICATE_TEMPLATE_SAVED,
          entityType: 'certificate_template',
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
    return (await this.templates()).find((t) => t.id === row.id)!;
  }

  // --- Issue ---------------------------------------------------------------------------------

  async list(q: {
    studentId?: string;
    templateId?: string;
    page: number;
    pageSize: number;
  }): Promise<Paginated<CertificateIssueItem>> {
    const where: Prisma.CertificateIssueWhereInput = {
      studentId: q.studentId,
      templateId: q.templateId,
    };
    const [rows, total] = await Promise.all([
      this.prisma.certificateIssue.findMany({
        where,
        include: issueInclude,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.certificateIssue.count({ where }),
    ]);
    return paginated(rows.map(toIssue), total, q.page, q.pageSize);
  }

  async get(id: string) {
    const row = await this.prisma.certificateIssue.findUnique({
      where: { id },
      include: issueInclude,
    });
    if (!row) throw new NotFoundException('Certificate not found');
    return toIssue(row);
  }

  private async outstandingFees(studentId: string) {
    const dues = await this.prisma.studentFeeDue.findMany({
      where: { enrolment: { studentId } },
      include: dueInclude,
    });
    return dues.reduce((n, d) => n + Math.max(dueMath(d).balance, 0), 0);
  }

  async issue(input: IssueCertificateInput, actor: RequestUser, context: RequestContext) {
    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!template?.isActive)
      throw new BadRequestException(['templateId: Choose an active certificate template']);
    const student = await this.prisma.student.findUnique({
      where: { id: input.studentId },
      include: {
        guardians: true,
        enrolments: {
          include: {
            class: { select: { name: true } },
            section: { select: { name: true } },
            academicYear: true,
          },
          orderBy: { academicYear: { startDate: 'desc' } },
        },
      },
    });
    if (!student) throw new BadRequestException(['studentId: Student not found']);
    if (!student.enrolments.length) throw new BadRequestException('The student has no enrolment');
    const enrolment = input.enrolmentId
      ? student.enrolments.find((e) => e.id === input.enrolmentId)
      : student.enrolments[0];
    if (!enrolment)
      throw new BadRequestException(['enrolmentId: This enrolment belongs to another student']);
    const latest = student.enrolments[0];
    const first = student.enrolments[student.enrolments.length - 1];

    const used = placeholdersIn(template.templateHtml);
    if (used.includes('purpose') && !input.purpose)
      throw new BadRequestException(['purpose: Enter the purpose of the certificate']);
    if (template.code === 'TC') {
      if (!LEFT_STATUSES.includes(latest.status))
        throw new ConflictException(
          'Record the transfer or withdrawal on the student’s page first; a TC is issued when the student leaves',
        );
      const owed = await this.outstandingFees(student.id);
      if (owed > 0)
        throw new ConflictException(
          `${formatRupees(rupees(owed))} in fees is still due. Clear the dues before issuing a TC.`,
        );
    }

    const issuedOn = input.issuedOn ?? schoolDate();
    const school = await schoolDetails(this.prisma);
    const p = pronouns(student.gender);
    const guardian = (rel: string) =>
      student.guardians.find((g) => g.relationship === rel)?.fullName;
    const primary = student.guardians.find((g) => g.isPrimary)?.fullName;
    const name = fullName(student.firstName, student.middleName, student.lastName);
    const prefix = `${template.code}/${issuedOn.slice(0, 4)}/`;

    const row = await this.prisma.$transaction(async (tx) => {
      // Serialise numbering per prefix so two clerks never get the same number.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`;
      const last = await tx.certificateIssue.findFirst({
        where: { certificateNumber: { startsWith: prefix } },
        orderBy: { certificateNumber: 'desc' },
        select: { certificateNumber: true },
      });
      const next = last ? Number(last.certificateNumber.slice(prefix.length)) + 1 : 1;
      const certificateNumber = `${prefix}${String(next).padStart(4, '0')}`;
      const earlier = await tx.certificateIssue.count({
        where: { templateId: template.id, studentId: student.id },
      });

      const paragraphs = renderCertificate(template.templateHtml, {
        student_name: name,
        admission_number: student.admissionNumber,
        date_of_birth: longDate(student.dateOfBirth),
        gender_pronoun: p.subject,
        gender_possessive: p.possessive,
        child_relation: p.child,
        father_name: guardian('FATHER') ?? primary,
        mother_name: guardian('MOTHER'),
        guardian_name: primary,
        class_name: enrolment.class.name,
        section_name: enrolment.section.name,
        academic_year: enrolment.academicYear.name,
        admission_date: longDate(first.enrolmentDate),
        leaving_date: latest.exitDate ? longDate(latest.exitDate) : null,
        leaving_reason: latest.exitReason,
        last_class: latest.class.name,
        conduct: input.conduct ?? 'good',
        purpose: input.purpose,
        school_name: school.name,
        school_address: school.address,
        issue_date: longDate(issuedOn),
        certificate_number: certificateNumber,
      });
      const snapshot: CertificateSnapshot = {
        school,
        title: earlier ? `${template.name} (Duplicate)` : template.name,
        certificateNumber,
        issuedOn,
        issuedBy: actor.fullName,
        paragraphs,
        student: { name, admissionNumber: student.admissionNumber },
      };
      const created = await tx.certificateIssue.create({
        data: {
          certificateNumber,
          templateId: template.id,
          studentId: student.id,
          studentEnrolmentId: enrolment.id,
          issuedOn: dayToDate(issuedOn),
          issuedBy: actor.id,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
        include: issueInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.CERTIFICATE_ISSUED,
          entityType: 'certificate_issue',
          entityId: created.id,
          userId: actor.id,
          after: {
            certificateNumber,
            template: template.code,
            studentId: student.id,
            duplicate: earlier > 0,
          },
          context,
        },
        tx,
      );
      return created;
    });
    return toIssue(row);
  }
}
