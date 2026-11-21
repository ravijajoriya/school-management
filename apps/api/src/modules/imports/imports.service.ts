import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTIONS,
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  PERMISSIONS,
  createEmployeeSchema,
  createStudentSchema,
  formatRupees,
  positiveMoneySchema,
  type ImportHistoryItem,
  type ImportResult,
  type ImportRowError,
  type ImportType,
  type PermissionCode,
} from '@school/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, isoDay, schoolDate } from '../../common/utils/content.js';
import { paiseToDb, rupees, sumPaise, toPaise } from '../../common/utils/money.js';
import { AuditService } from '../audit/audit.service.js';
import { normaliseDate, readSheet, type SheetRow } from './spreadsheet.js';

type Tx = Prisma.TransactionClient;
const TX = { timeout: 180_000, maxWait: 15_000 };

/** Extra permission each import needs on top of data_import.run. */
const NEEDS: Record<ImportType, PermissionCode> = {
  students: PERMISSIONS.STUDENTS_MANAGE,
  staff: PERMISSIONS.EMPLOYEES_MANAGE,
  'opening-balances': PERMISSIONS.FEES_CONFIGURE,
};

/** Zod path of the student schema → spreadsheet column. */
const STUDENT_COLUMN: Record<string, string> = {
  admissionNumber: 'admission_number',
  firstName: 'first_name',
  middleName: 'middle_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  gender: 'gender',
  bloodGroup: 'blood_group',
  addressLine1: 'address',
  city: 'city',
  state: 'state',
  postalCode: 'pin_code',
  'enrolment.sectionId': 'section',
  'enrolment.rollNumber': 'roll_number',
  'enrolment.enrolmentDate': 'enrolment_date',
  'guardians.0.fullName': 'guardian_name',
  'guardians.0.relationship': 'guardian_relationship',
  'guardians.0.phone': 'guardian_phone',
  'guardians.0.email': 'guardian_email',
  'guardians.1.fullName': 'second_guardian_name',
  'guardians.1.relationship': 'second_guardian_relationship',
  'guardians.1.phone': 'second_guardian_phone',
};
const STAFF_COLUMN: Record<string, string> = {
  employeeCode: 'employee_code',
  firstName: 'first_name',
  lastName: 'last_name',
  designation: 'designation',
  department: 'department',
  joiningDate: 'joining_date',
  dateOfBirth: 'date_of_birth',
  phone: 'phone',
  email: 'email',
  employmentType: 'employment_type',
};

const GENDER: Record<string, string> = {
  m: 'MALE',
  male: 'MALE',
  f: 'FEMALE',
  female: 'FEMALE',
  o: 'OTHER',
  other: 'OTHER',
};
const upper = (v: string) => v.trim().toUpperCase().replace(/\s+/g, '_');
const blank = (v: string | undefined) => v ?? '';

/** Clearer messages for "pick one of" columns, using the column's description. */
function issueMessage(
  type: ImportType,
  column: string | null,
  issue: { code: string; message: string },
) {
  const desc = column
    ? IMPORT_COLUMNS[type].find((c) => c.name === column)?.description
    : undefined;
  const choice = ['invalid_value', 'invalid_union', 'invalid_enum_value'].includes(issue.code);
  return choice && desc ? `Use ${desc}` : issue.message;
}

interface Prepared<T> {
  rows: { row: number; data: T }[];
  errors: ImportRowError[];
  /** File-side totals for the reconciliation report. */
  fileTotals: Record<string, number>;
}

