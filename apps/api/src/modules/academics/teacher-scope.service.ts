import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RosterItem, TeacherSectionItem } from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { fullName, isoDay } from '../../common/utils/content.js';

/**
 * Teacher access scope. A signed-in user can work with a section when, in that academic year,
 * their linked employee record is the section's class teacher or has a teacher assignment for it.
 * This is the single place later phases (attendance, marks) ask "may this teacher see this class?".
 */
@Injectable()
export class TeacherScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async employeeIdForUser(userId: string): Promise<string | null> {
    const emp = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    return emp && emp.status === 'ACTIVE' ? emp.id : null;
  }

  /** Section ids the user may access in the given year (defaults to the active year). */
  async accessibleSectionIds(userId: string, academicYearId?: string): Promise<string[]> {
    const employeeId = await this.employeeIdForUser(userId);
    if (!employeeId) return [];
    const yearFilter = academicYearId ? { id: academicYearId } : { isActive: true };
    const sections = await this.prisma.section.findMany({
      where: {
        academicYear: yearFilter,
        OR: [{ classTeacherId: employeeId }, { teacherAssignments: { some: { employeeId } } }],
      },
      select: { id: true },
    });
    return sections.map((s) => s.id);
  }

  async assertSectionAccess(userId: string, sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { academicYearId: true },
    });
    const allowed =
      section &&
      (await this.accessibleSectionIds(userId, section.academicYearId)).includes(sectionId);
    if (!allowed) throw new ForbiddenException('This class is not assigned to you');
  }

  /** "My classes" for the teacher portal (active year). */
  async mySections(userId: string): Promise<TeacherSectionItem[]> {
    const employeeId = await this.employeeIdForUser(userId);
    if (!employeeId) return [];
    const sections = await this.prisma.section.findMany({
      where: {
        academicYear: { isActive: true },
        OR: [{ classTeacherId: employeeId }, { teacherAssignments: { some: { employeeId } } }],
      },
      include: {
        class: { select: { name: true, levelOrder: true } },
        academicYear: { select: { id: true, name: true } },
        teacherAssignments: {
          where: { employeeId },
          select: { classSubject: { select: { subject: { select: { name: true } } } } },
        },
        _count: { select: { enrolments: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ class: { levelOrder: 'asc' } }, { name: 'asc' }],
    });
    return sections.map((s) => ({
      sectionId: s.id,
      className: s.class.name,
      sectionName: s.name,
      academicYear: s.academicYear,
      isClassTeacher: s.classTeacherId === employeeId,
      subjects: s.teacherAssignments.map((a) => a.classSubject.subject.name).sort(),
      studentCount: s._count.enrolments,
    }));
  }

  async roster(userId: string, sectionId: string): Promise<RosterItem[]> {
    await this.assertSectionAccess(userId, sectionId);
    const rows = await this.prisma.studentEnrolment.findMany({
      where: { sectionId, status: 'ACTIVE' },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            gender: true,
            dateOfBirth: true,
            guardians: {
              where: { isPrimary: true },
              select: { fullName: true, relationship: true, phone: true },
              take: 1,
            },
          },
        },
      },
    });
    return rows
      .map((r) => ({
        enrolmentId: r.id,
        studentId: r.student.id,
        rollNumber: r.rollNumber,
        fullName: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
        gender: r.student.gender,
        dateOfBirth: isoDay(r.student.dateOfBirth),
        guardian: r.student.guardians[0] ?? null,
      }))
      .sort(byRollThenName);
  }
}

/** Numeric-aware roll number order, then name. */
export function byRollThenName(
  a: { rollNumber: string | null; fullName: string },
  b: { rollNumber: string | null; fullName: string },
) {
  if (a.rollNumber && b.rollNumber) {
    const c = a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true });
    if (c) return c;
  } else if (a.rollNumber || b.rollNumber) {
    return a.rollNumber ? -1 : 1;
  }
  return a.fullName.localeCompare(b.fullName);
}
