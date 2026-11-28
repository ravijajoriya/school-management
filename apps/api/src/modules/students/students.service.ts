import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  STUDENT_DOCUMENT_TYPES,
  type ConvertEnquiryData,
  type CreateStudentData,
  type EnrolmentStatus,
  type Gender,
  type GuardianInput,
  type GuardianItem,
  type GuardianRelationship,
  type ListStudentsQuery,
  type Paginated,
  type StudentDetail,
  type StudentListItem,
  type StudentStatus,
  type UpdateGuardianInput,
  type UpdateStudentData,
} from '@school/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  PrivateFilesService,
  type UploadedFile,
} from '../../infrastructure/storage/private-files.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import {
  dayToDate,
  fullName,
  isoDay,
  isoDayOrNull,
  paginated,
  schoolDate,
} from '../../common/utils/content.js';
import { rupees } from '../../common/utils/money.js';
import { AuditService } from '../audit/audit.service.js';
import { toDocument } from '../staff/employees.service.js';
import { EnrolmentsService } from './enrolments.service.js';

type Tx = Prisma.TransactionClient;

const enrolmentSummaryInclude = {
  academicYear: { select: { id: true, name: true } },
  class: { select: { name: true } },
  section: { select: { name: true } },
} as const;

type EnrolmentRow = Prisma.StudentEnrolmentGetPayload<{ include: typeof enrolmentSummaryInclude }>;

const toEnrolmentSummary = (e: EnrolmentRow) => ({
  id: e.id,
  academicYear: e.academicYear,
  classId: e.classId,
  className: e.class.name,
  sectionId: e.sectionId,
  sectionName: e.section.name,
  rollNumber: e.rollNumber,
  status: e.status as EnrolmentStatus,
});

const toGuardian = (g: Prisma.StudentGuardianGetPayload<object>): GuardianItem => ({
  id: g.id,
  fullName: g.fullName,
  relationship: g.relationship as GuardianRelationship,
  phone: g.phone,
  email: g.email,
  occupation: g.occupation,
  isPrimary: g.isPrimary,
  addressSameAsStudent: g.addressSameAsStudent,
});

