import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  type ExamStatus,
  type MarkStatus,
  type MarksSheet,
  type MarksTask,
  type MarksTaskStatus,
  type ReviewMarksInput,
  type SaveMarksData,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { fullName } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';
import { TeacherScopeService, byRollThenName } from '../academics/teacher-scope.service.js';
import {
  examSubjectInclude,
  fromHundredths,
  hundredthsToDb,
  subjectLabel,
  toExamSubjectItem,
  toHundredths,
} from './exams-core.js';

/**
 * Marks entry: one row per student per exam subject/component.
 * Teachers (marks.enter_assigned) edit DRAFT marks for subjects they are assigned to in a section,
 * while the exam is open for marks entry, then submit. marks.approve approves or returns them.
 * exams.manage may enter marks for any section.
 */
@Injectable()
export class MarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: TeacherScopeService,
  ) {}

  private async context(examSubjectId: string, sectionId: string) {
    const subject = await this.prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: {
        ...examSubjectInclude,
        examination: { include: { class: { select: { name: true } } } },
      },
    });
    if (!subject) throw new NotFoundException('Exam subject not found');
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (
      !section ||
      section.academicYearId !== subject.examination.academicYearId ||
      section.classId !== subject.examination.classId
    ) {
      throw new BadRequestException(["sectionId: This section is not part of the exam's class"]);
    }
    return { subject, exam: subject.examination, section };
  }

  private async isAssigned(actor: RequestUser, sectionId: string, classSubjectId: string) {
    const employeeId = await this.scope.employeeIdForUser(actor.id);
    if (!employeeId) return false;
    return !!(await this.prisma.teacherAssignment.findFirst({
      where: { employeeId, sectionId, classSubjectId },
      select: { id: true },
    }));
  }

  private async rights(
    actor: RequestUser,
    exam: { status: string },
    sectionId: string,
    classSubjectId: string,
  ) {
    const manage = actor.permissions.has(PERMISSIONS.EXAMS_MANAGE);
    const assigned =
      actor.permissions.has(PERMISSIONS.MARKS_ENTER) &&
      (await this.isAssigned(actor, sectionId, classSubjectId));
    const canView = manage || assigned || actor.permissions.has(PERMISSIONS.EXAMS_READ);
    if (!canView) throw new ForbiddenException('This subject and section are not assigned to you');
    const open = exam.status === 'MARKS_ENTRY';
    const lockedReason =
      exam.status === 'FINALIZED'
        ? 'This exam is finalised — marks are locked.'
        : !open
          ? 'Marks entry is not open for this exam yet.'
          : !(manage || assigned)
            ? 'Only the subject teacher can enter these marks.'
            : null;
    return {
      canEdit: open && (manage || assigned),
      canReview: open && actor.permissions.has(PERMISSIONS.MARKS_APPROVE),
      lockedReason,
    };
  }

  /** Students on the sheet: current students of the section, plus anyone who already has a mark. */
  private async students(sectionId: string, examSubjectId: string) {
    return this.prisma.studentEnrolment.findMany({
      where: {
        sectionId,
        OR: [{ status: 'ACTIVE' }, { markEntries: { some: { examSubjectId } } }],
      },
      select: {
        id: true,
        rollNumber: true,
        student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        markEntries: {
          where: { examSubjectId },
          include: {
            enterer: { select: { fullName: true } },
            approver: { select: { fullName: true } },
          },
        },
      },
    });
  }

  async sheet(examSubjectId: string, sectionId: string, actor: RequestUser): Promise<MarksSheet> {
    const { subject, exam, section } = await this.context(examSubjectId, sectionId);
    const rights = await this.rights(actor, exam, sectionId, subject.classSubjectId);
    const enrolments = await this.students(sectionId, examSubjectId);
    const rows = enrolments
      .map((e) => {
        const m = e.markEntries[0];
        const h = toHundredths(m?.marksObtained);
        return {
          enrolmentId: e.id,
          studentId: e.student.id,
          rollNumber: e.rollNumber,
          fullName: fullName(e.student.firstName, e.student.middleName, e.student.lastName),
          marks: h === null ? null : fromHundredths(h),
          isAbsent: m?.isAbsent ?? false,
          remarks: m?.remarks ?? null,
          status: (m?.status as MarkStatus | undefined) ?? null,
          enteredBy: m?.enterer.fullName ?? null,
          approvedBy: m?.approver?.fullName ?? null,
        };
      })
      .sort(byRollThenName);
    const count = (s: MarkStatus) => rows.filter((r) => r.status === s).length;
    const summary = {
      students: rows.length,
      notEntered: rows.filter((r) => !r.status).length,
      draft: count('DRAFT'),
      submitted: count('SUBMITTED'),
      approved: count('APPROVED'),
      final: count('FINAL'),
    };
    return {
      exam: {
        id: exam.id,
        name: exam.name,
        status: exam.status as ExamStatus,
        className: exam.class.name,
      },
      subject: toExamSubjectItem(subject),
      section: { id: section.id, className: exam.class.name, sectionName: section.name },
      canEdit: rights.canEdit,
      canSubmit: rights.canEdit && summary.draft > 0,
      canReview: rights.canReview && summary.submitted + summary.approved > 0,
      lockedReason: rights.lockedReason,
      summary,
      rows,
    };
  }

  async save(input: SaveMarksData, actor: RequestUser, context: RequestContext) {
    const { subject, exam } = await this.context(input.examSubjectId, input.sectionId);
    const rights = await this.rights(actor, exam, input.sectionId, subject.classSubjectId);
    if (!rights.canEdit)
      throw new ForbiddenException(rights.lockedReason ?? 'You cannot edit these marks');
    const max = toHundredths(subject.maxMarks)!;
    const enrolments = new Map(
      (await this.students(input.sectionId, input.examSubjectId)).map((e) => [e.id, e]),
    );
    const problems: string[] = [];
    for (const entry of input.entries) {
      const e = enrolments.get(entry.enrolmentId);
      if (!e) problems.push('entries: Some students are not in this section');
      else if (e.markEntries[0] && e.markEntries[0].status !== 'DRAFT') {
        problems.push(
          `entries: Marks for ${fullName(e.student.firstName, e.student.lastName)} are already ${e.markEntries[0].status.toLowerCase()} — ask for them to be returned to change them`,
        );
      } else if (entry.marks !== null && Math.round(entry.marks * 100) > max) {
        problems.push(
          `entries: ${fullName(e.student.firstName, e.student.lastName)} has more than the maximum of ${fromHundredths(max)}`,
        );
      }
    }
    if (problems.length) throw new BadRequestException([...new Set(problems)]);

    let saved = 0;
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const entry of input.entries) {
        const existing = enrolments.get(entry.enrolmentId)!.markEntries[0];
        if (!entry.isAbsent && entry.marks === null) {
          if (existing) {
            await tx.markEntry.delete({ where: { id: existing.id } });
            cleared++;
          }
          continue;
        }
        const data = {
          marksObtained: entry.isAbsent ? null : hundredthsToDb(Math.round(entry.marks! * 100)),
          isAbsent: entry.isAbsent,
          remarks: entry.remarks ?? null,
          enteredBy: actor.id,
        };
        const unchanged =
          existing &&
          existing.isAbsent === data.isAbsent &&
          toHundredths(existing.marksObtained) ===
            (entry.isAbsent ? null : Math.round(entry.marks! * 100)) &&
          (existing.remarks ?? null) === data.remarks;
        if (unchanged) continue;
        await tx.markEntry.upsert({
          where: {
            examSubjectId_studentEnrolmentId: {
              examSubjectId: input.examSubjectId,
              studentEnrolmentId: entry.enrolmentId,
            },
          },
          create: {
            examSubjectId: input.examSubjectId,
            studentEnrolmentId: entry.enrolmentId,
            ...data,
          },
          update: data,
        });
        saved++;
      }
      if (saved || cleared) {
        await this.audit.log(
          {
            action: AUDIT_ACTIONS.MARKS_SAVED,
            entityType: 'exam_subject',
            entityId: input.examSubjectId,
            userId: actor.id,
            after: {
              exam: exam.name,
              subject: subjectLabel(subject),
              sectionId: input.sectionId,
              saved,
              cleared,
            },
            context,
          },
          tx,
        );
      }
    });
    return { saved, cleared };
  }

  async submit(
    examSubjectId: string,
    sectionId: string,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const { subject, exam } = await this.context(examSubjectId, sectionId);
    const rights = await this.rights(actor, exam, sectionId, subject.classSubjectId);
    if (!rights.canEdit)
      throw new ForbiddenException(rights.lockedReason ?? 'You cannot submit these marks');
    const students = await this.students(sectionId, examSubjectId);
    const missing = students.filter((s) => !s.markEntries[0]);
    if (missing.length && subject.classSubject.subjectType !== 'OPTIONAL') {
      throw new BadRequestException([
        `entries: Enter marks (or mark absent) for every student first — ${missing.length} missing`,
      ]);
    }
    const ids = students
      .flatMap((s) => s.markEntries)
      .filter((m) => m.status === 'DRAFT')
      .map((m) => m.id);
    if (!ids.length) throw new BadRequestException('There are no draft marks to submit');
    await this.prisma.$transaction(async (tx) => {
      await tx.markEntry.updateMany({
        where: { id: { in: ids }, status: 'DRAFT' },
        data: { status: 'SUBMITTED' },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.MARKS_SUBMITTED,
          entityType: 'exam_subject',
          entityId: examSubjectId,
          userId: actor.id,
          after: { exam: exam.name, subject: subjectLabel(subject), sectionId, count: ids.length },
          context,
        },
        tx,
      );
    });
    return { submitted: ids.length };
  }

  async review(input: ReviewMarksInput, actor: RequestUser, context: RequestContext) {
    const { subject, exam } = await this.context(input.examSubjectId, input.sectionId);
    if (exam.status !== 'MARKS_ENTRY')
      throw new BadRequestException('Marks can only be reviewed while marks entry is open');
    const approve = input.decision === 'APPROVE';
    const from: MarkStatus[] = approve ? ['SUBMITTED'] : ['SUBMITTED', 'APPROVED'];
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.markEntry.updateMany({
        where: {
          examSubjectId: input.examSubjectId,
          enrolment: { sectionId: input.sectionId },
          status: { in: from },
        },
        data: approve
          ? { status: 'APPROVED', approvedBy: actor.id }
          : { status: 'DRAFT', approvedBy: null },
      });
      if (!count)
        throw new BadRequestException(
          approve
            ? 'There are no submitted marks to approve'
            : 'There are no submitted or approved marks to return',
        );
      await this.audit.log(
        {
          action: approve ? AUDIT_ACTIONS.MARKS_APPROVED : AUDIT_ACTIONS.MARKS_RETURNED,
          entityType: 'exam_subject',
          entityId: input.examSubjectId,
          userId: actor.id,
          after: {
            exam: exam.name,
            subject: subjectLabel(subject),
            sectionId: input.sectionId,
            count,
          },
          reason: input.remarks ?? null,
          context,
        },
        tx,
      );
      return count;
    });
    return { updated: result };
  }

  /** "Marks to enter" for a teacher: assigned subject × section in exams that are scheduled or open. */
  async myTasks(actor: RequestUser): Promise<MarksTask[]> {
    const employeeId = await this.scope.employeeIdForUser(actor.id);
    if (!employeeId) return [];
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { employeeId, academicYear: { isActive: true } },
      include: {
        section: {
          include: {
            class: { select: { name: true } },
            enrolments: { where: { status: 'ACTIVE' }, select: { id: true } },
          },
        },
      },
    });
    if (!assignments.length) return [];
    const subjects = await this.prisma.examSubject.findMany({
      where: {
        classSubjectId: { in: assignments.map((a) => a.classSubjectId) },
        examination: {
          status: { in: ['SCHEDULED', 'MARKS_ENTRY', 'FINALIZED'] },
          academicYear: { isActive: true },
        },
      },
      include: {
        ...examSubjectInclude,
        examination: true,
        marks: { select: { status: true, enrolment: { select: { sectionId: true } } } },
      },
      orderBy: [
        { examination: { startDate: { sort: 'desc', nulls: 'last' } } },
        { sequenceNo: 'asc' },
      ],
    });
    const tasks: MarksTask[] = [];
    for (const s of subjects) {
      for (const a of assignments.filter(
        (x) => x.classSubjectId === s.classSubjectId && x.section.classId === s.examination.classId,
      )) {
        const marks = s.marks.filter((m) => m.enrolment.sectionId === a.sectionId);
        const statuses = new Set(marks.map((m) => m.status));
        const status: MarksTaskStatus = !marks.length
          ? 'NOT_STARTED'
          : statuses.size === 1
            ? ([...statuses][0] as MarkStatus)
            : 'MIXED';
        tasks.push({
          examId: s.examinationId,
          examName: s.examination.name,
          examSubjectId: s.id,
          subjectLabel: subjectLabel(s),
          examDate: s.examDate ? s.examDate.toISOString().slice(0, 10) : null,
          maxMarks: fromHundredths(toHundredths(s.maxMarks)!),
          sectionId: a.sectionId,
          className: a.section.class.name,
          sectionName: a.section.name,
          students: a.section.enrolments.length,
          entered: marks.length,
          status,
        });
      }
    }
    return tasks;
  }
}
