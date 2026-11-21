import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  type ClassStructure,
  type ClassSubjectItem,
  type CreateSectionInput,
  type CreateSubjectInput,
  type CreateTeacherAssignmentInput,
  type ListTeacherAssignmentsQuery,
  type SectionItem,
  type SetClassSubjectsInput,
  type SubjectItem,
  type SubjectType,
  type TeacherAssignmentItem,
  type UpdateSectionInput,
  type UpdateSubjectInput,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { fullName } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';
import { AcademicYearsService } from './academic-years.service.js';

const sectionInclude = {
  class: { select: { name: true, levelOrder: true } },
  classTeacher: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { enrolments: { where: { status: 'ACTIVE' } } } },
} as const;
type SectionRow = Prisma.SectionGetPayload<{ include: typeof sectionInclude }>;

function toSection(r: SectionRow): SectionItem {
  return {
    id: r.id,
    academicYearId: r.academicYearId,
    classId: r.classId,
    className: r.class.name,
    name: r.name,
    roomLabel: r.roomLabel,
    capacity: r.capacity,
    classTeacher: r.classTeacher
      ? {
          id: r.classTeacher.id,
          fullName: fullName(r.classTeacher.firstName, r.classTeacher.lastName),
        }
      : null,
    isActive: r.isActive,
    studentCount: r._count.enrolments,
  };
}

const classSubjectInclude = { subject: { select: { id: true, code: true, name: true } } } as const;
type ClassSubjectRow = Prisma.ClassSubjectGetPayload<{ include: typeof classSubjectInclude }>;

const toClassSubject = (r: ClassSubjectRow): ClassSubjectItem => ({
  id: r.id,
  academicYearId: r.academicYearId,
  classId: r.classId,
  subject: r.subject,
  subjectType: r.subjectType as SubjectType,
  isActive: r.isActive,
});

const assignmentInclude = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  section: { select: { id: true, name: true, classId: true, class: { select: { name: true } } } },
  classSubject: { select: { subject: { select: { id: true, name: true } } } },
} as const;
type AssignmentRow = Prisma.TeacherAssignmentGetPayload<{ include: typeof assignmentInclude }>;

const toAssignment = (r: AssignmentRow): TeacherAssignmentItem => ({
  id: r.id,
  academicYearId: r.academicYearId,
  employee: {
    id: r.employee.id,
    fullName: fullName(r.employee.firstName, r.employee.lastName),
    employeeCode: r.employee.employeeCode,
  },
  section: {
    id: r.section.id,
    name: r.section.name,
    classId: r.section.classId,
    className: r.section.class.name,
  },
  classSubjectId: r.classSubjectId,
  subject: r.classSubject.subject,
  createdAt: r.createdAt.toISOString(),
});

