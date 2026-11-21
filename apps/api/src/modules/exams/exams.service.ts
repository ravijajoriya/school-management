import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type CreateExaminationData,
  type ExamProgressRow,
  type ExamStatus,
  type ExamType,
  type ExaminationItem,
  type SetExamSubjectsData,
  type UpdateExaminationInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDayOrNull } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';
import {
  examSubjectInclude,
  hundredthsToDb,
  resolveScale,
  subjectLabel,
  toExamSubjectItem,
} from './exams-core.js';

const examInclude = {
  academicYear: { select: { id: true, name: true, status: true } },
  class: { select: { id: true, name: true, levelOrder: true } },
  gradingScale: { select: { id: true, name: true } },
  subjects: { include: examSubjectInclude, orderBy: { sequenceNo: 'asc' } },
} satisfies Prisma.ExaminationInclude;

export type ExamRow = Prisma.ExaminationGetPayload<{ include: typeof examInclude }>;

/** Allowed manual status moves (finalising has its own endpoint). */
const TRANSITIONS: Record<ExamStatus, ExamStatus[]> = {
  DRAFT: ['SCHEDULED'],
  SCHEDULED: ['DRAFT', 'MARKS_ENTRY'],
  MARKS_ENTRY: ['SCHEDULED'],
  FINALIZED: [],
};

