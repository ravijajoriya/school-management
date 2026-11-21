import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ATTENDANCE_LOW_THRESHOLD,
  PERMISSIONS,
  attendancePercentage,
  type AttendanceStatus,
  type DailyReport,
  type MonthlyReport,
  type RegisterRow,
  type SectionRegister,
  type StudentAttendanceSummary,
} from '@school/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDay } from '../../common/utils/content.js';
import { byRollThenName } from '../academics/teacher-scope.service.js';
import { AttendanceService, sectionInclude } from './attendance.service.js';

interface Tally {
  present: number;
  absent: number;
  late: number;
}

const emptyTally = (): Tally => ({ present: 0, absent: 0, late: 0 });
const add = (t: Tally, status: string, n = 1) => {
  if (status === 'PRESENT') t.present += n;
  else if (status === 'ABSENT') t.absent += n;
  else if (status === 'LATE') t.late += n;
};
const marked = (t: Tally) => t.present + t.absent + t.late;

/** First and last day of a YYYY-MM month. */
function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = dayToDate(from); isoDay(d) <= to; d = new Date(d.getTime() + 86_400_000)) {
    out.push(isoDay(d));
  }
  return out;
}

/**
 * Attendance reports. Percentages follow the school rule "Late counts as attended" and are
 * calculated over the days actually marked for the student (ADR 0005).
 */
