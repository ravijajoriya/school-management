import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  type AttendanceSheet,
  type AttendanceSheetQuery,
  type AttendanceStatus,
  type MarkAttendanceData,
  type MarkAttendanceResult,
  type TeacherAttendanceSection,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, fullName, isoDay, schoolDate } from '../../common/utils/content.js';
import { AuditService } from '../audit/audit.service.js';
import { TeacherScopeService, byRollThenName } from '../academics/teacher-scope.service.js';

export const sectionInclude = {
  class: { select: { name: true, levelOrder: true } },
  academicYear: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
  classTeacher: { select: { id: true, firstName: true, lastName: true } },
} as const;

export type LoadedSection = Awaited<ReturnType<AttendanceService['loadSection']>>;

interface EditRights {
  canEdit: boolean;
  requiresReason: boolean;
  lockedReason: string | null;
}

/**
 * Daily attendance: one record per student enrolment, date and session (FULL_DAY).
 *
 * Who may write (ADR 0005):
 *  - the section's class teacher (attendance.mark_assigned), for today only;
 *  - the office (attendance.manage), any section and any past date — past dates need a reason.
 * Viewing needs attendance.read, or being the section's class teacher.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: TeacherScopeService,
  ) {}

  async loadSection(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: sectionInclude,
    });
    if (!section) throw new NotFoundException('Section not found');
    return section;
  }

  async isClassTeacher(actor: RequestUser, section: { classTeacherId: string | null }) {
    if (!section.classTeacherId) return false;
    return (await this.scope.employeeIdForUser(actor.id)) === section.classTeacherId;
  }

  /** Throws unless the actor may see this section's attendance. */
  async assertCanView(actor: RequestUser, section: { classTeacherId: string | null }) {
    if (actor.permissions.has(PERMISSIONS.ATTENDANCE_READ)) return;
    if (
      actor.permissions.has(PERMISSIONS.ATTENDANCE_MARK) &&
      (await this.isClassTeacher(actor, section))
    ) {
      return;
    }
    throw new ForbiddenException('Only the class teacher or the office can see this attendance');
  }

  assertDateInYear(section: LoadedSection, date: string) {
    const { startDate, endDate, name } = section.academicYear;
    if (date < isoDay(startDate) || date > isoDay(endDate)) {
      throw new BadRequestException([`date: This date is outside the ${name} academic year`]);
    }
  }

  private async editRights(
    actor: RequestUser,
    section: LoadedSection,
    date: string,
  ): Promise<EditRights> {
    const locked = (lockedReason: string): EditRights => ({
      canEdit: false,
      requiresReason: false,
      lockedReason,
    });
    const today = schoolDate();
    if (section.academicYear.status === 'CLOSED') {
      return locked(
        `${section.academicYear.name} is closed, so its attendance can no longer change.`,
      );
    }
    if (date > today) return locked('Attendance cannot be marked for a future date.');
    if (actor.permissions.has(PERMISSIONS.ATTENDANCE_MANAGE)) {
      return { canEdit: true, requiresReason: date < today, lockedReason: null };
    }
    if (
      actor.permissions.has(PERMISSIONS.ATTENDANCE_MARK) &&
      (await this.isClassTeacher(actor, section))
    ) {
      return date === today
        ? { canEdit: true, requiresReason: false, lockedReason: null }
        : locked('Only the office can change attendance for past days.');
    }
    return locked('Only the class teacher can mark this class.');
  }

  /** Enrolments that belonged to the section on `date` (joined on/before it, not yet left). */
  eligibleEnrolments(sectionId: string, date: string) {
    const day = dayToDate(date);
    return this.prisma.studentEnrolment.findMany({
      where: {
        sectionId,
        enrolmentDate: { lte: day },
        OR: [{ exitDate: null }, { exitDate: { gte: day } }],
      },
      select: {
        id: true,
        rollNumber: true,
        student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
      },
    });
  }

  async sheet(query: AttendanceSheetQuery, actor: RequestUser): Promise<AttendanceSheet> {
    const section = await this.loadSection(query.sectionId);
    await this.assertCanView(actor, section);
    this.assertDateInYear(section, query.date);
    const rights = await this.editRights(actor, section, query.date);

    const enrolments = await this.eligibleEnrolments(section.id, query.date);
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        studentEnrolmentId: { in: enrolments.map((e) => e.id) },
        attendanceDate: dayToDate(query.date),
        sessionCode: query.session,
      },
      include: {
        marker: { select: { fullName: true } },
        updater: { select: { fullName: true } },
      },
    });
    const byEnrolment = new Map(records.map((r) => [r.studentEnrolmentId, r]));

    const rows = enrolments
      .map((e) => {
        const r = byEnrolment.get(e.id);
        return {
          enrolmentId: e.id,
          studentId: e.student.id,
          rollNumber: e.rollNumber,
          fullName: fullName(e.student.firstName, e.student.middleName, e.student.lastName),
          status: (r?.status as AttendanceStatus | undefined) ?? null,
          remarks: r?.remarks ?? null,
          markedBy: r?.marker.fullName ?? null,
          markedAt: r?.markedAt.toISOString() ?? null,
          updatedBy: r?.updater?.fullName ?? null,
          updatedAt: r?.updatedAt?.toISOString() ?? null,
          correctionReason: r?.correctionReason ?? null,
        };
      })
      .sort(byRollThenName);

    const count = (s: AttendanceStatus) => rows.filter((r) => r.status === s).length;
    return {
      section: {
        id: section.id,
        className: section.class.name,
        sectionName: section.name,
        academicYear: {
          id: section.academicYear.id,
          name: section.academicYear.name,
          status: section.academicYear.status,
        },
        classTeacher: section.classTeacher
          ? {
              id: section.classTeacher.id,
              fullName: fullName(section.classTeacher.firstName, section.classTeacher.lastName),
            }
          : null,
      },
      date: query.date,
      session: query.session,
      isToday: query.date === schoolDate(),
      ...rights,
      summary: {
        total: rows.length,
        marked: rows.filter((r) => r.status).length,
        present: count('PRESENT'),
        absent: count('ABSENT'),
        late: count('LATE'),
      },
      rows,
    };
  }

  /**
   * Saves 1..n entries for one section and date. New rows are created; changed rows are updated
   * (who/when recorded, plus the reason for past dates); identical rows are left untouched.
   */
  async mark(
    input: MarkAttendanceData,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<MarkAttendanceResult> {
    const section = await this.loadSection(input.sectionId);
    await this.assertCanView(actor, section);
    this.assertDateInYear(section, input.date);
    const rights = await this.editRights(actor, section, input.date);
    if (!rights.canEdit) throw new ForbiddenException(rights.lockedReason);

    const reason = input.correctionReason?.trim() || null;
    if (rights.requiresReason && (!reason || reason.length < 5)) {
      throw new BadRequestException([
        'correctionReason: Give a reason for changing past attendance (at least 5 characters)',
      ]);
    }

    const eligible = new Map(
      (await this.eligibleEnrolments(section.id, input.date)).map((e) => [
        e.id,
        fullName(e.student.firstName, e.student.middleName, e.student.lastName),
      ]),
    );
    if (input.entries.some((e) => !eligible.has(e.enrolmentId))) {
      throw new BadRequestException([
        'entries: Some students are not enrolled in this section on this date',
      ]);
    }

    const day = dayToDate(input.date);
    return this.prisma.$transaction(async (tx) => {
      const existing = new Map(
        (
          await tx.attendanceRecord.findMany({
            where: {
              studentEnrolmentId: { in: input.entries.map((e) => e.enrolmentId) },
              attendanceDate: day,
              sessionCode: input.session,
            },
          })
        ).map((r) => [r.studentEnrolmentId, r]),
      );

      const now = new Date();
      const toCreate: typeof input.entries = [];
      const changes: { student: string; from: string; to: string; remarks: string | null }[] = [];
      let unchanged = 0;

      for (const entry of input.entries) {
        const current = existing.get(entry.enrolmentId);
        const remarks = entry.remarks ?? null;
        if (!current) {
          toCreate.push(entry);
        } else if (current.status === entry.status && (current.remarks ?? null) === remarks) {
          unchanged++;
        } else {
          await tx.attendanceRecord.update({
            where: { id: current.id },
            data: {
              status: entry.status,
              remarks,
              updatedBy: actor.id,
              updatedAt: now,
              correctionReason: rights.requiresReason ? reason : current.correctionReason,
            },
          });
          changes.push({
            student: eligible.get(entry.enrolmentId)!,
            from: current.status,
            to: entry.status,
            remarks,
          });
        }
      }

      if (toCreate.length) {
        await tx.attendanceRecord.createMany({
          data: toCreate.map((e) => ({
            studentEnrolmentId: e.enrolmentId,
            attendanceDate: day,
            sessionCode: input.session,
            status: e.status,
            remarks: e.remarks ?? null,
            markedBy: actor.id,
            markedAt: now,
            correctionReason: rights.requiresReason ? reason : null,
          })),
        });
      }

      if (toCreate.length || changes.length) {
        const tally = (s: AttendanceStatus) => input.entries.filter((e) => e.status === s).length;
        await this.audit.log(
          {
            action: rights.requiresReason
              ? AUDIT_ACTIONS.ATTENDANCE_CORRECTED
              : AUDIT_ACTIONS.ATTENDANCE_MARKED,
            entityType: 'section',
            entityId: section.id,
            userId: actor.id,
            before: changes.length
              ? { changed: changes.map((c) => ({ student: c.student, status: c.from })) }
              : null,
            after: {
              date: input.date,
              session: input.session,
              section: `${section.class.name} ${section.name}`,
              created: toCreate.length,
              updated: changes.length,
              present: tally('PRESENT'),
              absent: tally('ABSENT'),
              late: tally('LATE'),
              changed: changes.map((c) => ({ student: c.student, status: c.to })),
            },
            reason,
            context,
          },
          tx,
        );
      }

      return { created: toCreate.length, updated: changes.length, unchanged };
    });
  }

  /** Teacher portal: sections the user is class teacher of (current year) with today's progress. */
  async mySections(actor: RequestUser): Promise<TeacherAttendanceSection[]> {
    const employeeId = await this.scope.employeeIdForUser(actor.id);
    if (!employeeId) return [];
    const today = schoolDate();
    const sections = await this.prisma.section.findMany({
      where: { classTeacherId: employeeId, isActive: true, academicYear: { isActive: true } },
      include: sectionInclude,
      orderBy: [{ class: { levelOrder: 'asc' } }, { name: 'asc' }],
    });
    return Promise.all(
      sections.map(async (s) => {
        const enrolments = await this.eligibleEnrolments(s.id, today);
        const markedToday = await this.prisma.attendanceRecord.count({
          where: {
            studentEnrolmentId: { in: enrolments.map((e) => e.id) },
            attendanceDate: dayToDate(today),
            sessionCode: 'FULL_DAY',
          },
        });
        return {
          sectionId: s.id,
          className: s.class.name,
          sectionName: s.name,
          academicYear: { id: s.academicYear.id, name: s.academicYear.name },
          today,
          total: enrolments.length,
          markedToday,
        };
      }),
    );
  }
}