type StudentFields = Omit<CreateStudentData, 'guardians' | 'enrolment'>;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: PrivateFilesService,
    private readonly enrolments: EnrolmentsService,
  ) {}

  /**
   * What each student owes now, in paise: the unpaid balance of dues with a due date up to
   * `today` (or no due date), across all years. Same rule as the fee ledger (fees-core dueMath):
   * billed + fines − concessions/discounts/waivers − allocations of POSTED payments; a due that is
   * overpaid counts as zero. Only students who owe something are returned.
   */
  async pendingFeesByStudent(today: string, studentIds?: string[]): Promise<Map<string, number>> {
    if (studentIds && !studentIds.length) return new Map();
    const rows = await this.prisma.$queryRaw<{ student_id: string; pending: string }[]>`
      SELECT e.student_id, SUM(GREATEST(b.balance, 0))::text AS pending
      FROM (
        SELECT d.id, d.student_enrolment_id,
          d.amount_due
          + COALESCE((SELECT SUM(CASE WHEN a.adjustment_type = 'FINE' THEN a.amount ELSE -a.amount END)
                      FROM fee_adjustments a WHERE a.student_fee_due_id = d.id), 0)
          - COALESCE((SELECT SUM(pa.allocated_amount)
                      FROM payment_allocations pa
                      JOIN payments p ON p.id = pa.payment_id AND p.status = 'POSTED'
                      WHERE pa.student_fee_due_id = d.id), 0) AS balance
        FROM student_fee_dues d
        WHERE d.due_date IS NULL OR d.due_date <= ${dayToDate(today)}
      ) b
      JOIN student_enrolments e ON e.id = b.student_enrolment_id
      ${studentIds ? Prisma.sql`WHERE e.student_id = ANY(${studentIds}::uuid[])` : Prisma.empty}
      GROUP BY e.student_id
      HAVING SUM(GREATEST(b.balance, 0)) > 0`;
    return new Map(rows.map((r) => [r.student_id, Math.round(Number(r.pending) * 100)]));
  }

  /** Students whose first enrolment falls in the given calendar year and/or month. */
  private async admittedIn(year?: number, month?: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ student_id: string }[]>`
      SELECT student_id FROM student_enrolments
      GROUP BY student_id
      HAVING TRUE
        ${year ? Prisma.sql`AND EXTRACT(YEAR FROM MIN(enrolment_date)) = ${year}` : Prisma.empty}
        ${month ? Prisma.sql`AND EXTRACT(MONTH FROM MIN(enrolment_date)) = ${month}` : Prisma.empty}`;
    return rows.map((r) => r.student_id);
  }

  /** Calendar years in which students were admitted (newest first), for the filter. */
  async admissionYears(): Promise<number[]> {
    const rows = await this.prisma.$queryRaw<{ y: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM first_date)::int AS y
      FROM (SELECT MIN(enrolment_date) AS first_date FROM student_enrolments GROUP BY student_id) f
      ORDER BY y DESC`;
    return rows.map((r) => r.y);
  }

  /**
   * `withFees` (the caller can read fees) adds the pending amount and allows the pending filter.
   */
  async list(
    query: ListStudentsQuery,
    opts: { withFees?: boolean } = {},
  ): Promise<Paginated<StudentListItem>> {
    const yearId =
      query.academicYearId ??
      (
        await this.prisma.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true },
        })
      )?.id;
    const today = schoolDate();
    const tokens = query.search?.split(/\s+/).filter(Boolean) ?? [];
    const enrolmentFilter: Prisma.StudentEnrolmentWhereInput | undefined =
      yearId && (query.classId || query.sectionId)
        ? { academicYearId: yearId, classId: query.classId, sectionId: query.sectionId }
        : undefined;
    const idFilters: Prisma.StudentWhereInput[] = [];
    if (query.admissionYear || query.admissionMonth)
      idFilters.push({
        id: { in: await this.admittedIn(query.admissionYear, query.admissionMonth) },
      });
    const owing =
      opts.withFees && query.pendingFees ? await this.pendingFeesByStudent(today) : null;
    if (owing)
      idFilters.push({
        id: query.pendingFees === 'YES' ? { in: [...owing.keys()] } : { notIn: [...owing.keys()] },
      });
    const where: Prisma.StudentWhereInput = {
      status: query.status,
      enrolments:
        query.notEnrolled && yearId
          ? { none: { academicYearId: yearId } }
          : enrolmentFilter
            ? { some: enrolmentFilter }
            : undefined,
      AND: [
        ...idFilters,
        ...tokens.map((t) => ({
          OR: [
            { firstName: { contains: t, mode: 'insensitive' as const } },
            { middleName: { contains: t, mode: 'insensitive' as const } },
            { lastName: { contains: t, mode: 'insensitive' as const } },
            { admissionNumber: { contains: t, mode: 'insensitive' as const } },
            { guardians: { some: { phone: { contains: t.replace(/[\s-]/g, '') } } } },
          ],
        })),
      ],
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        include: {
          guardians: { where: { isPrimary: true }, take: 1 },
          enrolments: {
            where: { academicYearId: yearId ?? '00000000-0000-0000-0000-000000000000' },
            include: enrolmentSummaryInclude,
            take: 1,
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const ids = rows.map((s) => s.id);
    const [admitted, pending] = await Promise.all([
      this.prisma.studentEnrolment.groupBy({
        by: ['studentId'],
        where: { studentId: { in: ids } },
        _min: { enrolmentDate: true },
      }),
      opts.withFees ? (owing ?? this.pendingFeesByStudent(today, ids)) : null,
    ]);
    const admittedOn = new Map(admitted.map((a) => [a.studentId, a._min.enrolmentDate]));
    return paginated(
      rows.map((s) => ({
        id: s.id,
        admissionNumber: s.admissionNumber,
        firstName: s.firstName,
        middleName: s.middleName,
        lastName: s.lastName,
        fullName: fullName(s.firstName, s.middleName, s.lastName),
        dateOfBirth: isoDay(s.dateOfBirth),
        gender: s.gender as Gender | null,
        status: s.status as StudentStatus,
        primaryGuardian: s.guardians[0]
          ? {
              fullName: s.guardians[0].fullName,
              relationship: s.guardians[0].relationship,
              phone: s.guardians[0].phone,
            }
          : null,
        enrolment: s.enrolments[0] ? toEnrolmentSummary(s.enrolments[0]) : null,
        admissionDate: isoDayOrNull(admittedOn.get(s.id) ?? null),
        pendingFees: pending ? rupees(pending.get(s.id) ?? 0) : null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async get(id: string): Promise<StudentDetail> {
    const s = await this.prisma.student.findUnique({
      where: { id },
      include: {
        guardians: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        enrolments: {
          include: enrolmentSummaryInclude,
          orderBy: { academicYear: { startDate: 'desc' } },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          include: { uploader: { select: { id: true, fullName: true } } },
        },
        enquiry: { select: { id: true, referenceNumber: true } },
      },
    });
    if (!s) throw new NotFoundException('Student not found');
    const primary = s.guardians.find((g) => g.isPrimary);
    return {
      id: s.id,
      admissionNumber: s.admissionNumber,
      firstName: s.firstName,
      middleName: s.middleName,
      lastName: s.lastName,
      fullName: fullName(s.firstName, s.middleName, s.lastName),
      dateOfBirth: isoDay(s.dateOfBirth),
      gender: s.gender as Gender | null,
      bloodGroup: s.bloodGroup,
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
      status: s.status as StudentStatus,
      hasPhoto: !!s.photoStorageKey,
      createdAt: s.createdAt.toISOString(),
      primaryGuardian: primary
        ? { fullName: primary.fullName, relationship: primary.relationship, phone: primary.phone }
        : null,
      guardians: s.guardians.map(toGuardian),
      enrolments: s.enrolments.map((e) => ({
        ...toEnrolmentSummary(e),
        enrolmentDate: isoDay(e.enrolmentDate),
        previousEnrolmentId: e.previousEnrolmentId,
        exitDate: isoDayOrNull(e.exitDate),
        exitReason: e.exitReason,
        createdAt: e.createdAt.toISOString(),
      })),
      documents: s.documents.map(toDocument),
      enquiry: s.enquiry,
      admissionDate: s.enrolments.length
        ? s.enrolments.map((e) => isoDay(e.enrolmentDate)).sort()[0]
        : null,
    };
  }

  async create(input: CreateStudentData, actor: RequestUser, context: RequestContext) {
    const id = await this.prisma.$transaction(async (tx) => {
      const student = await this.createRecord(tx, input, input.guardians);
      if (input.enrolment) await this.enrolments.createInTx(tx, student.id, input.enrolment);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.STUDENT_CREATED,
          entityType: 'student',
          entityId: student.id,
          userId: actor.id,
          after: {
            admissionNumber: student.admissionNumber,
            name: fullName(student.firstName, student.lastName),
            enrolment: input.enrolment ?? null,
          },
          context,
        },
        tx,
      );
      return student.id;
    });
    return this.get(id);
  }

  async update(id: string, input: UpdateStudentData, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data: {
          admissionNumber: input.admissionNumber,
          firstName: input.firstName,
          middleName: input.middleName,
          lastName: input.lastName,
          dateOfBirth: input.dateOfBirth ? dayToDate(input.dateOfBirth) : undefined,
          gender: input.gender,
          bloodGroup: input.bloodGroup,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.STUDENT_UPDATED,
          entityType: 'student',
          entityId: id,
          userId: actor.id,
          before: {
            admissionNumber: before.admissionNumber,
            name: before.fullName,
            dateOfBirth: before.dateOfBirth,
          },
          after: input,
          context,
        },
        tx,
      );
    });
    return this.get(id);
  }

  // --- Guardians ------------------------------------------------------------------------

  async addGuardian(
    studentId: string,
    input: GuardianInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.get(studentId);
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.studentGuardian.count({ where: { studentId } });
      if (count >= 4) throw new BadRequestException('A student can have at most 4 guardians');
      const makePrimary = !!input.isPrimary || count === 0;
      if (makePrimary)
        await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
      const g = await tx.studentGuardian.create({
        data: this.guardianData(studentId, input, makePrimary),
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.GUARDIAN_ADDED,
          entityType: 'student',
          entityId: studentId,
          userId: actor.id,
          after: toGuardian(g),
          context,
        },
        tx,
      );
    });
    return this.get(studentId);
  }

  async updateGuardian(
    studentId: string,
    guardianId: string,
    input: UpdateGuardianInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.prisma.studentGuardian.findFirst({
      where: { id: guardianId, studentId },
    });
    if (!before) throw new NotFoundException('Guardian not found');
    if (input.isPrimary === false && before.isPrimary) {
      throw new BadRequestException('Make another guardian the primary contact instead');
    }
    await this.prisma.$transaction(async (tx) => {
      if (input.isPrimary && !before.isPrimary) {
        await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
      }
      const g = await tx.studentGuardian.update({
        where: { id: guardianId },
        data: {
          fullName: input.fullName,
          relationship: input.relationship,
          phone: input.phone as string | undefined,
          email: input.email as string | null | undefined,
          occupation: input.occupation as string | null | undefined,
          isPrimary: input.isPrimary,
          addressSameAsStudent: input.addressSameAsStudent,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.GUARDIAN_UPDATED,
          entityType: 'student',
          entityId: studentId,
          userId: actor.id,
          before: toGuardian(before),
          after: toGuardian(g),
          context,
        },
        tx,
      );
    });
    return this.get(studentId);
  }

  async removeGuardian(
    studentId: string,
    guardianId: string,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const guardian = await this.prisma.studentGuardian.findFirst({
      where: { id: guardianId, studentId },
    });
    if (!guardian) throw new NotFoundException('Guardian not found');
    const others = await this.prisma.studentGuardian.findMany({
      where: { studentId, id: { not: guardianId } },
      orderBy: { createdAt: 'asc' },
    });
    if (!others.length) throw new BadRequestException('A student must keep at least one guardian');
    await this.prisma.$transaction(async (tx) => {
      await tx.studentGuardian.delete({ where: { id: guardianId } });
      if (guardian.isPrimary)
        await tx.studentGuardian.update({ where: { id: others[0].id }, data: { isPrimary: true } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.GUARDIAN_REMOVED,
          entityType: 'student',
          entityId: studentId,
          userId: actor.id,
          before: toGuardian(guardian),
          context,
        },
        tx,
      );
    });
    return this.get(studentId);
  }

  // --- Photo & documents ---------------------------------------------------------------

  async setPhoto(
    id: string,
    file: UploadedFile | undefined,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      select: { photoStorageKey: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    const stored = await this.files.store(file, 'photo', `students/${id}`);
    await this.prisma.student.update({
      where: { id },
      data: { photoStorageKey: stored.storageKey },
    });
    if (student.photoStorageKey) await this.files.remove(student.photoStorageKey);
    await this.audit.logSafe({
      action: AUDIT_ACTIONS.STUDENT_UPDATED,
      entityType: 'student',
      entityId: id,
      userId: actor.id,
      after: { photo: 'updated' },
      context,
    });
  }

  async openPhoto(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      select: { photoStorageKey: true },
    });
    if (!student?.photoStorageKey) throw new NotFoundException('No photo');
    const file = await this.files.open(student.photoStorageKey);
    const ext = student.photoStorageKey.split('.').pop();
    return {
      ...file,
      mimeType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
    };
  }

  async uploadDocument(
    id: string,
    documentType: string,
    file: UploadedFile | undefined,
    actor: RequestUser,
    context: RequestContext,
  ) {
    if (!(STUDENT_DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      throw new BadRequestException(['documentType: Choose a document type']);
    }
    await this.get(id);
    const stored = await this.files.store(file, 'document', `students/${id}`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const doc = await tx.studentDocument.create({
          data: { studentId: id, documentType, uploadedBy: actor.id, ...stored },
          include: { uploader: { select: { id: true, fullName: true } } },
        });
        await this.audit.log(
          {
            action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
            entityType: 'student',
            entityId: id,
            userId: actor.id,
            after: { documentId: doc.id, documentType, fileName: doc.fileName },
            context,
          },
          tx,
        );
        return toDocument(doc);
      });
    } catch (error) {
      await this.files.remove(stored.storageKey);
      throw error;
    }
  }

  async openDocument(id: string, documentId: string, actor: RequestUser, context: RequestContext) {
    const doc = await this.prisma.studentDocument.findFirst({
      where: { id: documentId, studentId: id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const file = await this.files.open(doc.storageKey);
    await this.audit.logSafe({
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOADED,
      entityType: 'student',
      entityId: id,
      userId: actor.id,
      after: { documentId, documentType: doc.documentType },
      context,
    });
    return { ...file, mimeType: doc.mimeType, fileName: doc.fileName };
  }

  async deleteDocument(
    id: string,
    documentId: string,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const doc = await this.prisma.studentDocument.findFirst({
      where: { id: documentId, studentId: id },
    });
    if (!doc) throw new NotFoundException('Document not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.studentDocument.delete({ where: { id: documentId } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.DOCUMENT_DELETED,
          entityType: 'student',
          entityId: id,
          userId: actor.id,
          before: { documentId, documentType: doc.documentType, fileName: doc.fileName },
          context,
        },
        tx,
      );
    });
    await this.files.remove(doc.storageKey);
  }

  // --- Admission enquiry → student -----------------------------------------------------

  /** One transaction: student + primary guardian + enrolment, enquiry marked converted. */
  async convertEnquiry(
    enquiryId: string,
    input: ConvertEnquiryData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const enquiry = await this.prisma.admissionEnquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (enquiry.convertedStudentId)
      throw new ConflictException('This enquiry has already been converted to a student');
    const studentId = await this.prisma.$transaction(async (tx) => {
      const student = await this.createRecord(tx, input, [{ ...input.guardian, isPrimary: true }]);
      const enrolment = await this.enrolments.createInTx(tx, student.id, input.enrolment);
      // Conditional update guards against two staff converting the same enquiry at once.
      const { count } = await tx.admissionEnquiry.updateMany({
        where: { id: enquiryId, convertedStudentId: null },
        data: { convertedStudentId: student.id, status: 'ADMISSION_CONFIRMED' },
      });
      if (count !== 1)
        throw new ConflictException('This enquiry has already been converted to a student');
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ENQUIRY_CONVERTED,
          entityType: 'admission_enquiry',
          entityId: enquiryId,
          userId: actor.id,
          before: { status: enquiry.status },
          after: {
            status: 'ADMISSION_CONFIRMED',
            studentId: student.id,
            admissionNumber: student.admissionNumber,
            enrolmentId: enrolment.id,
          },
          context,
        },
        tx,
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.STUDENT_CREATED,
          entityType: 'student',
          entityId: student.id,
          userId: actor.id,
          after: { admissionNumber: student.admissionNumber, fromEnquiry: enquiry.referenceNumber },
          context,
        },
        tx,
      );
      return student.id;
    });
    return this.get(studentId);
  }

  // --- helpers ---------------------------------------------------------------------------

  private async createRecord(
    tx: Tx,
    input: StudentFields,
    guardians: (GuardianInput & { isPrimary?: boolean })[],
  ) {
    let admissionNumber = input.admissionNumber;
    if (!admissionNumber) {
      const [{ n }] = await tx.$queryRaw<
        { n: bigint }[]
      >`SELECT nextval('student_admission_number_seq') AS n`;
      admissionNumber = `ADM-${schoolDate().slice(0, 4)}-${String(n).padStart(5, '0')}`;
    }
    const student = await tx.student.create({
      data: {
        admissionNumber,
        firstName: input.firstName,
        middleName: input.middleName ?? null,
        lastName: input.lastName ?? null,
        dateOfBirth: dayToDate(input.dateOfBirth),
        gender: input.gender ?? null,
        bloodGroup: input.bloodGroup ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
      },
    });
    await tx.studentGuardian.createMany({
      data: guardians.map((g) => this.guardianData(student.id, g, !!g.isPrimary)),
    });
    return student;
  }

  private guardianData(studentId: string, g: GuardianInput, isPrimary: boolean) {
    return {
      studentId,
      fullName: g.fullName,
      relationship: g.relationship,
      phone: g.phone as string,
      email: (g.email as string | undefined) ?? null,
      occupation: (g.occupation as string | undefined) ?? null,
      isPrimary,
      addressSameAsStudent: g.addressSameAsStudent ?? true,
    };
  }
}