@Injectable()
export class AttendanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  /** The academic year covering [from, to], preferring the current one. */
  private yearCovering(from: string, to: string) {
    return this.prisma.academicYear.findFirst({
      where: { startDate: { lte: dayToDate(to) }, endDate: { gte: dayToDate(from) } },
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
    });
  }

  /** School-wide picture for one day: every section's counts and whether it was marked. */
  async daily(date: string): Promise<DailyReport> {
    const empty = { present: 0, absent: 0, late: 0, total: 0, marked: 0, percentage: null };
    const year = await this.yearCovering(date, date);
    if (!year) return { date, academicYear: null, rows: [], totals: empty, sectionsNotMarked: 0 };
    const day = dayToDate(date);

    const sections = await this.prisma.section.findMany({
      where: { academicYearId: year.id, isActive: true },
      include: sectionInclude,
      orderBy: [{ class: { levelOrder: 'asc' } }, { name: 'asc' }],
    });
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: {
        academicYearId: year.id,
        enrolmentDate: { lte: day },
        OR: [{ exitDate: null }, { exitDate: { gte: day } }],
      },
      select: { id: true, sectionId: true },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        attendanceDate: day,
        sessionCode: 'FULL_DAY',
        studentEnrolmentId: { in: enrolments.map((e) => e.id) },
      },
      select: { status: true, studentEnrolmentId: true },
    });
    const sectionOf = new Map(enrolments.map((e) => [e.id, e.sectionId]));
    const totalBySection = new Map<string, number>();
    enrolments.forEach((e) =>
      totalBySection.set(e.sectionId, (totalBySection.get(e.sectionId) ?? 0) + 1),
    );
    const tallyBySection = new Map<string, Tally>();
    for (const r of records) {
      const sid = sectionOf.get(r.studentEnrolmentId)!;
      const t = tallyBySection.get(sid) ?? emptyTally();
      add(t, r.status);
      tallyBySection.set(sid, t);
    }

    const teacherIds = sections.map((s) => s.classTeacherId).filter((x): x is string => !!x);
    const onLeave = new Set(
      (
        await this.prisma.leaveRequest.findMany({
          where: {
            employeeId: { in: teacherIds },
            status: 'APPROVED',
            startDate: { lte: day },
            endDate: { gte: day },
          },
          select: { employeeId: true },
        })
      ).map((l) => l.employeeId),
    );

    const rows = sections.map((s) => {
      const t = tallyBySection.get(s.id) ?? emptyTally();
      return {
        sectionId: s.id,
        className: s.class.name,
        sectionName: s.name,
        classTeacher: s.classTeacher
          ? fullName(s.classTeacher.firstName, s.classTeacher.lastName)
          : null,
        classTeacherOnLeave: !!s.classTeacherId && onLeave.has(s.classTeacherId),
        total: totalBySection.get(s.id) ?? 0,
        marked: marked(t),
        ...t,
        percentage: attendancePercentage(t.present, t.late, marked(t)),
      };
    });
    const totals = rows.reduce(
      (acc, r) => ({
        total: acc.total + r.total,
        marked: acc.marked + r.marked,
        present: acc.present + r.present,
        absent: acc.absent + r.absent,
        late: acc.late + r.late,
      }),
      { total: 0, marked: 0, present: 0, absent: 0, late: 0 },
    );
    return {
      date,
      academicYear: { id: year.id, name: year.name },
      rows,
      totals: {
        ...totals,
        percentage: attendancePercentage(totals.present, totals.late, totals.marked),
      },
      sectionsNotMarked: rows.filter((r) => r.total > 0 && r.marked === 0).length,
    };
  }

  /** Per-section summary for a month: days taken, average attendance and students below 75%. */
  async monthly(month: string): Promise<MonthlyReport> {
    const [first, last] = monthRange(month);
    const year = await this.yearCovering(first, last);
    if (!year) return { month, academicYear: null, rows: [] };
    const from = first < isoDay(year.startDate) ? isoDay(year.startDate) : first;
    const to = last > isoDay(year.endDate) ? isoDay(year.endDate) : last;

    const sections = await this.prisma.section.findMany({
      where: { academicYearId: year.id, isActive: true },
      include: sectionInclude,
      orderBy: [{ class: { levelOrder: 'asc' } }, { name: 'asc' }],
    });
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: {
        academicYearId: year.id,
        enrolmentDate: { lte: dayToDate(to) },
        OR: [{ exitDate: null }, { exitDate: { gte: dayToDate(from) } }],
      },
      select: { id: true, sectionId: true },
    });
    const counts = await this.prisma.$queryRaw<
      { enrolmentId: string; status: string; n: number }[]
    >(Prisma.sql`
      SELECT a.student_enrolment_id AS "enrolmentId", a.status, COUNT(*)::int AS n
      FROM attendance_records a
      JOIN student_enrolments e ON e.id = a.student_enrolment_id
      WHERE e.academic_year_id = ${year.id}::uuid
        AND a.session_code = 'FULL_DAY'
        AND a.attendance_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1, 2`);
    const days = await this.prisma.$queryRaw<{ sectionId: string; days: number }[]>(Prisma.sql`
      SELECT e.section_id AS "sectionId", COUNT(DISTINCT a.attendance_date)::int AS days
      FROM attendance_records a
      JOIN student_enrolments e ON e.id = a.student_enrolment_id
      WHERE e.academic_year_id = ${year.id}::uuid
        AND a.session_code = 'FULL_DAY'
        AND a.attendance_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1`);

    const tallyByEnrolment = new Map<string, Tally>();
    for (const c of counts) {
      const t = tallyByEnrolment.get(c.enrolmentId) ?? emptyTally();
      add(t, c.status, c.n);
      tallyByEnrolment.set(c.enrolmentId, t);
    }
    const daysBySection = new Map(days.map((d) => [d.sectionId, d.days]));

    const rows = sections.map((s) => {
      const ids = enrolments.filter((e) => e.sectionId === s.id).map((e) => e.id);
      const percentages = ids
        .map((id) => {
          const t = tallyByEnrolment.get(id);
          return t ? attendancePercentage(t.present, t.late, marked(t)) : null;
        })
        .filter((p): p is number => p !== null);
      return {
        sectionId: s.id,
        className: s.class.name,
        sectionName: s.name,
        students: ids.length,
        workingDays: daysBySection.get(s.id) ?? 0,
        averagePercentage: percentages.length
          ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
          : null,
        lowAttendance: percentages.filter((p) => p < ATTENDANCE_LOW_THRESHOLD).length,
      };
    });
    return { month, academicYear: { id: year.id, name: year.name }, rows };
  }

  /** Classic attendance register: students × days of the month, with totals. */
  async register(sectionId: string, month: string, actor: RequestUser): Promise<SectionRegister> {
    const section = await this.attendance.loadSection(sectionId);
    await this.attendance.assertCanView(actor, section);
    const [first, last] = monthRange(month);
    const yStart = isoDay(section.academicYear.startDate);
    const yEnd = isoDay(section.academicYear.endDate);
    const from = first < yStart ? yStart : first;
    const to = last > yEnd ? yEnd : last;
    const base = {
      section: {
        id: section.id,
        className: section.class.name,
        sectionName: section.name,
        academicYear: { id: section.academicYear.id, name: section.academicYear.name },
      },
      month,
    };
    if (from > to) return { ...base, days: [], workingDays: [], rows: [] };

    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: {
        sectionId,
        enrolmentDate: { lte: dayToDate(to) },
        OR: [{ exitDate: null }, { exitDate: { gte: dayToDate(from) } }],
      },
      select: {
        id: true,
        rollNumber: true,
        student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        attendance: {
          where: {
            sessionCode: 'FULL_DAY',
            attendanceDate: { gte: dayToDate(from), lte: dayToDate(to) },
          },
          select: { attendanceDate: true, status: true },
        },
      },
    });

    const working = new Set<string>();
    const rows: RegisterRow[] = enrolments
      .map((e) => {
        const t = emptyTally();
        const dayMap: Record<string, AttendanceStatus> = {};
        for (const a of e.attendance) {
          const d = isoDay(a.attendanceDate);
          dayMap[d] = a.status as AttendanceStatus;
          working.add(d);
          add(t, a.status);
        }
        return {
          enrolmentId: e.id,
          studentId: e.student.id,
          rollNumber: e.rollNumber,
          fullName: fullName(e.student.firstName, e.student.middleName, e.student.lastName),
          days: dayMap,
          ...t,
          marked: marked(t),
          percentage: attendancePercentage(t.present, t.late, marked(t)),
        };
      })
      .sort(byRollThenName);

    return { ...base, days: datesBetween(from, to), workingDays: [...working].sort(), rows };
  }

  /** One student's attendance for a year (default: current year, else their latest enrolment). */
  async student(
    studentId: string,
    academicYearId: string | undefined,
    actor: RequestUser,
  ): Promise<StudentAttendanceSummary> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Student not found');

    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: { studentId, ...(academicYearId ? { academicYearId } : {}) },
      include: {
        academicYear: { select: { id: true, name: true, isActive: true, startDate: true } },
        class: { select: { name: true } },
        section: { select: { name: true, classTeacherId: true } },
      },
    });
    const enrolment =
      enrolments.find((e) => e.academicYear.isActive) ??
      enrolments.sort(
        (a, b) => b.academicYear.startDate.getTime() - a.academicYear.startDate.getTime(),
      )[0];

    const empty: StudentAttendanceSummary = {
      studentId,
      enrolment: null,
      totals: { present: 0, absent: 0, late: 0, marked: 0, percentage: null },
      months: [],
      recent: [],
    };
    if (!enrolment) {
      if (!actor.permissions.has(PERMISSIONS.ATTENDANCE_READ)) {
        throw new ForbiddenException(
          'Only the class teacher or the office can see this attendance',
        );
      }
      return empty;
    }
    await this.attendance.assertCanView(actor, enrolment.section);

    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentEnrolmentId: enrolment.id, sessionCode: 'FULL_DAY' },
      orderBy: { attendanceDate: 'desc' },
      select: { attendanceDate: true, status: true, remarks: true },
    });
    const totals = emptyTally();
    const byMonth = new Map<string, Tally>();
    for (const r of records) {
      add(totals, r.status);
      const m = isoDay(r.attendanceDate).slice(0, 7);
      const t = byMonth.get(m) ?? emptyTally();
      add(t, r.status);
      byMonth.set(m, t);
    }
    return {
      studentId,
      enrolment: {
        id: enrolment.id,
        className: enrolment.class.name,
        sectionName: enrolment.section.name,
        academicYear: { id: enrolment.academicYear.id, name: enrolment.academicYear.name },
      },
      totals: {
        ...totals,
        marked: marked(totals),
        percentage: attendancePercentage(totals.present, totals.late, marked(totals)),
      },
      months: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, t]) => ({
          month,
          ...t,
          marked: marked(t),
          percentage: attendancePercentage(t.present, t.late, marked(t)),
        })),
      recent: records
        .filter((r) => r.status !== 'PRESENT')
        .slice(0, 30)
        .map((r) => ({
          date: isoDay(r.attendanceDate),
          status: r.status as AttendanceStatus,
          remarks: r.remarks,
        })),
    };
  }
}
