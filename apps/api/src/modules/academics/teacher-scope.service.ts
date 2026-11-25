import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RosterItem, TeacherPeriod, TeacherSectionItem } from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { dayToDate, fullName, isoDay, schoolDate } from '../../common/utils/content.js';
import { HolidaysService } from './holidays.service.js';
import { compareSections, isoWeekday, scheduleDate } from './teacher-schedule.js';

/** Postgres TIME → "HH:MM". */
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/**
 * Teacher access scope. A signed-in user can work with a section when, in that academic year,
 * their linked employee record is the section's class teacher or has a teacher assignment for it.
 * This is the single place later phases (attendance, marks) ask "may this teacher see this class?".
 */
@Injectable()
export class TeacherScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidaysService,
  ) {}

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

  /**
   * "My classes" for the teacher portal (active year): the class-teacher class first, then in the
   * order of the teacher's periods on the schedule day (today, or the next school day when today is
   * a Sunday, a holiday or has no lessons), each with that day's periods.
   */
  async mySections(userId: string): Promise<TeacherSectionItem[]> {
    const employeeId = await this.employeeIdForUser(userId);
    if (!employeeId) return [];
    const [sections, entries] = await Promise.all([
      this.prisma.section.findMany({
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
      }),
      this.prisma.timetableEntry.findMany({
        where: {
          teacherEmployeeId: employeeId,
          timetable: { status: 'PUBLISHED', academicYear: { isActive: true } },
        },
        include: {
          classSubject: { select: { subject: { select: { name: true } } } },
          timetable: { select: { sectionId: true } },
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
    ]);
    const today = schoolDate();
    const holidays = await this.holidays.between(
      today,
      isoDay(new Date(dayToDate(today).getTime() + 60 * 86_400_000)),
    );
    const day = scheduleDate(today, new Set(entries.map((e) => e.dayOfWeek)), holidays);
    const dow = day ? isoWeekday(day) : null;

    return sections
      .map((s) => {
        const mine = entries.filter((e) => e.timetable.sectionId === s.id);
        const periods: TeacherPeriod[] = mine
          .filter((e) => e.dayOfWeek === dow)
          .map((e) => ({
            periodNumber: e.periodNumber,
            startTime: hhmm(e.startTime),
            endTime: hhmm(e.endTime),
            subjectName: e.classSubject?.subject.name ?? 'Lesson',
            roomLabel: e.roomLabel,
          }));
        const item: TeacherSectionItem = {
          sectionId: s.id,
          className: s.class.name,
          sectionName: s.name,
          academicYear: s.academicYear,
          isClassTeacher: s.classTeacherId === employeeId,
          subjects: s.teacherAssignments.map((a) => a.classSubject.subject.name).sort(),
          studentCount: s._count.enrolments,
          periods,
          scheduleDate: day,
          scheduleIsToday: day === today,
        };
        const sortKey = {
          isClassTeacher: item.isClassTeacher,
          firstToday: periods[0]?.startTime ?? null,
          firstInWeek: mine[0] ? `${mine[0].dayOfWeek}-${hhmm(mine[0].startTime)}` : null,
          levelOrder: s.class.levelOrder,
          sectionName: s.name,
        };
        return { item, sortKey };
      })
      .sort((a, b) => compareSections(a.sortKey, b.sortKey))
      .map((x) => x.item);
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
    // Today's status and this month's attendance so far (Late counts as present).
    const today = schoolDate();
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        studentEnrolmentId: { in: rows.map((r) => r.id) },
        sessionCode: 'FULL_DAY',
        attendanceDate: { gte: dayToDate(`${today.slice(0, 7)}-01`), lte: dayToDate(today) },
      },
      select: { studentEnrolmentId: true, attendanceDate: true, status: true },
    });
    const byEnrolment = new Map<string, typeof records>();
    for (const r of records) {
      const list = byEnrolment.get(r.studentEnrolmentId) ?? [];
      list.push(r);
      byEnrolment.set(r.studentEnrolmentId, list);
    }
    return rows
      .map((r) => {
        const mine = byEnrolment.get(r.id) ?? [];
        const present = mine.filter((x) => x.status !== 'ABSENT').length;
        const todayRecord = mine.find((x) => isoDay(x.attendanceDate) === today);
        return {
          enrolmentId: r.id,
          studentId: r.student.id,
          rollNumber: r.rollNumber,
          fullName: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
          gender: r.student.gender,
          dateOfBirth: isoDay(r.student.dateOfBirth),
          guardian: r.student.guardians[0] ?? null,
          attendanceToday: (todayRecord?.status ?? null) as RosterItem['attendanceToday'],
          monthPercent: mine.length ? Math.round((present / mine.length) * 1000) / 10 : null,
        };
      })
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