/** Subjects, sections, class-subject mapping and teacher assignments. */
@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly years: AcademicYearsService,
  ) {}

  // --- Subjects -----------------------------------------------------------------------

  async listSubjects(): Promise<SubjectItem[]> {
    return this.prisma.subject.findMany({ orderBy: { name: 'asc' } });
  }

  async createSubject(input: CreateSubjectInput, actor: RequestUser, context: RequestContext) {
    return this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.create({
        data: {
          code: (input.code as string | undefined) ?? null,
          name: input.name,
          description: input.description ?? null,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.SUBJECT_CREATED,
          entityType: 'subject',
          entityId: subject.id,
          userId: actor.id,
          after: subject,
          context,
        },
        tx,
      );
      return subject;
    });
  }

  async updateSubject(
    id: string,
    input: UpdateSubjectInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.prisma.subject.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Subject not found');
    return this.prisma.$transaction(async (tx) => {
      const subject = await tx.subject.update({
        where: { id },
        data: {
          code: input.code as string | null | undefined,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
        },
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.SUBJECT_UPDATED,
          entityType: 'subject',
          entityId: id,
          userId: actor.id,
          before,
          after: subject,
          context,
        },
        tx,
      );
      return subject;
    });
  }

  // --- Structure (classes → sections + subjects) for one year ----------------------------

  async structure(academicYearId: string): Promise<ClassStructure[]> {
    await this.years.get(academicYearId);
    const [classes, sections, subjects] = await Promise.all([
      this.prisma.class.findMany({ where: { isActive: true }, orderBy: { levelOrder: 'asc' } }),
      this.prisma.section.findMany({
        where: { academicYearId },
        include: sectionInclude,
        orderBy: { name: 'asc' },
      }),
      this.prisma.classSubject.findMany({
        where: { academicYearId },
        include: classSubjectInclude,
        orderBy: { subject: { name: 'asc' } },
      }),
    ]);
    return classes.map((c) => ({
      class: { id: c.id, name: c.name, levelOrder: c.levelOrder },
      sections: sections.filter((s) => s.classId === c.id).map(toSection),
      subjects: subjects.filter((s) => s.classId === c.id).map(toClassSubject),
    }));
  }

  async setClassSubjects(
    input: SetClassSubjectsInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.years.assertWritable(input.academicYearId);
    const wanted = new Map(input.subjects.map((s) => [s.subjectId, s.subjectType ?? 'CORE']));
    const existing = await this.prisma.classSubject.findMany({
      where: { academicYearId: input.academicYearId, classId: input.classId },
      include: {
        _count: { select: { teacherAssignments: true } },
        subject: { select: { name: true } },
      },
    });
    const removing = existing.filter((e) => !wanted.has(e.subjectId));
    const inUse = removing.filter((e) => e._count.teacherAssignments > 0);
    if (inUse.length) {
      throw new ConflictException(
        `Remove the teacher assignments for ${inUse.map((e) => e.subject.name).join(', ')} first`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      if (removing.length)
        await tx.classSubject.deleteMany({ where: { id: { in: removing.map((r) => r.id) } } });
      for (const [subjectId, subjectType] of wanted) {
        await tx.classSubject.upsert({
          where: {
            academicYearId_classId_subjectId: {
              academicYearId: input.academicYearId,
              classId: input.classId,
              subjectId,
            },
          },
          update: { subjectType, isActive: true },
          create: {
            academicYearId: input.academicYearId,
            classId: input.classId,
            subjectId,
            subjectType,
          },
        });
      }
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.CLASS_SUBJECTS_CHANGED,
          entityType: 'class',
          entityId: input.classId,
          userId: actor.id,
          before: { subjects: existing.map((e) => e.subject.name) },
          after: { academicYearId: input.academicYearId, subjectIds: [...wanted.keys()] },
          context,
        },
        tx,
      );
    });
    const rows = await this.prisma.classSubject.findMany({
      where: { academicYearId: input.academicYearId, classId: input.classId },
      include: classSubjectInclude,
      orderBy: { subject: { name: 'asc' } },
    });
    return rows.map(toClassSubject);
  }

  // --- Sections -----------------------------------------------------------------------

  async getSection(id: string): Promise<SectionItem> {
    const row = await this.prisma.section.findUnique({ where: { id }, include: sectionInclude });
    if (!row) throw new NotFoundException('Section not found');
    return toSection(row);
  }

  async createSection(input: CreateSectionInput, actor: RequestUser, context: RequestContext) {
    await this.years.assertWritable(input.academicYearId);
    if (input.classTeacherId) await this.assertActiveEmployee(input.classTeacherId);
    return this.prisma.$transaction(async (tx) => {
      const section = toSection(
        await tx.section.create({
          data: {
            academicYearId: input.academicYearId,
            classId: input.classId,
            name: input.name,
            roomLabel: input.roomLabel || null,
            capacity: input.capacity ? Number(input.capacity) : null,
            classTeacherId: input.classTeacherId ?? null,
          },
          include: sectionInclude,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.SECTION_CREATED,
          entityType: 'section',
          entityId: section.id,
          userId: actor.id,
          after: section,
          context,
        },
        tx,
      );
      return section;
    });
  }

  async updateSection(
    id: string,
    input: UpdateSectionInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const before = await this.getSection(id);
    await this.years.assertWritable(before.academicYearId);
    if (input.classTeacherId) await this.assertActiveEmployee(input.classTeacherId);
    if (input.capacity && before.studentCount > Number(input.capacity)) {
      throw new BadRequestException([
        `capacity: ${before.studentCount} students are already in this section`,
      ]);
    }
    return this.prisma.$transaction(async (tx) => {
      const section = toSection(
        await tx.section.update({
          where: { id },
          data: {
            name: input.name,
            roomLabel: input.roomLabel,
            capacity:
              input.capacity === undefined
                ? undefined
                : input.capacity === null
                  ? null
                  : Number(input.capacity),
            classTeacherId: input.classTeacherId,
            isActive: input.isActive,
          },
          include: sectionInclude,
        }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.SECTION_UPDATED,
          entityType: 'section',
          entityId: id,
          userId: actor.id,
          before,
          after: section,
          context,
        },
        tx,
      );
      return section;
    });
  }

  async deleteSection(id: string, actor: RequestUser, context: RequestContext) {
    const section = await this.getSection(id);
    await this.years.assertWritable(section.academicYearId);
    const [enrolments, assignments] = await Promise.all([
      this.prisma.studentEnrolment.count({ where: { sectionId: id } }),
      this.prisma.teacherAssignment.count({ where: { sectionId: id } }),
    ]);
    if (enrolments || assignments) {
      throw new ConflictException(
        'This section has students or teacher assignments. Deactivate it instead.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.section.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.SECTION_DELETED,
          entityType: 'section',
          entityId: id,
          userId: actor.id,
          before: section,
          context,
        },
        tx,
      );
    });
  }

  // --- Teacher assignments ------------------------------------------------------------

  async listAssignments(query: ListTeacherAssignmentsQuery): Promise<TeacherAssignmentItem[]> {
    const rows = await this.prisma.teacherAssignment.findMany({
      where: {
        academicYearId: query.academicYearId,
        employeeId: query.employeeId,
        sectionId: query.sectionId,
      },
      include: assignmentInclude,
      orderBy: [{ section: { class: { levelOrder: 'asc' } } }, { section: { name: 'asc' } }],
    });
    return rows.map(toAssignment);
  }

  async createAssignment(
    input: CreateTeacherAssignmentInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.years.assertWritable(input.academicYearId);
    await this.assertActiveEmployee(input.employeeId);
    const [section, classSubject] = await Promise.all([
      this.prisma.section.findUnique({
        where: { id: input.sectionId },
        select: { classId: true, academicYearId: true },
      }),
      this.prisma.classSubject.findUnique({
        where: { id: input.classSubjectId },
        select: { classId: true, academicYearId: true },
      }),
    ]);
    if (!section || section.academicYearId !== input.academicYearId) {
      throw new BadRequestException(['sectionId: Section not found in this academic year']);
    }
    if (
      !classSubject ||
      classSubject.classId !== section.classId ||
      classSubject.academicYearId !== input.academicYearId
    ) {
      throw new BadRequestException([
        "classSubjectId: This subject is not taught in the section's class",
      ]);
    }
    return this.prisma.$transaction(async (tx) => {
      const item = toAssignment(
        await tx.teacherAssignment.create({ data: input, include: assignmentInclude }),
      );
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TEACHER_ASSIGNED,
          entityType: 'teacher_assignment',
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

  async deleteAssignment(id: string, actor: RequestUser, context: RequestContext) {
    const row = await this.prisma.teacherAssignment.findUnique({
      where: { id },
      include: assignmentInclude,
    });
    if (!row) throw new NotFoundException('Assignment not found');
    await this.years.assertWritable(row.academicYearId);
    await this.prisma.$transaction(async (tx) => {
      await tx.teacherAssignment.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.TEACHER_UNASSIGNED,
          entityType: 'teacher_assignment',
          entityId: id,
          userId: actor.id,
          before: toAssignment(row),
          context,
        },
        tx,
      );
    });
  }

  private async assertActiveEmployee(id: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id }, select: { status: true } });
    if (!emp || emp.status !== 'ACTIVE')
      throw new BadRequestException(['employeeId: Choose an active staff member']);
  }
}
