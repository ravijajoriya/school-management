import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  type DashboardOverview,
  type PermissionCode,
  type StrengthReport,
  type StrengthRow,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDay, schoolDate } from '../../common/utils/content.js';
import { rupees, toPaise } from '../../common/utils/money.js';
import { EnquiriesService } from '../admissions/enquiries.service.js';
import { AttendanceReportsService } from '../attendance/attendance-reports.service.js';
import { ContactMessagesService } from '../contact/contact-messages.service.js';
import { FeeReportsService } from '../fees/fee-reports.service.js';
import { LeaveService } from '../leave/leave.service.js';

const addDays = (day: string, n: number) =>
  isoDay(new Date(dayToDate(day).getTime() + n * 86_400_000));

/**
 * Cross-module summaries: the admin dashboard (one request, each section only for users who may
 * see it) and the class strength report.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceReportsService,
    private readonly fees: FeeReportsService,
    private readonly leave: LeaveService,
    private readonly enquiries: EnquiriesService,
    private readonly messages: ContactMessagesService,
  ) {}

  async dashboard(actor: RequestUser): Promise<DashboardOverview> {
    const can = (p: PermissionCode) => actor.permissions.has(p);
    const when = <T>(p: PermissionCode, load: () => Promise<T>) =>
      can(p) ? load() : Promise.resolve(null);
    const today = schoolDate();
    const [
      students,
      attendance,
      fees,
      leave,
      enquiries,
      unreadMessages,
      exams,
      complaints,
      meetings,
      transport,
      inventory,
      payroll,
    ] = await Promise.all([
      when(PERMISSIONS.STUDENTS_READ, () => this.studentCounts(today)),
      when(PERMISSIONS.ATTENDANCE_READ, async () => {
        const d = await this.attendance.daily(today);
        return d.academicYear
          ? {
              percentage: d.totals.percentage,
              sectionsNotMarked: d.sectionsNotMarked,
              sections: d.rows.length,
            }
          : null;
      }),
      when(PERMISSIONS.FEES_READ, () => this.fees.summary()),
      when(PERMISSIONS.LEAVE_READ, () => this.leave.summary()),
      when(PERMISSIONS.ENQUIRIES_READ, () => this.enquiries.summary()),
      when(PERMISSIONS.CONTACT_MESSAGES_MANAGE, () => this.messages.countNew()),
      when(PERMISSIONS.EXAMS_READ, async () => ({
        marksAwaitingApproval: await this.prisma.markEntry.count({
          where: { status: 'SUBMITTED' },
        }),
        examsInMarksEntry: await this.prisma.examination.count({
          where: { status: 'MARKS_ENTRY' },
        }),
      })),
      when(PERMISSIONS.COMPLAINTS_READ, async () => ({
        open: await this.prisma.complaint.count({ where: { status: 'OPEN' } }),
        inProgress: await this.prisma.complaint.count({ where: { status: 'IN_PROGRESS' } }),
      })),
      when(PERMISSIONS.MEETINGS_READ, async () => ({
        next7Days: await this.prisma.parentTeacherMeeting.count({
          where: {
            status: 'SCHEDULED',
            meetingAt: { gte: new Date(), lt: new Date(Date.now() + 7 * 86_400_000) },
          },
        }),
      })),
      when(PERMISSIONS.TRANSPORT_READ, async () => {
        const soon = dayToDate(addDays(today, 30));
        return {
          riders: await this.prisma.studentTransport.count({
            where: {
              startDate: { lte: dayToDate(today) },
              OR: [{ endDate: null }, { endDate: { gte: dayToDate(today) } }],
            },
          }),
          vehiclesDue: await this.prisma.vehicle.count({
            where: {
              status: 'ACTIVE',
              OR: [{ insuranceExpiry: { lte: soon } }, { permitExpiry: { lte: soon } }],
            },
          }),
        };
      }),
      when(PERMISSIONS.INVENTORY_READ, async () => ({
        needsAttention: await this.prisma.inventoryItem.count({
          where: { conditionStatus: { in: ['NEEDS_REPAIR', 'DAMAGED'] } },
        }),
      })),
      when(PERMISSIONS.PAYROLL_READ, async () => {
        const month = today.slice(0, 7);
        const run = await this.prisma.payrollRun.findUnique({
          where: { periodStart: dayToDate(`${month}-01`) },
          include: { records: { select: { netAmount: true } } },
        });
        return {
          month,
          status: run?.status ?? null,
          net: run ? rupees(run.records.reduce((n, r) => n + toPaise(r.netAmount), 0)) : null,
        };
      }),
    ]);
    return {
      today,
      students,
      attendance,
      fees,
      leave,
      enquiries,
      unreadMessages,
      exams,
      complaints,
      meetings,
      transport,
      inventory,
      payroll,
    };
  }

  private async studentCounts(today: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) return { active: 0, newThisMonth: 0, academicYear: null };
    const [active, newThisMonth] = await Promise.all([
      this.prisma.studentEnrolment.count({ where: { academicYearId: year.id, status: 'ACTIVE' } }),
      this.prisma.studentEnrolment.count({
        where: {
          academicYearId: year.id,
          enrolmentDate: { gte: dayToDate(`${today.slice(0, 7)}-01`) },
          previousEnrolmentId: null,
        },
      }),
    ]);
    return { active, newThisMonth, academicYear: year.name };
  }

  /** Boys/girls per section, joiners and leavers this year, and transport riders. */
  async strength(academicYearId?: string): Promise<StrengthReport> {
    const year = academicYearId
      ? await this.prisma.academicYear.findUnique({ where: { id: academicYearId } })
      : await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    const empty = {
      boys: 0,
      girls: 0,
      other: 0,
      total: 0,
      newAdmissions: 0,
      left: 0,
      transport: 0,
    };
    if (!year) return { academicYear: null, rows: [], totals: empty };
    const today = schoolDate();
    const sections = await this.prisma.section.findMany({
      where: { academicYearId: year.id },
      include: {
        class: { select: { name: true, levelOrder: true } },
        classTeacher: { select: { firstName: true, lastName: true } },
        enrolments: {
          select: {
            status: true,
            enrolmentDate: true,
            previousEnrolmentId: true,
            student: { select: { gender: true } },
            transport: {
              where: {
                startDate: { lte: dayToDate(today) },
                OR: [{ endDate: null }, { endDate: { gte: dayToDate(today) } }],
              },
              select: { id: true },
            },
          },
        },
      },
      orderBy: [{ class: { levelOrder: 'asc' } }, { name: 'asc' }],
    });
    const rows: StrengthRow[] = sections.map((s) => {
      const current = s.enrolments.filter((e) => e.status === 'ACTIVE');
      return {
        sectionId: s.id,
        className: s.class.name,
        sectionName: s.name,
        classTeacher: s.classTeacher
          ? fullName(s.classTeacher.firstName, s.classTeacher.lastName)
          : null,
        capacity: s.capacity,
        boys: current.filter((e) => e.student.gender === 'MALE').length,
        girls: current.filter((e) => e.student.gender === 'FEMALE').length,
        other: current.filter((e) => e.student.gender !== 'MALE' && e.student.gender !== 'FEMALE')
          .length,
        total: current.length,
        newAdmissions: s.enrolments.filter(
          (e) => !e.previousEnrolmentId && e.enrolmentDate > year.startDate,
        ).length,
        left: s.enrolments.filter((e) => e.status === 'TRANSFERRED' || e.status === 'WITHDRAWN')
          .length,
        transport: current.filter((e) => e.transport.length > 0).length,
      };
    });
    const totals = rows.reduce(
      (t, r) => ({
        boys: t.boys + r.boys,
        girls: t.girls + r.girls,
        other: t.other + r.other,
        total: t.total + r.total,
        newAdmissions: t.newAdmissions + r.newAdmissions,
        left: t.left + r.left,
        transport: t.transport + r.transport,
      }),
      empty,
    );
    return { academicYear: { id: year.id, name: year.name }, rows, totals };
  }
}
