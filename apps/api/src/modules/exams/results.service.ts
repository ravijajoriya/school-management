import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  attendancePercentage,
  divisionFor,
  type ExamStatus,
  type ExamType,
  type GradeBandItem,
  type ReportCard,
  type ResultStatus,
  type SectionResults,
  type StudentResult,
  type SubjectPerformance,
  type SubjectResult,
} from '@school/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { fullName, isoDay } from '../../common/utils/content.js';
import { TeacherScopeService, byRollThenName } from '../academics/teacher-scope.service.js';
import {
  examSubjectInclude,
  fromHundredths,
  gradeFor,
  passMarksOf,
  percentage,
  resolveScale,
  toBands,
  toHundredths,
} from './exams-core.js';

/**
 * Results are computed from marks every time (no stored copy). They are stable after
 * finalisation because FINAL marks and the scale of a finalised exam can never change.
 *
 * Rules (ADR 0007): a subject's components are added up; a component is passed when the marks
 * reach its pass mark (absent = not passed); the subject is passed when every component is.
 * The result is PASS when every subject is passed, INCOMPLETE while a core subject has no mark,
 * otherwise FAIL. Optional subjects with no marks are left out (the student did not take them).
 */
@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TeacherScopeService,
  ) {}

  private async assertCanView(actor: RequestUser, section: { classTeacherId: string | null }) {
    if (actor.permissions.has(PERMISSIONS.EXAMS_READ)) return;
    const employeeId = await this.scope.employeeIdForUser(actor.id);
    if (employeeId && section.classTeacherId === employeeId) return;
    throw new ForbiddenException('Only the class teacher or the office can see these results');
  }

  private async compute(examinationId: string, sectionId: string) {
    const exam = await this.prisma.examination.findUnique({
      where: { id: examinationId },
      include: {
        academicYear: { select: { name: true } },
        class: { select: { name: true } },
        subjects: { include: examSubjectInclude, orderBy: { sequenceNo: 'asc' } },
      },
    });
    if (!exam) throw new NotFoundException('Examination not found');
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (
      !section ||
      section.classId !== exam.classId ||
      section.academicYearId !== exam.academicYearId
    ) {
      throw new NotFoundException('This section is not part of the exam');
    }
    const scale = await resolveScale(this.prisma, exam);
    const bands: GradeBandItem[] = scale ? toBands(scale.bands) : [];
    const subjectIds = exam.subjects.map((s) => s.id);
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: {
        sectionId,
        OR: [
          { status: 'ACTIVE' },
          { markEntries: { some: { examSubjectId: { in: subjectIds } } } },
        ],
      },
      select: {
        id: true,
        rollNumber: true,
        student: { select: { id: true, firstName: true, middleName: true, lastName: true } },
        markEntries: { where: { examSubjectId: { in: subjectIds } } },
      },
    });

    // Group exam rows (components) by class subject, keeping exam order.
    const groups = new Map<string, typeof exam.subjects>();
    for (const s of exam.subjects)
      groups.set(s.classSubjectId, [...(groups.get(s.classSubjectId) ?? []), s]);

    const students: StudentResult[] = enrolments.map((e) => {
      const byExamSubject = new Map(e.markEntries.map((m) => [m.examSubjectId, m]));
      const subjects: SubjectResult[] = [];
      for (const [classSubjectId, comps] of groups) {
        const optional = comps[0].classSubject.subjectType === 'OPTIONAL';
        const components = comps.map((c) => {
          const m = byExamSubject.get(c.id);
          const obtained = m && !m.isAbsent ? toHundredths(m.marksObtained) : null;
          const pass = passMarksOf(c);
          return {
            name: c.componentName,
            max: toHundredths(c.maxMarks)!,
            pass,
            obtained,
            absent: m?.isAbsent ?? false,
            entered: !!m,
            passed: obtained !== null && obtained >= pass,
          };
        });
        const anyEntered = components.some((c) => c.entered);
        if (optional && !anyEntered) continue; // not taken
        const obtained = components.reduce((s, c) => s + (c.obtained ?? 0), 0);
        const max = components.reduce((s, c) => s + c.max, 0);
        const pct = percentage(obtained, max);
        subjects.push({
          classSubjectId,
          subjectName: comps[0].classSubject.subject.name,
          optional,
          components: components.map((c) => ({
            name: c.name,
            max: fromHundredths(c.max),
            pass: fromHundredths(c.pass),
            obtained: c.obtained === null ? null : fromHundredths(c.obtained),
            absent: c.absent,
            passed: c.passed,
          })),
          obtained: fromHundredths(obtained),
          max: fromHundredths(max),
          percentage: pct,
          grade: gradeFor(bands, pct),
          passed: components.every((c) => c.passed),
          missing: components.some((c) => !c.entered),
        });
      }
      const obtained = subjects.reduce((s, x) => s + Math.round(x.obtained * 100), 0);
      const max = subjects.reduce((s, x) => s + Math.round(x.max * 100), 0);
      const pct = percentage(obtained, max);
      const result: ResultStatus = subjects.some((s) => s.missing)
        ? 'INCOMPLETE'
        : subjects.length && subjects.every((s) => s.passed)
          ? 'PASS'
          : 'FAIL';
      return {
        enrolmentId: e.id,
        studentId: e.student.id,
        rollNumber: e.rollNumber,
        fullName: fullName(e.student.firstName, e.student.middleName, e.student.lastName),
        subjects,
        obtained: fromHundredths(obtained),
        max: fromHundredths(max),
        percentage: pct,
        grade: max ? gradeFor(bands, pct) : null,
        result,
        division: result === 'PASS' ? divisionFor(pct) : null,
        rank: null,
      };
    });

    // Rank passed students by percentage; equal percentages share a rank (1, 2, 2, 4).
    const ranked = students
      .filter((s) => s.result === 'PASS')
      .sort((a, b) => b.percentage - a.percentage);
    ranked.forEach((s, i) => {
      s.rank = i > 0 && ranked[i - 1].percentage === s.percentage ? ranked[i - 1].rank : i + 1;
    });
    students.sort(byRollThenName);
    return { exam, section, scale, bands, students };
  }

  async sectionResults(
    examinationId: string,
    sectionId: string,
    actor: RequestUser,
  ): Promise<SectionResults> {
    const { exam, section, scale, students } = await this.compute(examinationId, sectionId);
    await this.assertCanView(actor, section);
    const subjectNames = new Map<string, string>();
    exam.subjects.forEach((s) => subjectNames.set(s.classSubjectId, s.classSubject.subject.name));
    const subjects: SubjectPerformance[] = [...subjectNames.entries()].map(
      ([classSubjectId, subjectName]) => {
        const rows = students.flatMap((s) =>
          s.subjects.filter((x) => x.classSubjectId === classSubjectId && !x.missing),
        );
        const pcts = rows.map((r) => r.percentage);
        const distribution: Record<string, number> = {};
        rows.forEach((r) => {
          if (r.grade) distribution[r.grade] = (distribution[r.grade] ?? 0) + 1;
        });
        const passed = rows.filter((r) => r.passed).length;
        return {
          classSubjectId,
          subjectName,
          appeared: rows.length,
          passed,
          passPercent: rows.length ? Math.round((passed / rows.length) * 1000) / 10 : null,
          average: pcts.length
            ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100
            : null,
          highest: pcts.length ? Math.max(...pcts) : null,
          lowest: pcts.length ? Math.min(...pcts) : null,
          gradeDistribution: distribution,
        };
      },
    );
    const complete = students.filter((s) => s.result !== 'INCOMPLETE');
    const passed = students.filter((s) => s.result === 'PASS').length;
    return {
      exam: {
        id: exam.id,
        name: exam.name,
        examType: exam.examType as ExamType,
        status: exam.status as ExamStatus,
        final: exam.status === 'FINALIZED',
      },
      section: {
        id: section.id,
        className: exam.class.name,
        sectionName: section.name,
        academicYear: exam.academicYear.name,
      },
      gradingScale: scale ? { id: scale.id, name: scale.name } : null,
      students,
      subjects,
      overall: {
        students: students.length,
        passed,
        failed: students.filter((s) => s.result === 'FAIL').length,
        incomplete: students.length - complete.length,
        passPercent: complete.length ? Math.round((passed / complete.length) * 1000) / 10 : null,
        average: complete.length
          ? Math.round((complete.reduce((a, s) => a + s.percentage, 0) / complete.length) * 100) /
            100
          : null,
      },
    };
  }

  async reportCard(
    examinationId: string,
    enrolmentId: string,
    actor: RequestUser,
  ): Promise<ReportCard> {
    const enrolment = await this.prisma.studentEnrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        student: { include: { guardians: { where: { isPrimary: true }, take: 1 } } },
        section: { include: { classTeacher: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!enrolment) throw new NotFoundException('Enrolment not found');
    const { exam, section, students } = await this.compute(examinationId, enrolment.sectionId);
    await this.assertCanView(actor, section);
    const result = students.find((s) => s.enrolmentId === enrolmentId);
    if (!result) throw new NotFoundException('This student has no result for the exam');

    const att = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        studentEnrolmentId: enrolmentId,
        sessionCode: 'FULL_DAY',
        ...(exam.endDate ? { attendanceDate: { lte: exam.endDate } } : {}),
      },
      _count: true,
    });
    const n = (s: string) => att.find((a) => a.status === s)?._count ?? 0;
    const marked = n('PRESENT') + n('ABSENT') + n('LATE');
    const page = await this.prisma.websitePage.findUnique({ where: { pageKey: 'site' } });
    const site = (page?.publishedContentJson ?? page?.contentJson ?? {}) as Record<string, string>;
    const s = enrolment.student;
    return {
      school: {
        name: site.schoolName || 'School',
        address: site.address || '',
        phone: site.phone || '',
        email: site.email || '',
      },
      exam: {
        id: exam.id,
        name: exam.name,
        examType: exam.examType as ExamType,
        status: exam.status as ExamStatus,
        final: exam.status === 'FINALIZED',
      },
      student: {
        name: fullName(s.firstName, s.middleName, s.lastName),
        admissionNumber: s.admissionNumber,
        dateOfBirth: isoDay(s.dateOfBirth),
        guardianName: s.guardians[0]?.fullName ?? null,
      },
      enrolment: {
        className: exam.class.name,
        sectionName: section.name,
        rollNumber: enrolment.rollNumber,
        academicYear: exam.academicYear.name,
      },
      classTeacher: enrolment.section.classTeacher
        ? fullName(
            enrolment.section.classTeacher.firstName,
            enrolment.section.classTeacher.lastName,
          )
        : null,
      result,
      sectionSize: students.length,
      attendance: marked
        ? {
            present: n('PRESENT') + n('LATE'),
            marked,
            percentage: attendancePercentage(n('PRESENT'), n('LATE'), marked),
          }
        : null,
    };
  }
}