/**
 * Spreadsheet imports for go-live (ADR 0009). Every import is validated in full first (a dry run
 * by default) and then committed all-or-nothing in one transaction, using the same validation
 * schemas as the screens. The result includes a reconciliation of file totals against the
 * database, and the commit is recorded in the audit log.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  assertAllowed(type: ImportType, actor: RequestUser) {
    if (!actor.permissions.has(PERMISSIONS.DATA_IMPORT) || !actor.permissions.has(NEEDS[type]))
      throw new ForbiddenException('You do not have permission to run this import');
  }

  /** CSV with the header row and one example row. */
  template(type: ImportType): Buffer {
    const cols = IMPORT_COLUMNS[type];
    const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    return Buffer.from(
      `﻿${cols.map((c) => c.name).join(',')}\r\n${cols.map((c) => q(c.example)).join(',')}\r\n`,
      'utf8',
    );
  }

  async run(
    type: ImportType,
    file: { buffer: Buffer; originalname: string } | undefined,
    dryRun: boolean,
    actor: RequestUser,
    context: RequestContext,
  ): Promise<ImportResult> {
    this.assertAllowed(type, actor);
    if (!file?.buffer?.length) throw new BadRequestException(['file: Choose a .csv or .xlsx file']);
    let sheet: Awaited<ReturnType<typeof readSheet>>;
    try {
      sheet = await readSheet(file.buffer, file.originalname);
    } catch {
      throw new BadRequestException([
        'file: The file could not be read. Save it as .csv or .xlsx and try again.',
      ]);
    }
    const missing = IMPORT_COLUMNS[type]
      .filter((c) => c.required && !sheet.headers.includes(c.name))
      .map((c) => c.name);
    if (missing.length)
      throw new BadRequestException([
        `file: Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      ]);
    if (!sheet.rows.length) throw new BadRequestException(['file: The file has no data rows']);
    if (sheet.rows.length > MAX_IMPORT_ROWS)
      throw new BadRequestException([
        `file: At most ${MAX_IMPORT_ROWS} rows per import; split the file`,
      ]);

    const base = { type, fileName: file.originalname, dryRun, totalRows: sheet.rows.length };
    switch (type) {
      case 'students': {
        const p = await this.prepareStudents(sheet.rows);
        return this.finish(
          base,
          p,
          dryRun,
          actor,
          context,
          (tx) => this.commitStudents(tx, p.rows),
          (ids) => this.reconcileStudents(p, ids),
        );
      }
      case 'staff': {
        const p = await this.prepareStaff(sheet.rows);
        return this.finish(
          base,
          p,
          dryRun,
          actor,
          context,
          (tx) => this.commitStaff(tx, p.rows),
          (ids) => this.reconcileStaff(p, ids),
        );
      }
      case 'opening-balances': {
        const p = await this.prepareBalances(sheet.rows);
        return this.finish(
          base,
          p,
          dryRun,
          actor,
          context,
          (tx) => this.commitBalances(tx, p.rows),
          (ids) => this.reconcileBalances(p, ids),
        );
      }
    }
  }

  private async finish<T>(
    base: Pick<ImportResult, 'type' | 'fileName' | 'dryRun' | 'totalRows'>,
    p: Prepared<T>,
    dryRun: boolean,
    actor: RequestUser,
    context: RequestContext,
    commit: (tx: Tx) => Promise<string[]>,
    reconcile: (ids: string[] | null) => Promise<ImportResult['reconciliation']>,
  ): Promise<ImportResult> {
    const errors = p.errors.sort((a, b) => a.row - b.row);
    if (dryRun || errors.length) {
      return {
        ...base,
        validRows: p.rows.length,
        errors,
        created: 0,
        reconciliation: await reconcile(null),
      };
    }
    const ids = await this.prisma.$transaction(async (tx) => {
      const created = await commit(tx);
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.DATA_IMPORT_COMMITTED,
          entityType: 'data_import',
          userId: actor.id,
          after: {
            type: base.type,
            fileName: base.fileName,
            rows: base.totalRows,
            created: created.length,
            fileTotals: p.fileTotals,
          },
          context,
        },
        tx,
      );
      return created;
    }, TX);
    return {
      ...base,
      validRows: p.rows.length,
      errors: [],
      created: ids.length,
      reconciliation: await reconcile(ids),
    };
  }

  private async currentYear() {
    const year = await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year)
      throw new BadRequestException(
        'Set the current academic year (Academics → Academic years) before importing',
      );
    return year;
  }

  // --- Students ------------------------------------------------------------------------------

  private async prepareStudents(rows: SheetRow[]) {
    const year = await this.currentYear();
    const classes = await this.prisma.class.findMany();
    const sections = await this.prisma.section.findMany({
      where: { academicYearId: year.id },
      include: { class: { select: { name: true } } },
    });
    const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const classByKey = new Map<string, (typeof classes)[number]>();
    for (const c of classes) {
      classByKey.set(key(c.name), c);
      const n = /^class\s*(\d+)$/i.exec(c.name);
      if (n) classByKey.set(n[1], c);
    }
    const yearStart = isoDay(year.startDate);
    const defaultEnrolment = yearStart > schoolDate() ? schoolDate() : yearStart;

    const errors: ImportRowError[] = [];
    const out: Prepared<ReturnType<typeof createStudentSchema.parse> & { label: string }>['rows'] =
      [];
    for (const { row, values: v } of rows) {
      const cls = classByKey.get(key(blank(v.class)));
      const section =
        cls &&
        sections.find(
          (s) => s.classId === cls.id && s.name.toLowerCase() === blank(v.section).toLowerCase(),
        );
      if (!cls) errors.push({ row, column: 'class', message: `Unknown class "${blank(v.class)}"` });
      else if (!section)
        errors.push({
          row,
          column: 'section',
          message: `${cls.name} has no section "${blank(v.section)}" in ${year.name}`,
        });
      const guardians = [
        {
          fullName: blank(v.guardian_name),
          relationship: upper(blank(v.guardian_relationship)),
          phone: blank(v.guardian_phone),
          email: blank(v.guardian_email),
          isPrimary: true,
        },
        ...(v.second_guardian_name
          ? [
              {
                fullName: v.second_guardian_name,
                relationship: upper(blank(v.second_guardian_relationship)),
                phone: blank(v.second_guardian_phone),
                isPrimary: false,
              },
            ]
          : []),
      ];
      const parsed = createStudentSchema.safeParse({
        admissionNumber: blank(v.admission_number),
        firstName: blank(v.first_name),
        middleName: blank(v.middle_name),
        lastName: blank(v.last_name),
        dateOfBirth: normaliseDate(blank(v.date_of_birth)),
        gender: v.gender ? (GENDER[v.gender.trim().toLowerCase()] ?? v.gender.toUpperCase()) : '',
        bloodGroup: blank(v.blood_group).toUpperCase().replace(/\s/g, ''),
        addressLine1: blank(v.address),
        city: blank(v.city),
        state: blank(v.state),
        postalCode: blank(v.pin_code),
        guardians,
        enrolment: section
          ? {
              academicYearId: year.id,
              sectionId: section.id,
              rollNumber: blank(v.roll_number),
              enrolmentDate: v.enrolment_date ? normaliseDate(v.enrolment_date) : defaultEnrolment,
            }
          : undefined,
      });
      if (!parsed.success) {
        for (const i of parsed.error.issues) {
          const column = STUDENT_COLUMN[i.path.join('.')] ?? null;
          errors.push({ row, column, message: issueMessage('students', column, i) });
        }
        continue;
      }
      if (section)
        out.push({
          row,
          data: { ...parsed.data, label: `${section.class.name} – ${section.name}` },
        });
    }

    // Duplicates inside the file and against the database.
    const seenAdm = new Map<string, number>();
    const seenRoll = new Map<string, number>();
    for (const r of out) {
      const adm = r.data.admissionNumber;
      if (adm) {
        if (seenAdm.has(adm))
          errors.push({
            row: r.row,
            column: 'admission_number',
            message: `Same admission number as row ${seenAdm.get(adm)}`,
          });
        else seenAdm.set(adm, r.row);
      }
      const roll = r.data.enrolment?.rollNumber;
      if (roll) {
        const k = `${r.data.enrolment!.sectionId}|${roll}`;
        if (seenRoll.has(k))
          errors.push({
            row: r.row,
            column: 'roll_number',
            message: `Same roll number as row ${seenRoll.get(k)} in ${r.data.label}`,
          });
        else seenRoll.set(k, r.row);
      }
    }
    const existingAdm = await this.prisma.student.findMany({
      where: { admissionNumber: { in: [...seenAdm.keys()] } },
      select: { admissionNumber: true },
    });
    for (const e of existingAdm)
      errors.push({
        row: seenAdm.get(e.admissionNumber)!,
        column: 'admission_number',
        message: `${e.admissionNumber} already exists in the system`,
      });
    const rollRows = out.filter((r) => r.data.enrolment?.rollNumber);
    if (rollRows.length) {
      const taken = await this.prisma.studentEnrolment.findMany({
        where: {
          OR: rollRows.map((r) => ({
            sectionId: r.data.enrolment!.sectionId,
            rollNumber: r.data.enrolment!.rollNumber,
          })),
        },
        select: { sectionId: true, rollNumber: true },
      });
      for (const t of taken) {
        const r = rollRows.find(
          (x) =>
            x.data.enrolment!.sectionId === t.sectionId &&
            x.data.enrolment!.rollNumber === t.rollNumber,
        )!;
        errors.push({
          row: r.row,
          column: 'roll_number',
          message: `Roll number ${t.rollNumber} is already used in ${r.data.label}`,
        });
      }
    }
    const perSection: Record<string, number> = {};
    for (const r of out) perSection[r.data.label] = (perSection[r.data.label] ?? 0) + 1;
    return {
      rows: out,
      errors,
      fileTotals: {
        students: rows.length,
        guardians: out.reduce((n, r) => n + r.data.guardians.length, 0),
        ...perSection,
      },
    };
  }

  private async commitStudents(
    tx: Tx,
    rows: Awaited<ReturnType<ImportsService['prepareStudents']>>['rows'],
  ) {
    const ids: string[] = [];
    const year = schoolDate().slice(0, 4);
    for (const { data } of rows) {
      let admissionNumber = data.admissionNumber;
      if (!admissionNumber) {
        const [{ n }] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval('student_admission_number_seq') AS n`;
        admissionNumber = `ADM-${year}-${String(n).padStart(5, '0')}`;
      }
      const student = await tx.student.create({
        data: {
          admissionNumber,
          firstName: data.firstName,
          middleName: data.middleName ?? null,
          lastName: data.lastName ?? null,
          dateOfBirth: dayToDate(data.dateOfBirth),
          gender: data.gender ?? null,
          bloodGroup: data.bloodGroup ?? null,
          addressLine1: data.addressLine1 ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          postalCode: data.postalCode ?? null,
          guardians: {
            create: data.guardians.map((g) => ({
              fullName: g.fullName,
              relationship: g.relationship,
              phone: g.phone,
              email: g.email ?? null,
              isPrimary: g.isPrimary,
            })),
          },
        },
      });
      const e = data.enrolment!;
      const section = await tx.section.findUniqueOrThrow({
        where: { id: e.sectionId },
        select: { classId: true },
      });
      await tx.studentEnrolment.create({
        data: {
          studentId: student.id,
          academicYearId: e.academicYearId,
          classId: section.classId,
          sectionId: e.sectionId,
          rollNumber: e.rollNumber ?? null,
          enrolmentDate: dayToDate(e.enrolmentDate),
        },
      });
      ids.push(student.id);
    }
    return ids;
  }

  private async reconcileStudents(
    p: Awaited<ReturnType<ImportsService['prepareStudents']>>,
    ids: string[] | null,
  ) {
    const { students: fileStudents, guardians: fileGuardians, ...perSection } = p.fileTotals;
    const created = ids ?? [];
    const [guardians, enrolments] = ids
      ? await Promise.all([
          this.prisma.studentGuardian.count({ where: { studentId: { in: created } } }),
          this.prisma.studentEnrolment.findMany({
            where: { studentId: { in: created } },
            include: { class: { select: { name: true } }, section: { select: { name: true } } },
          }),
        ])
      : [0, []];
    const sys = (n: number) => (ids ? n : '—');
    return [
      {
        label: 'Students',
        file: fileStudents,
        system: sys(created.length),
        ok: !ids || created.length === fileStudents,
      },
      {
        label: 'Parents / guardians',
        file: fileGuardians,
        system: sys(guardians),
        ok: !ids || guardians === fileGuardians,
      },
      ...Object.entries(perSection as Record<string, number>).map(([label, n]) => {
        const got = enrolments.filter(
          (e) => `${e.class.name} – ${e.section.name}` === label,
        ).length;
        return { label, file: n, system: sys(got), ok: !ids || got === n };
      }),
    ];
  }

  // --- Staff ---------------------------------------------------------------------------------

  private async prepareStaff(rows: SheetRow[]) {
    const errors: ImportRowError[] = [];
    const out: { row: number; data: ReturnType<typeof createEmployeeSchema.parse> }[] = [];
    for (const { row, values: v } of rows) {
      const parsed = createEmployeeSchema.safeParse({
        employeeCode: blank(v.employee_code),
        firstName: blank(v.first_name),
        lastName: blank(v.last_name),
        designation: blank(v.designation),
        department: blank(v.department),
        joiningDate: normaliseDate(blank(v.joining_date)),
        dateOfBirth: v.date_of_birth ? normaliseDate(v.date_of_birth) : '',
        phone: blank(v.phone),
        email: blank(v.email),
        employmentType: v.employment_type ? upper(v.employment_type) : '',
      });
      if (!parsed.success) {
        for (const i of parsed.error.issues) {
          const column = STAFF_COLUMN[i.path.join('.')] ?? null;
          errors.push({ row, column, message: issueMessage('staff', column, i) });
        }
        continue;
      }
      out.push({ row, data: parsed.data });
    }
    const seen = new Map<string, number>();
    for (const r of out) {
      const code = r.data.employeeCode;
      if (!code) continue;
      if (seen.has(code))
        errors.push({
          row: r.row,
          column: 'employee_code',
          message: `Same employee code as row ${seen.get(code)}`,
        });
      else seen.set(code, r.row);
    }
    const existing = await this.prisma.employee.findMany({
      where: { employeeCode: { in: [...seen.keys()] } },
      select: { employeeCode: true },
    });
    for (const e of existing)
      errors.push({
        row: seen.get(e.employeeCode)!,
        column: 'employee_code',
        message: `${e.employeeCode} already exists in the system`,
      });
    return { rows: out, errors, fileTotals: { staff: rows.length } };
  }

  private async commitStaff(
    tx: Tx,
    rows: Awaited<ReturnType<ImportsService['prepareStaff']>>['rows'],
  ) {
    const ids: string[] = [];
    for (const { data } of rows) {
      let employeeCode = data.employeeCode;
      if (!employeeCode) {
        const [{ n }] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval('employee_code_seq') AS n`;
        employeeCode = `EMP-${String(n).padStart(4, '0')}`;
      }
      const e = await tx.employee.create({
        data: {
          employeeCode,
          firstName: data.firstName,
          lastName: data.lastName ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          dateOfBirth: data.dateOfBirth ? dayToDate(data.dateOfBirth) : null,
          joiningDate: dayToDate(data.joiningDate),
          designation: data.designation,
          department: data.department ?? null,
          employmentType: data.employmentType ?? null,
          status: data.status,
        },
      });
      ids.push(e.id);
    }
    return ids;
  }

  private async reconcileStaff(p: { fileTotals: Record<string, number> }, ids: string[] | null) {
    const n = ids ? await this.prisma.employee.count({ where: { id: { in: ids } } }) : null;
    return [
      {
        label: 'Staff',
        file: p.fileTotals.staff,
        system: n ?? '—',
        ok: n === null || n === p.fileTotals.staff,
      },
    ];
  }

  // --- Opening balances ----------------------------------------------------------------------

  private async prepareBalances(rows: SheetRow[]) {
    const year = await this.currentYear();
    const errors: ImportRowError[] = [];
    const parsedRows: {
      row: number;
      admissionNumber: string;
      amount: number;
      description: string;
      dueDate: string | null;
    }[] = [];
    for (const { row, values: v } of rows) {
      const admissionNumber = blank(v.admission_number).toUpperCase();
      const amount = positiveMoneySchema.safeParse(blank(v.amount).replace(/[₹,\s]/g, ''));
      const dueDate = v.due_date ? normaliseDate(v.due_date) : null;
      if (!admissionNumber)
        errors.push({ row, column: 'admission_number', message: 'Enter the admission number' });
      if (!amount.success)
        errors.push({ row, column: 'amount', message: amount.error.issues[0].message });
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
        errors.push({ row, column: 'due_date', message: 'Enter a valid date' });
      if (admissionNumber && amount.success)
        parsedRows.push({
          row,
          admissionNumber,
          amount: amount.data,
          description: v.description || 'Opening balance (previous system)',
          dueDate,
        });
    }
    const enrolments = await this.prisma.studentEnrolment.findMany({
      where: {
        academicYearId: year.id,
        status: 'ACTIVE',
        student: { admissionNumber: { in: parsedRows.map((r) => r.admissionNumber) } },
      },
      include: {
        student: { select: { admissionNumber: true } },
        feeDues: { where: { feeHead: { code: 'OPENING' } }, select: { id: true } },
      },
    });
    const seen = new Map<string, number>();
    const out: {
      row: number;
      data: {
        enrolmentId: string;
        academicYearId: string;
        amount: number;
        description: string;
        dueDate: string | null;
      };
    }[] = [];
    for (const r of parsedRows) {
      if (seen.has(r.admissionNumber)) {
        errors.push({
          row: r.row,
          column: 'admission_number',
          message: `Same student as row ${seen.get(r.admissionNumber)}`,
        });
        continue;
      }
      seen.set(r.admissionNumber, r.row);
      const e = enrolments.find((x) => x.student.admissionNumber === r.admissionNumber);
      if (!e) {
        errors.push({
          row: r.row,
          column: 'admission_number',
          message: `${r.admissionNumber} is not a current student in ${year.name}`,
        });
        continue;
      }
      if (e.feeDues.length) {
        errors.push({
          row: r.row,
          column: 'admission_number',
          message: `${r.admissionNumber} already has an opening balance`,
        });
        continue;
      }
      out.push({
        row: r.row,
        data: {
          enrolmentId: e.id,
          academicYearId: year.id,
          amount: r.amount,
          description: r.description,
          dueDate: r.dueDate,
        },
      });
    }
    return {
      rows: out,
      errors,
      fileTotals: {
        students: rows.length,
        paise: sumPaise(parsedRows.map((r) => Math.round(r.amount * 100))),
      },
    };
  }

  private async commitBalances(
    tx: Tx,
    rows: Awaited<ReturnType<ImportsService['prepareBalances']>>['rows'],
  ) {
    const head =
      (await tx.feeHead.findUnique({ where: { code: 'OPENING' } })) ??
      (await tx.feeHead.create({
        data: {
          code: 'OPENING',
          name: 'Opening balance',
          description: 'Balances brought forward from the previous system (data import)',
        },
      }));
    const ids: string[] = [];
    for (const { data } of rows) {
      const due = await tx.studentFeeDue.create({
        data: {
          studentEnrolmentId: data.enrolmentId,
          academicYearId: data.academicYearId,
          feeHeadId: head.id,
          description: data.description,
          amountDue: paiseToDb(Math.round(data.amount * 100)),
          dueDate: data.dueDate ? dayToDate(data.dueDate) : null,
        },
      });
      ids.push(due.id);
    }
    return ids;
  }

  private async reconcileBalances(p: { fileTotals: Record<string, number> }, ids: string[] | null) {
    const dues = ids
      ? await this.prisma.studentFeeDue.findMany({
          where: { id: { in: ids } },
          select: { amountDue: true },
        })
      : null;
    const total = dues ? sumPaise(dues.map((d) => toPaise(d.amountDue))) : null;
    return [
      {
        label: 'Students',
        file: p.fileTotals.students,
        system: dues ? dues.length : '—',
        ok: !dues || dues.length === p.fileTotals.students,
      },
      {
        label: 'Total balance',
        file: formatRupees(rupees(p.fileTotals.paise)),
        system: total === null ? '—' : formatRupees(rupees(total)),
        ok: total === null || total === p.fileTotals.paise,
      },
    ];
  }

  // --- History -------------------------------------------------------------------------------

  async history(): Promise<ImportHistoryItem[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: AUDIT_ACTIONS.DATA_IMPORT_COMMITTED },
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return logs.map((l) => {
      const a = (l.afterJson ?? {}) as {
        type?: ImportType;
        fileName?: string;
        rows?: number;
        created?: number;
      };
      return {
        id: l.id,
        type: a.type ?? 'students',
        fileName: a.fileName ?? '',
        rows: a.rows ?? 0,
        created: a.created ?? 0,
        by: l.user?.fullName ?? null,
        at: l.createdAt.toISOString(),
      };
    });
  }
}
