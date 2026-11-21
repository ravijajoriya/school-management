import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type EnrolmentExitInput,
  type PromotionInput,
  type PromotionResult,
  type UpdateEnrolmentInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDay, schoolDate } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';

type Tx = Prisma.TransactionClient;

export interface EnrolmentData {
  academicYearId: string;
  sectionId: string;
  rollNumber?: string;
  enrolmentDate: string;
}

@Injectable()
export class EnrolmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Creates an enrolment inside an existing transaction (used by registration and conversion). */
  async createInTx(tx: Tx, studentId: string, input: EnrolmentData) {
    const year = await tx.academicYear.findUnique({ where: { id: input.academicYearId } });
    if (!year) throw new BadRequestException(['academicYearId: Academic year not found']);
    if (year.status === 'CLOSED')
      throw new BadRequestException(`Academic year ${year.name} is closed`);
    if (input.enrolmentDate > isoDay(year.endDate)) {
      throw new BadRequestException(['enrolmentDate: Date is after the end of the academic year']);
    }
    const section = await this.lockSection(tx, input.sectionId);
    if (section.academicYearId !== input.academicYearId || !section.isActive) {
      throw new BadRequestException(['sectionId: Choose an active section of this academic year']);
    }
    await this.assertCapacity(tx, section, 1);
    const enrolment = await tx.studentEnrolment.create({
      data: {
        studentId,
        academicYearId: input.academicYearId,
        classId: section.classId,
        sectionId: section.id,
        rollNumber: input.rollNumber || null,
        enrolmentDate: dayToDate(input.enrolmentDate),
      },
    });
    // Re-admission of a student who had left.
    await tx.student.updateMany({
      where: { id: studentId, status: { not: 'ACTIVE' } },
      data: { status: 'ACTIVE' },
    });
    return enrolment;
  }

  async enrol(
    studentId: string,
    input: EnrolmentData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    return this.prisma.$transaction(async (tx) => {
      const enrolment = await this.createInTx(tx, studentId, input);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ENROLMENT_CREATED,
          entityType: 'student',
          entityId: studentId,
          userId: actor.id,
          after: {
            enrolmentId: enrolment.id,
            academicYearId: input.academicYearId,
            sectionId: input.sectionId,
            rollNumber: enrolment.rollNumber,
          },
          context,
        },
        tx,
      );
      return enrolment;
    });
  }

  /** Section change (same year) or roll number change for an ACTIVE enrolment. */
  async update(
    enrolmentId: string,
    input: UpdateEnrolmentInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.getActive(enrolmentId);
    return this.prisma.$transaction(async (tx) => {
      let classId = before.classId;
      if (input.sectionId && input.sectionId !== before.sectionId) {
        const section = await this.lockSection(tx, input.sectionId);
        if (section.academicYearId !== before.academicYearId || !section.isActive) {
          throw new BadRequestException([
            'sectionId: Choose an active section of the same academic year',
          ]);
        }
        await this.assertCapacity(tx, section, 1);
        classId = section.classId;
      }
      const moving = !!input.sectionId && input.sectionId !== before.sectionId;
      const updated = await tx.studentEnrolment.update({
        where: { id: enrolmentId },
        data: {
          sectionId: input.sectionId,
          classId,
          // Moving section clears the old roll number unless a new one is given.
          rollNumber: input.rollNumber !== undefined ? input.rollNumber : moving ? null : undefined,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ENROLMENT_UPDATED,
          entityType: 'student',
          entityId: before.studentId,
          userId: actor.id,
          before: { enrolmentId, sectionId: before.sectionId, rollNumber: before.rollNumber },
          after: { enrolmentId, sectionId: updated.sectionId, rollNumber: updated.rollNumber },
          context,
        },
        tx,
      );
      return updated;
    });
  }

  /** Transfer out (TC) or withdrawal. The enrolment is kept as history; the student stops being active. */
  async exit(
    enrolmentId: string,
    kind: 'TRANSFERRED' | 'WITHDRAWN',
    input: EnrolmentExitInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const enrolment = await this.getActive(enrolmentId);
    if (input.exitDate < isoDay(enrolment.enrolmentDate)) {
      throw new BadRequestException(['exitDate: Date is before the enrolment date']);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.studentEnrolment.update({
        where: { id: enrolmentId },
        data: { status: kind, exitDate: dayToDate(input.exitDate), exitReason: input.reason },
      });
      const stillActive = await tx.studentEnrolment.count({
        where: { studentId: enrolment.studentId, status: 'ACTIVE' },
      });
      if (!stillActive) {
        await tx.student.update({
          where: { id: enrolment.studentId },
          data: { status: kind === 'WITHDRAWN' ? 'WITHDRAWN' : 'INACTIVE' },
        });
      }
      await this.audit.log(
        {
          action:
            kind === 'TRANSFERRED'
              ? AUDIT_ACTIONS.STUDENT_TRANSFERRED
              : AUDIT_ACTIONS.STUDENT_WITHDRAWN,
          entityType: 'student',
          entityId: enrolment.studentId,
          userId: actor.id,
          before: { enrolmentId, status: 'ACTIVE' },
          after: { enrolmentId, status: kind },
          reason: input.reason,
          context,
        },
        tx,
      );
      return { status: kind };
    });
  }

  /**
   * Moves students into the next academic year. Each source enrolment is closed as PROMOTED,
   * RETAINED or COMPLETED; promoted/retained students get a new ACTIVE enrolment linked to it.
   */
  async promote(
    input: PromotionInput,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<PromotionResult> {
    const target = await this.prisma.academicYear.findUnique({
      where: { id: input.toAcademicYearId },
    });
    if (!target) throw new BadRequestException(['toAcademicYearId: Academic year not found']);
    if (target.status === 'CLOSED')
      throw new BadRequestException(`Academic year ${target.name} is closed`);

    const ids = input.entries.map((e) => e.enrolmentId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('A student appears more than once');
    const sources = await this.prisma.studentEnrolment.findMany({
      where: { id: { in: ids } },
      include: {
        academicYear: true,
        class: { select: { levelOrder: true } },
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const byId = new Map(sources.map((s) => [s.id, s]));
    const targetSectionIds = [
      ...new Set(input.entries.map((e) => e.toSectionId).filter(Boolean) as string[]),
    ];
    const targetSections = await this.prisma.section.findMany({
      where: { id: { in: targetSectionIds } },
      include: { class: { select: { levelOrder: true, name: true } } },
    });
    const sectionById = new Map(targetSections.map((s) => [s.id, s]));

    const problems: string[] = [];
    for (const entry of input.entries) {
      const src = byId.get(entry.enrolmentId);
      if (!src) {
        problems.push('An enrolment was not found');
        continue;
      }
      const name = fullName(src.student.firstName, src.student.lastName);
      if (src.status !== 'ACTIVE') problems.push(`${name}: already ${src.status.toLowerCase()}`);
      if (src.academicYear.startDate >= target.startDate)
        problems.push(`${name}: target year must come after ${src.academicYear.name}`);
      if (entry.action === 'COMPLETE') continue;
      const sec = sectionById.get(entry.toSectionId!);
      if (!sec || sec.academicYearId !== target.id || !sec.isActive) {
        problems.push(`${name}: choose an active section in ${target.name}`);
        continue;
      }
      if (entry.action === 'PROMOTE' && sec.class.levelOrder <= src.class.levelOrder) {
        problems.push(`${name}: promotion must be to a higher class`);
      }
      if (entry.action === 'RETAIN' && sec.classId !== src.classId) {
        problems.push(`${name}: a retained student stays in the same class`);
      }
    }
    const alreadyThere = await this.prisma.studentEnrolment.findMany({
      where: { academicYearId: target.id, studentId: { in: sources.map((s) => s.studentId) } },
      select: { student: { select: { firstName: true, lastName: true } } },
    });
    alreadyThere.forEach((a) =>
      problems.push(
        `${fullName(a.student.firstName, a.student.lastName)}: already enrolled in ${target.name}`,
      ),
    );
    if (problems.length) throw new BadRequestException(problems);

    const result: PromotionResult = { promoted: 0, retained: 0, completed: 0 };
    await this.prisma.$transaction(async (tx) => {
      // Capacity check per target section, counting everyone being moved in.
      const incoming = new Map<string, number>();
      input.entries.forEach(
        (e) => e.toSectionId && incoming.set(e.toSectionId, (incoming.get(e.toSectionId) ?? 0) + 1),
      );
      for (const [sectionId, count] of incoming) {
        await this.assertCapacity(tx, await this.lockSection(tx, sectionId), count);
      }
      for (const entry of input.entries) {
        const src = byId.get(entry.enrolmentId)!;
        if (entry.action === 'COMPLETE') {
          const exit =
            isoDay(src.academicYear.endDate) < schoolDate()
              ? isoDay(src.academicYear.endDate)
              : schoolDate();
          await tx.studentEnrolment.update({
            where: { id: src.id },
            data: {
              status: 'COMPLETED',
              exitDate: dayToDate(exit),
              exitReason: 'Completed the final class',
            },
          });
          await tx.student.update({ where: { id: src.studentId }, data: { status: 'INACTIVE' } });
          result.completed++;
          continue;
        }
        const sec = sectionById.get(entry.toSectionId!)!;
        await tx.studentEnrolment.update({
          where: { id: src.id },
          data: { status: entry.action === 'PROMOTE' ? 'PROMOTED' : 'RETAINED' },
        });
        await tx.studentEnrolment.create({
          data: {
            studentId: src.studentId,
            academicYearId: target.id,
            classId: sec.classId,
            sectionId: sec.id,
            enrolmentDate: target.startDate,
            previousEnrolmentId: src.id,
          },
        });
        if (entry.action === 'PROMOTE') result.promoted++;
        else result.retained++;
      }
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.STUDENTS_PROMOTED,
          entityType: 'academic_year',
          entityId: target.id,
          userId: actor.id,
          after: { ...result, entries: input.entries },
          context,
        },
        tx,
      );
    });
    return result;
  }

  /** Numbers the section's active students 1..n by name or admission number. */
  async assignRollNumbers(
    sectionId: string,
    order: 'NAME' | 'ADMISSION_NUMBER',
    actor: RequestUser,
    context: RequestContext,
  ) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { academicYear: true },
    });
    if (!section) throw new NotFoundException('Section not found');
    if (section.academicYear.status === 'CLOSED')
      throw new BadRequestException('This academic year is closed');
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: { sectionId, status: 'ACTIVE' },
      include: {
        student: {
          select: { firstName: true, middleName: true, lastName: true, admissionNumber: true },
        },
      },
    });
    const sorted = enrolments.sort((a, b) =>
      order === 'ADMISSION_NUMBER'
        ? a.student.admissionNumber.localeCompare(b.student.admissionNumber, undefined, {
            numeric: true,
          })
        : fullName(a.student.firstName, a.student.middleName, a.student.lastName).localeCompare(
            fullName(b.student.firstName, b.student.middleName, b.student.lastName),
          ),
    );
    await this.prisma.$transaction(async (tx) => {
      // Clear first so the (section, roll number) unique index never collides mid-update.
      await tx.studentEnrolment.updateMany({ where: { sectionId }, data: { rollNumber: null } });
      for (const [i, e] of sorted.entries()) {
        await tx.studentEnrolment.update({
          where: { id: e.id },
          data: { rollNumber: String(i + 1) },
        });
      }
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.ROLL_NUMBERS_ASSIGNED,
          entityType: 'section',
          entityId: sectionId,
          userId: actor.id,
          after: { order, count: sorted.length },
          context,
        },
        tx,
      );
    });
    return { count: sorted.length };
  }

  private async getActive(enrolmentId: string) {
    const enrolment = await this.prisma.studentEnrolment.findUnique({
      where: { id: enrolmentId },
      include: { academicYear: { select: { status: true, name: true } } },
    });
    if (!enrolment) throw new NotFoundException('Enrolment not found');
    if (enrolment.status !== 'ACTIVE')
      throw new BadRequestException('Only a current (active) enrolment can be changed');
    if (enrolment.academicYear.status === 'CLOSED')
      throw new BadRequestException(`Academic year ${enrolment.academicYear.name} is closed`);
    return enrolment;
  }

  /** Row-locks the section so concurrent enrolments can't overfill it. */
  private async lockSection(tx: Tx, sectionId: string) {
    await tx.$executeRaw`SELECT id FROM sections WHERE id = ${sectionId}::uuid FOR UPDATE`;
    const section = await tx.section.findUnique({ where: { id: sectionId } });
    if (!section) throw new BadRequestException(['sectionId: Section not found']);
    return section;
  }

  private async assertCapacity(
    tx: Tx,
    section: { id: string; name: string; capacity: number | null },
    adding: number,
  ) {
    if (!section.capacity) return;
    const current = await tx.studentEnrolment.count({
      where: { sectionId: section.id, status: 'ACTIVE' },
    });
    if (current + adding > section.capacity) {
      throw new ConflictException(
        `Section ${section.name} is full (${current}/${section.capacity})`,
      );
    }
  }
}