/** Examinations: set-up, subjects/components, status workflow, progress and finalisation. */
@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async load(id: string): Promise<ExamRow> {
    const exam = await this.prisma.examination.findUnique({ where: { id }, include: examInclude });
    if (!exam) throw new NotFoundException('Examination not found');
    return exam;
  }

  /** Current students of the exam's class, by section (the students expected to have marks). */
  async sectionsOf(exam: { academicYearId: string; classId: string }) {
    return this.prisma.section.findMany({
      where: { academicYearId: exam.academicYearId, classId: exam.classId, isActive: true },
      include: { enrolments: { where: { status: 'ACTIVE' }, select: { id: true } } },
      orderBy: { name: 'asc' },
    });
  }

  private async toItem(e: ExamRow): Promise<ExaminationItem> {
    const sections = await this.sectionsOf(e);
    const students = sections.reduce((s, x) => s + x.enrolments.length, 0);
    const [entered, approved] = await Promise.all([
      this.prisma.markEntry.count({ where: { examSubject: { examinationId: e.id } } }),
      this.prisma.markEntry.count({
        where: { examSubject: { examinationId: e.id }, status: { in: ['APPROVED', 'FINAL'] } },
      }),
    ]);
    return {
      id: e.id,
      academicYear: { id: e.academicYear.id, name: e.academicYear.name },
      class: { id: e.class.id, name: e.class.name },
      name: e.name,
      examType: e.examType as ExamType,
      startDate: isoDayOrNull(e.startDate),
      endDate: isoDayOrNull(e.endDate),
      status: e.status as ExamStatus,
      gradingScale: e.gradingScale,
      subjects: e.subjects.map(toExamSubjectItem),
      progress: { expected: students * e.subjects.length, entered, approved },
    };
  }

  async list(academicYearId: string, classId?: string): Promise<ExaminationItem[]> {
    const rows = await this.prisma.examination.findMany({
      where: { academicYearId, classId },
      include: examInclude,
      orderBy: [
        { class: { levelOrder: 'asc' } },
        { startDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });
    return Promise.all(rows.map((r) => this.toItem(r)));
  }

  async get(id: string) {
    return this.toItem(await this.load(id));
  }

  async create(input: CreateExaminationData, actor: RequestUser, context: RequestContext) {
    const year = await this.prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
    if (!year) throw new BadRequestException(['academicYearId: Academic year not found']);
    if (year.status === 'CLOSED')
      throw new BadRequestException([`academicYearId: ${year.name} is closed`]);
    const row = await this.prisma.$transaction(async (tx) => {
      const e = await tx.examination.create({
        data: {
          academicYearId: input.academicYearId,
          classId: input.classId,
          name: input.name,
          examType: input.examType,
          startDate: input.startDate ? dayToDate(input.startDate) : null,
          endDate: input.endDate ? dayToDate(input.endDate) : null,
          gradingScaleId: input.gradingScaleId ?? null,
        },
        include: examInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EXAM_CREATED,
          entityType: 'examination',
          entityId: e.id,
          userId: actor.id,
          after: { name: e.name, class: e.class.name, year: year.name },
          context,
        },
        tx,
      );
      return e;
    });
    return this.toItem(row);
  }

  private assertNotFinal(e: { status: string }) {
    if (e.status === 'FINALIZED')
      throw new BadRequestException('This examination is finalised and can no longer change');
  }

  async update(
    id: string,
    input: UpdateExaminationInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.load(id);
    this.assertNotFinal(before);
    const start = input.startDate === undefined ? isoDayOrNull(before.startDate) : input.startDate;
    const end = input.endDate === undefined ? isoDayOrNull(before.endDate) : input.endDate;
    if (start && end && end < start)
      throw new BadRequestException(['endDate: End date must be on or after the start date']);
    const row = await this.prisma.$transaction(async (tx) => {
      const e = await tx.examination.update({
        where: { id },
        data: {
          name: input.name,
          examType: input.examType,
          startDate:
            input.startDate === undefined
              ? undefined
              : input.startDate
                ? dayToDate(input.startDate)
                : null,
          endDate:
            input.endDate === undefined
              ? undefined
              : input.endDate
                ? dayToDate(input.endDate)
                : null,
          gradingScaleId: input.gradingScaleId,
        },
        include: examInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EXAM_UPDATED,
          entityType: 'examination',
          entityId: id,
          userId: actor.id,
          before: { name: before.name },
          after: input,
          context,
        },
        tx,
      );
      return e;
    });
    return this.toItem(row);
  }

  /** Replaces the subject list. Only before marks entry starts and while no marks exist. */
  async setSubjects(
    id: string,
    input: SetExamSubjectsData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const exam = await this.load(id);
    if (!['DRAFT', 'SCHEDULED'].includes(exam.status)) {
      throw new BadRequestException(
        'Subjects can only be changed while the exam is a draft or scheduled',
      );
    }
    const marks = await this.prisma.markEntry.count({
      where: { examSubject: { examinationId: id } },
    });
    if (marks)
      throw new BadRequestException(
        'Marks have already been entered for this exam, so its subjects are fixed',
      );
    const valid = await this.prisma.classSubject.findMany({
      where: {
        id: { in: input.subjects.map((s) => s.classSubjectId) },
        academicYearId: exam.academicYearId,
        classId: exam.classId,
      },
      select: { id: true },
    });
    if (valid.length !== new Set(input.subjects.map((s) => s.classSubjectId)).size) {
      throw new BadRequestException([
        `subjects: Choose subjects set up for ${exam.class.name} in ${exam.academicYear.name}`,
      ]);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.examSubject.deleteMany({ where: { examinationId: id } });
      await tx.examSubject.createMany({
        data: input.subjects.map((s, i) => ({
          examinationId: id,
          classSubjectId: s.classSubjectId,
          componentName: s.componentName ?? null,
          examDate: s.examDate ? dayToDate(s.examDate) : null,
          maxMarks: hundredthsToDb(Math.round(s.maxMarks * 100)),
          passMarks:
            s.passMarks === undefined ? null : hundredthsToDb(Math.round(s.passMarks * 100)),
          sequenceNo: i + 1,
        })),
      });
      const e = await tx.examination.findUniqueOrThrow({ where: { id }, include: examInclude });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EXAM_SUBJECTS_SET,
          entityType: 'examination',
          entityId: id,
          userId: actor.id,
          after: {
            subjects: e.subjects.map((s) => `${subjectLabel(s)} (${s.maxMarks.toString()})`),
          },
          context,
        },
        tx,
      );
      return e;
    });
    return this.toItem(row);
  }

  async setStatus(
    id: string,
    status: 'DRAFT' | 'SCHEDULED' | 'MARKS_ENTRY',
    actor: RequestUser,
    context: RequestContext,
  ) {
    const exam = await this.load(id);
    if (!TRANSITIONS[exam.status as ExamStatus].includes(status)) {
      throw new BadRequestException(
        `A ${exam.status.toLowerCase().replace('_', ' ')} exam cannot move to ${status.toLowerCase().replace('_', ' ')}`,
      );
    }
    if (status !== 'DRAFT' && exam.subjects.length === 0) {
      throw new BadRequestException('Add the exam subjects first');
    }
    if (
      status === 'DRAFT' &&
      (await this.prisma.markEntry.count({ where: { examSubject: { examinationId: id } } }))
    ) {
      throw new BadRequestException('Marks exist for this exam, so it cannot go back to draft');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.examination.updateMany({
        where: { id, status: exam.status },
        data: { status },
      });
      if (!count) throw new ConflictException('This exam was just changed by someone else');
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EXAM_STATUS_CHANGED,
          entityType: 'examination',
          entityId: id,
          userId: actor.id,
          before: { status: exam.status },
          after: { status },
          context,
        },
        tx,
      );
      return tx.examination.findUniqueOrThrow({ where: { id }, include: examInclude });
    });
    return this.toItem(row);
  }

  /** Marks progress per subject × section, for the approval screen. */
  async progress(id: string): Promise<ExamProgressRow[]> {
    const exam = await this.load(id);
    const sections = await this.sectionsOf(exam);
    const perSection = await this.prisma.markEntry.findMany({
      where: { examSubject: { examinationId: id } },
      select: { examSubjectId: true, status: true, enrolment: { select: { sectionId: true } } },
    });
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: {
        sectionId: { in: sections.map((s) => s.id) },
        classSubjectId: { in: exam.subjects.map((s) => s.classSubjectId) },
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const rows: ExamProgressRow[] = [];
    for (const subject of exam.subjects) {
      for (const section of sections) {
        const entries = perSection.filter(
          (m) => m.examSubjectId === subject.id && m.enrolment.sectionId === section.id,
        );
        const count = (s: string) => entries.filter((m) => m.status === s).length;
        rows.push({
          examSubjectId: subject.id,
          subjectLabel: subjectLabel(subject),
          sectionId: section.id,
          sectionLabel: `${exam.class.name} – ${section.name}`,
          teachers: assignments
            .filter(
              (a) => a.sectionId === section.id && a.classSubjectId === subject.classSubjectId,
            )
            .map((a) => fullName(a.employee.firstName, a.employee.lastName)),
          students: section.enrolments.length,
          notEntered: Math.max(section.enrolments.length - entries.length, 0),
          draft: count('DRAFT'),
          submitted: count('SUBMITTED'),
          approved: count('APPROVED'),
          final: count('FINAL'),
        });
      }
    }
    return rows;
  }

  /**
   * Finalise: every mark must be approved and every current student must have a mark (or be
   * absent) in each core subject. Marks become FINAL, the grading scale is fixed, and the exam
   * and its results are locked for good (database triggers).
   */
  async finalize(id: string, actor: RequestUser, context: RequestContext) {
    const exam = await this.load(id);
    if (exam.status !== 'MARKS_ENTRY')
      throw new BadRequestException('Only an exam in marks entry can be finalised');
    const scale = await resolveScale(this.prisma, exam);
    if (!scale)
      throw new BadRequestException(
        'Set up a grading scale (Exams → Grading scales) before finalising',
      );
    const progress = await this.progress(id);
    const problems: string[] = [];
    for (const row of progress) {
      const subject = exam.subjects.find((s) => s.id === row.examSubjectId)!;
      if (row.draft || row.submitted)
        problems.push(
          `${row.subjectLabel}, ${row.sectionLabel}: ${row.draft + row.submitted} mark(s) not yet approved`,
        );
      if (row.notEntered && subject.classSubject.subjectType !== 'OPTIONAL') {
        problems.push(
          `${row.subjectLabel}, ${row.sectionLabel}: ${row.notEntered} student(s) without marks`,
        );
      }
    }
    if (problems.length) throw new BadRequestException(problems.slice(0, 20));
    const row = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.markEntry.updateMany({
        where: { examSubject: { examinationId: id }, status: 'APPROVED' },
        data: { status: 'FINAL' },
      });
      await tx.examination.update({
        where: { id },
        data: { status: 'FINALIZED', gradingScaleId: scale.id },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.EXAM_FINALIZED,
          entityType: 'examination',
          entityId: id,
          userId: actor.id,
          after: { marks: count, gradingScale: scale.name },
          context,
        },
        tx,
      );
      return tx.examination.findUniqueOrThrow({ where: { id }, include: examInclude });
    });
    return this.toItem(row);
  }
}
