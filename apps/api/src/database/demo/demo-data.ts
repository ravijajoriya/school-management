/**
 * Demo data for trying the system out locally — and removing it again.
 *
 *   pnpm demo:seed     create a realistic school (classes, staff, students, attendance, leave, fees, …)
 *   pnpm demo:status   show whether demo data is present
 *   pnpm demo:clear    remove it again, leaving your own data untouched
 *
 * How the revert knows what to remove: `seedDemoData` writes a `demo_data.seeded` entry to the
 * (append-only) audit log listing the ids of every root record it created. `clearDemoData` reads
 * that list and deletes those records plus everything attached to them later (attendance, leave,
 * fees, documents, follow-ups, …), then writes `demo_data.cleared`.
 *
 * Demo records are easy to recognise: admission numbers DEMO-0001…, employee codes DEMO-EMP-01…,
 * enquiry numbers DEMO-ENQ-0001…, receipts DEMO-RCT/…, logins …@demo.local, website slugs demo-…,
 * vehicles DEMO-…, asset codes DEMO-AST-…, certificates DEMO-…/….
 */
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  ROLE_CODES,
  DEFAULT_GRADE_BANDS,
  amountInWords,
  type CertificateSnapshot,
  type PaymentMode,
  type ReceiptSnapshot,
} from '@school/shared';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { dayToDate, isoDay, schoolDate } from '../../common/utils/content.js';
import { paiseToDb } from '../../common/utils/money.js';
import { PasswordService } from '../../modules/auth/password.service.js';
import { syncDueStatuses } from '../../modules/fees/fees-core.js';
import { pronouns, renderCertificate } from '../../modules/certificates/certificate-render.js';
import { longDate } from '../../common/utils/school.js';

export const DEMO_PASSWORD = 'Demo@1234';

export interface DemoManifest {
  version: 1;
  seededAt: string;
  /** Set only when the seed created the year (an existing current year is reused, not owned). */
  academicYearId: string | null;
  subjectIds: string[];
  classSubjectIds: string[];
  sectionIds: string[];
  employeeIds: string[];
  userIds: string[];
  roleIds: string[];
  studentIds: string[];
  enquiryIds: string[];
  contactMessageIds: string[];
  announcementIds: string[];
  eventIds: string[];
  noticeIds: string[];
  /** Added with Phase 5 (older manifests do not have them). */
  feeHeadIds: string[];
  feeStructureIds: string[];
  /** Added with Phase 6. */
  gradingScaleIds: string[];
  examIds: string[];
  /** Added with Phase 7. */
  vehicleIds: string[];
  routeIds: string[];
  complaintIds: string[];
  inventoryCategoryIds: string[];
  inventoryItemIds: string[];
  payrollRunIds: string[];
  idCardBatchIds: string[];
  /** Added with the holiday calendar. */
  holidayIds: string[];
}

type Log = (message: string) => void;
type Tx = Prisma.TransactionClient;
const TX = { timeout: 180_000, maxWait: 15_000 };

// --- Small helpers ---------------------------------------------------------------------------

/** Deterministic pseudo-random numbers, so every demo seed looks the same. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const addDays = (day: string, n: number) =>
  isoDay(new Date(dayToDate(day).getTime() + n * 86_400_000));
const isSunday = (day: string) => dayToDate(day).getUTCDay() === 0;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

const EMPTY_LISTS = {
  subjectIds: [],
  classSubjectIds: [],
  sectionIds: [],
  employeeIds: [],
  userIds: [],
  roleIds: [],
  studentIds: [],
  enquiryIds: [],
  contactMessageIds: [],
  announcementIds: [],
  eventIds: [],
  noticeIds: [],
  feeHeadIds: [],
  feeStructureIds: [],
  gradingScaleIds: [],
  examIds: [],
  vehicleIds: [],
  routeIds: [],
  complaintIds: [],
  inventoryCategoryIds: [],
  inventoryItemIds: [],
  payrollRunIds: [],
  idCardBatchIds: [],
  holidayIds: [],
};

/** The active `demo_data.seeded` manifest, or null when demo data is not present. */
export async function activeDemoManifest(prisma: PrismaClient | Tx): Promise<DemoManifest | null> {
  const last = await prisma.auditLog.findFirst({
    where: { action: { in: [AUDIT_ACTIONS.DEMO_DATA_SEEDED, AUDIT_ACTIONS.DEMO_DATA_CLEARED] } },
    orderBy: { createdAt: 'desc' },
  });
  if (last?.action !== AUDIT_ACTIONS.DEMO_DATA_SEEDED) return null;
  return {
    ...EMPTY_LISTS,
    ...(last.afterJson as unknown as Partial<DemoManifest>),
  } as DemoManifest;
}

// --- Demo content ----------------------------------------------------------------------------

const SUBJECTS = [
  ['HIN', 'Hindi'],
  ['ENG', 'English'],
  ['MATH', 'Mathematics'],
  ['EVS', 'Environmental Studies'],
  ['SCI', 'Science'],
  ['SST', 'Social Science'],
  ['SKT', 'Sanskrit'],
  ['COMP', 'Computer Science'],
  ['PHY', 'Physics'],
  ['CHEM', 'Chemistry'],
  ['BIO', 'Biology'],
] as const;
type SubjectCode = (typeof SUBJECTS)[number][0];

interface StaffDef {
  key: string;
  first: string;
  last: string;
  designation: string;
  department: string;
  login?: string;
}
const STAFF: StaffDef[] = [
  {
    key: 'rekha',
    first: 'Rekha',
    last: 'Sharma',
    designation: 'Principal',
    department: 'Administration',
  },
  {
    key: 'sunita',
    first: 'Sunita',
    last: 'Verma',
    designation: 'PRT',
    department: 'Primary',
    login: 'sunita@demo.local',
  },
  { key: 'mahesh', first: 'Mahesh', last: 'Gupta', designation: 'PRT', department: 'Primary' },
  {
    key: 'kavita',
    first: 'Kavita',
    last: 'Rathore',
    designation: 'TGT Hindi',
    department: 'Languages',
  },
  {
    key: 'anil',
    first: 'Anil',
    last: 'Meena',
    designation: 'TGT Mathematics',
    department: 'Mathematics',
    login: 'anil@demo.local',
  },
  {
    key: 'neha',
    first: 'Neha',
    last: 'Agarwal',
    designation: 'TGT Science',
    department: 'Science',
  },
  {
    key: 'pooja',
    first: 'Pooja',
    last: 'Joshi',
    designation: 'TGT English',
    department: 'Languages',
    login: 'pooja@demo.local',
  },
  {
    key: 'rajendra',
    first: 'Rajendra',
    last: 'Shekhawat',
    designation: 'PGT Physics',
    department: 'Science',
  },
  {
    key: 'ramesh',
    first: 'Ramesh',
    last: 'Choudhary',
    designation: 'Accountant',
    department: 'Office',
  },
];

interface SectionDef {
  className: string;
  name: string;
  classTeacher: string;
  /** Quarterly tuition fee for the class (rupees). */
  tuition: number;
  /** subject code → teacher key (and optional subject type) */
  subjects: [SubjectCode, string, ('CORE' | 'OPTIONAL' | 'PRACTICAL')?][];
}
const SECTIONS: SectionDef[] = [
  {
    className: 'Class 1',
    name: 'A',
    classTeacher: 'sunita',
    tuition: 3000,
    subjects: [
      ['HIN', 'sunita'],
      ['ENG', 'pooja'],
      ['MATH', 'sunita'],
      ['EVS', 'sunita'],
    ],
  },
  {
    className: 'Class 1',
    name: 'B',
    classTeacher: 'mahesh',
    tuition: 3000,
    subjects: [
      ['HIN', 'mahesh'],
      ['ENG', 'pooja'],
      ['MATH', 'mahesh'],
      ['EVS', 'mahesh'],
    ],
  },
  {
    className: 'Class 5',
    name: 'A',
    classTeacher: 'kavita',
    tuition: 3500,
    subjects: [
      ['HIN', 'kavita'],
      ['ENG', 'pooja'],
      ['MATH', 'anil'],
      ['EVS', 'kavita'],
      ['SKT', 'kavita'],
      ['COMP', 'anil', 'OPTIONAL'],
    ],
  },
  {
    className: 'Class 8',
    name: 'A',
    classTeacher: 'anil',
    tuition: 4000,
    subjects: [
      ['HIN', 'kavita'],
      ['ENG', 'pooja'],
      ['MATH', 'anil'],
      ['SCI', 'neha'],
      ['SST', 'kavita'],
      ['SKT', 'kavita'],
      ['COMP', 'anil', 'OPTIONAL'],
    ],
  },
  {
    className: 'Class 10',
    name: 'A',
    classTeacher: 'neha',
    tuition: 4500,
    subjects: [
      ['HIN', 'kavita'],
      ['ENG', 'pooja'],
      ['MATH', 'anil'],
      ['SCI', 'neha'],
      ['SST', 'kavita'],
      ['SKT', 'kavita', 'OPTIONAL'],
    ],
  },
  {
    className: 'Class 12',
    name: 'A',
    classTeacher: 'rajendra',
    tuition: 5500,
    subjects: [
      ['HIN', 'kavita'],
      ['ENG', 'pooja'],
      ['PHY', 'rajendra'],
      ['CHEM', 'neha'],
      ['MATH', 'anil', 'OPTIONAL'],
      ['BIO', 'neha', 'OPTIONAL'],
    ],
  },
];

const FEE_HEADS = [
  ['TUITION', 'Tuition fee'],
  ['ANNUAL', 'Annual charges'],
  ['EXAM', 'Examination fee'],
  ['COMPUTER', 'Computer fee'],
  ['MISC', 'Miscellaneous'],
] as const;

const BOYS = [
  'Aarav',
  'Vivaan',
  'Aditya',
  'Arjun',
  'Krishna',
  'Ishaan',
  'Kabir',
  'Rohan',
  'Yash',
  'Dev',
  'Harsh',
  'Kunal',
  'Manav',
  'Pranav',
  'Rudra',
  'Siddharth',
  'Tanish',
  'Vihaan',
  'Laksh',
  'Ayush',
  'Parth',
  'Shaurya',
  'Om',
  'Divyansh',
];
const GIRLS = [
  'Ananya',
  'Diya',
  'Ishita',
  'Kavya',
  'Myra',
  'Navya',
  'Riya',
  'Saanvi',
  'Tanvi',
  'Aadhya',
  'Anika',
  'Jiya',
  'Khushi',
  'Meera',
  'Nisha',
  'Pari',
  'Prisha',
  'Sneha',
  'Tara',
  'Vanshika',
  'Avni',
  'Kiara',
  'Mahi',
  'Siya',
];
const SURNAMES = [
  'Sharma',
  'Verma',
  'Gupta',
  'Meena',
  'Jain',
  'Agarwal',
  'Rathore',
  'Shekhawat',
  'Choudhary',
  'Joshi',
  'Saini',
  'Kumawat',
  'Mathur',
  'Bhati',
  'Purohit',
  'Soni',
  'Khandelwal',
  'Yadav',
];
const FATHERS = [
  'Ramesh',
  'Suresh',
  'Rajesh',
  'Dinesh',
  'Mukesh',
  'Rakesh',
  'Naresh',
  'Sanjay',
  'Vijay',
  'Sunil',
  'Manoj',
  'Pankaj',
  'Ashok',
  'Vinod',
  'Deepak',
  'Gaurav',
];
const MOTHERS = [
  'Anita',
  'Kavita',
  'Rekha',
  'Pooja',
  'Neha',
  'Seema',
  'Geeta',
  'Meena',
  'Priya',
  'Rashmi',
  'Sarita',
  'Usha',
  'Kiran',
  'Mamta',
];
const AREAS = [
  'Malviya Nagar',
  'Vaishali Nagar',
  'Mansarovar',
  'C-Scheme',
  'Raja Park',
  'Jagatpura',
  'Sodala',
  'Shyam Nagar',
  'Pratap Nagar',
  'Tonk Road',
];
const STUDENTS_PER_SECTION = 8;

// --- Seed ------------------------------------------------------------------------------------

export interface SeedDemoResult {
  manifest: DemoManifest;
  counts: Record<string, number>;
  logins: { email: string; password: string; role: string; note: string }[];
}

export async function seedDemoData(
  prisma: PrismaClient,
  log: Log = () => {},
): Promise<SeedDemoResult> {
  if (await activeDemoManifest(prisma)) {
    throw new Error(
      'Demo data is already present. Run `pnpm demo:clear` first if you want a fresh copy.',
    );
  }
  const admin = await prisma.user.findFirst({
    where: { status: 'ACTIVE', roles: { some: { role: { code: ROLE_CODES.ADMIN } } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin)
    throw new Error(
      'No active admin account found. Run `pnpm --filter @school/api db:seed` first.',
    );
  const teacherRole = await prisma.role.findUnique({ where: { code: ROLE_CODES.TEACHER } });
  if (!teacherRole)
    throw new Error('The TEACHER role is missing. Run `pnpm --filter @school/api db:seed` first.');
  const classes = new Map((await prisma.class.findMany()).map((c) => [c.name, c]));
  if (!classes.has('Class 1'))
    throw new Error(
      'The class catalogue is missing. Run `pnpm --filter @school/api db:seed` first.',
    );
  const sitePage = await prisma.websitePage.findUnique({ where: { pageKey: 'site' } });
  const site = (sitePage?.publishedContentJson ?? sitePage?.contentJson ?? {}) as Record<
    string,
    string
  >;
  const school = {
    name: site.schoolName || 'School',
    address: site.address || '',
    phone: site.phone || '',
    email: site.email || '',
  };

  const passwordHash = await new PasswordService().hash(DEMO_PASSWORD);
  const rand = mulberry32(20261121);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const today = schoolDate();

  const manifest: DemoManifest = {
    version: 1,
    seededAt: new Date().toISOString(),
    academicYearId: null,
    subjectIds: [],
    classSubjectIds: [],
    sectionIds: [],
    employeeIds: [],
    userIds: [],
    roleIds: [],
    studentIds: [],
    enquiryIds: [],
    contactMessageIds: [],
    announcementIds: [],
    eventIds: [],
    noticeIds: [],
    feeHeadIds: [],
    feeStructureIds: [],
    gradingScaleIds: [],
    examIds: [],
    vehicleIds: [],
    routeIds: [],
    complaintIds: [],
    inventoryCategoryIds: [],
    inventoryItemIds: [],
    payrollRunIds: [],
    idCardBatchIds: [],
    holidayIds: [],
  };
  const counts: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    // Academic year: reuse the current one, otherwise create the session that contains today.
    let year = await tx.academicYear.findFirst({ where: { isActive: true } });
    if (!year) {
      const [y, m] = today.split('-').map(Number);
      const start = m >= 4 ? y : y - 1;
      const startDate = dayToDate(`${start}-04-01`);
      const endDate = dayToDate(`${start + 1}-03-31`);
      const clash = await tx.academicYear.findFirst({
        where: { startDate: { lte: endDate }, endDate: { gte: startDate } },
      });
      if (clash) {
        throw new Error(
          `Academic year ${clash.name} overlaps ${start}-${start + 1} but is not current. Make it current (or remove it) and run the demo seed again.`,
        );
      }
      year = await tx.academicYear.create({
        data: {
          name: `${start}-${start + 1}`,
          startDate,
          endDate,
          status: 'ACTIVE',
          isActive: true,
        },
      });
      manifest.academicYearId = year.id;
      log(`Created academic year ${year.name}`);
    } else {
      log(`Using the current academic year ${year.name}`);
    }
    const yearStart = isoDay(year.startDate);
    const enrolmentDate = yearStart > today ? today : yearStart;

    // Subjects (existing ones with the same name are reused and left alone on clear).
    const subjectId = {} as Record<SubjectCode, string>;
    for (const [code, name] of SUBJECTS) {
      const existing = await tx.subject.findFirst({
        where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { code }] },
      });
      if (existing) {
        subjectId[code] = existing.id;
      } else {
        const s = await tx.subject.create({ data: { code, name } });
        subjectId[code] = s.id;
        manifest.subjectIds.push(s.id);
      }
    }

    // Logins: three teachers and an office assistant with a limited custom role.
    const upsertLogin = async (email: string, fullName: string, roleId: string) => {
      const existing = await tx.user.findUnique({ where: { email } });
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              fullName,
              passwordHash,
              status: 'ACTIVE',
              mustChangePassword: false,
              passwordChangedAt: new Date(),
            },
          })
        : await tx.user.create({
            data: { email, fullName, passwordHash, mustChangePassword: false },
          });
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.create({ data: { userId: user.id, roleId } });
      manifest.userIds.push(user.id);
      return user.id;
    };

    const officeRole =
      (await tx.role.findUnique({ where: { code: 'DEMO_OFFICE_ASSISTANT' } })) ??
      (await tx.role.create({
        data: {
          code: 'DEMO_OFFICE_ASSISTANT',
          name: 'Office Assistant (demo)',
          description:
            'Demo role: can view students, staff, attendance, leave and fees, collect fees, handle enquiries and complaints, issue certificates. Removed by demo:clear.',
        },
      }));
    manifest.roleIds.push(officeRole.id);
    const officePerms = await tx.permission.findMany({
      where: {
        code: {
          in: [
            PERMISSIONS.STUDENTS_READ,
            PERMISSIONS.ACADEMICS_READ,
            PERMISSIONS.EMPLOYEES_READ,
            PERMISSIONS.ATTENDANCE_READ,
            PERMISSIONS.LEAVE_READ,
            PERMISSIONS.ENQUIRIES_READ,
            PERMISSIONS.ENQUIRIES_MANAGE,
            PERMISSIONS.CONTACT_MESSAGES_MANAGE,
            PERMISSIONS.FEES_READ,
            PERMISSIONS.FEES_COLLECT,
            PERMISSIONS.TRANSPORT_READ,
            PERMISSIONS.COMPLAINTS_READ,
            PERMISSIONS.COMPLAINTS_MANAGE,
            PERMISSIONS.INVENTORY_READ,
            PERMISSIONS.CERTIFICATES_ISSUE,
          ],
        },
      },
    });
    await tx.rolePermission.deleteMany({ where: { roleId: officeRole.id } });
    await tx.rolePermission.createMany({
      data: officePerms.map((p) => ({ roleId: officeRole.id, permissionId: p.id })),
    });
    await upsertLogin('office@demo.local', 'Office Assistant (demo)', officeRole.id);

    // Staff.
    const employeeId: Record<string, string> = {};
    const userOfEmployee: Record<string, string | undefined> = {};
    let n = 0;
    for (const s of STAFF) {
      n++;
      const userId = s.login
        ? await upsertLogin(s.login, `${s.first} ${s.last}`, teacherRole.id)
        : undefined;
      const e = await tx.employee.create({
        data: {
          employeeCode: `DEMO-EMP-${String(n).padStart(2, '0')}`,
          firstName: s.first,
          lastName: s.last,
          email: `${s.first}.${s.last}@demo.local`.toLowerCase(),
          phone: `98290${String(10000 + n * 137).slice(0, 5)}`,
          dateOfBirth: dayToDate(`${1975 + n * 2}-0${(n % 9) + 1}-1${n % 9}`),
          joiningDate: dayToDate(`${2010 + n}-07-01`),
          designation: s.designation,
          department: s.department,
          employmentType: 'FULL_TIME',
          userId,
        },
      });
      employeeId[s.key] = e.id;
      userOfEmployee[s.key] = userId;
      manifest.employeeIds.push(e.id);
    }

    // Sections, class subjects and teacher assignments.
    const sections: { def: SectionDef; id: string }[] = [];
    /** className → subject code → class subject (id, type). */
    const classSubjectsOf = new Map<string, Map<SubjectCode, { id: string; type: string }>>();
    for (const def of SECTIONS) {
      const cls = classes.get(def.className)!;
      let name = def.name;
      while (
        await tx.section.findFirst({ where: { academicYearId: year.id, classId: cls.id, name } })
      ) {
        name = String.fromCharCode(name.charCodeAt(0) + 1);
      }
      const section = await tx.section.create({
        data: {
          academicYearId: year.id,
          classId: cls.id,
          name,
          roomLabel: `Room ${100 + sections.length * 3 + 1}`,
          capacity: 40,
          classTeacherId: employeeId[def.classTeacher],
        },
      });
      manifest.sectionIds.push(section.id);
      sections.push({ def, id: section.id });
      for (const [code, teacher, type] of def.subjects) {
        let cs = await tx.classSubject.findFirst({
          where: { academicYearId: year.id, classId: cls.id, subjectId: subjectId[code] },
        });
        if (!cs) {
          cs = await tx.classSubject.create({
            data: {
              academicYearId: year.id,
              classId: cls.id,
              subjectId: subjectId[code],
              subjectType: type ?? 'CORE',
            },
          });
          manifest.classSubjectIds.push(cs.id);
        }
        if (!classSubjectsOf.has(def.className)) classSubjectsOf.set(def.className, new Map());
        classSubjectsOf.get(def.className)!.set(code, { id: cs.id, type: cs.subjectType });
        await tx.teacherAssignment.create({
          data: {
            academicYearId: year.id,
            employeeId: employeeId[teacher],
            sectionId: section.id,
            classSubjectId: cs.id,
          },
        });
      }
    }
    counts.sections = sections.length;

    // Students with guardians and enrolments.
    let adm = 0;
    interface DemoEnrolment {
      id: string;
      sectionId: string;
      enrolmentDate: string;
      exitDate: string | null;
      irregular: boolean;
      student: { name: string; admissionNumber: string; guardian: string };
      className: string;
      sectionName: string;
      rollNumber: string;
    }
    const enrolments: DemoEnrolment[] = [];
    const newStudent = async (classLevel: number, i: number) => {
      adm++;
      const girl = (adm + i) % 2 === 0;
      const first = girl ? GIRLS[(adm * 7) % GIRLS.length] : BOYS[(adm * 5) % BOYS.length];
      const last = SURNAMES[(adm * 11) % SURNAMES.length];
      const father = `${pick(FATHERS)} ${last}`;
      const birthYear = Number(yearStart.slice(0, 4)) - (classLevel + 5);
      const student = await tx.student.create({
        data: {
          admissionNumber: `DEMO-${String(adm).padStart(4, '0')}`,
          firstName: first,
          lastName: last,
          dateOfBirth: dayToDate(
            `${birthYear}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`,
          ),
          gender: girl ? 'FEMALE' : 'MALE',
          bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-', 'B-']),
          addressLine1: `Plot ${10 + Math.floor(rand() * 190)}, ${pick(AREAS)}`,
          city: 'Jaipur',
          state: 'Rajasthan',
          postalCode: `3020${String(10 + Math.floor(rand() * 80))}`,
          guardians: {
            create: [
              {
                fullName: father,
                relationship: 'FATHER',
                phone: `9${String(800000000 + adm * 7919).slice(0, 9)}`,
                occupation: pick([
                  'Business',
                  'Government service',
                  'Farmer',
                  'Engineer',
                  'Shopkeeper',
                  'Teacher',
                ]),
                isPrimary: true,
              },
              {
                fullName: `${pick(MOTHERS)} ${last}`,
                relationship: 'MOTHER',
                phone: `7${String(300000000 + adm * 6271).slice(0, 9)}`,
                occupation: pick(['Homemaker', 'Teacher', 'Nurse', 'Business']),
                isPrimary: false,
              },
            ],
          },
        },
      });
      manifest.studentIds.push(student.id);
      return { ...student, father };
    };

    for (const { def, id: sectionId } of sections) {
      const classLevel = Number(def.className.replace('Class ', '')) || 0;
      const created = [];
      for (let i = 0; i < STUDENTS_PER_SECTION; i++) created.push(await newStudent(classLevel, i));
      // Roll numbers 1..n in name order, like the "Roll numbers" button does.
      created.sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
      );
      for (const [i, s] of created.entries()) {
        const e = await tx.studentEnrolment.create({
          data: {
            studentId: s.id,
            academicYearId: year.id,
            classId: classes.get(def.className)!.id,
            sectionId,
            rollNumber: String(i + 1),
            enrolmentDate: dayToDate(enrolmentDate),
          },
        });
        enrolments.push({
          id: e.id,
          sectionId,
          enrolmentDate,
          exitDate: null,
          // One student in Class 5 A and one in Class 10 A have poor attendance (below 75%).
          irregular: i === 2 && (def.className === 'Class 5' || def.className === 'Class 10'),
          student: {
            name: `${s.firstName} ${s.lastName}`,
            admissionNumber: s.admissionNumber,
            guardian: s.father,
          },
          className: def.className,
          sectionName: def.name,
          rollNumber: String(i + 1),
        });
      }
    }

    // Lifecycle examples: a transfer in Class 8 A and a withdrawal in Class 10 A.
    const lifecycle = async (
      className: string,
      status: 'TRANSFERRED' | 'WITHDRAWN',
      daysAgo: number,
      reason: string,
    ) => {
      const section = sections.find((s) => s.def.className === className)!;
      const target = enrolments.filter((e) => e.sectionId === section.id && !e.irregular).at(-1)!;
      const exit =
        addDays(today, -daysAgo) < enrolmentDate ? enrolmentDate : addDays(today, -daysAgo);
      const row = await tx.studentEnrolment.update({
        where: { id: target.id },
        data: { status, exitDate: dayToDate(exit), exitReason: reason },
      });
      await tx.student.update({
        where: { id: row.studentId },
        data: { status: status === 'TRANSFERRED' ? 'INACTIVE' : 'WITHDRAWN' },
      });
      target.exitDate = exit;
    };
    await lifecycle('Class 8', 'TRANSFERRED', 12, 'Family moved to Ahmedabad (TC issued)');
    await lifecycle('Class 10', 'WITHDRAWN', 30, 'Parents request — continuing studies privately');

    // One registered student without a class yet (try "Enrol in a class").
    await newStudent(3, 0);
    counts.students = manifest.studentIds.length;

    // Attendance for the last 20 school days (Mon–Sat), plus today for Class 12 A only.
    const days: string[] = [];
    for (let d = addDays(today, -1); days.length < 20 && d >= enrolmentDate; d = addDays(d, -1)) {
      if (!isSunday(d)) days.push(d);
    }
    const markerFor = (sectionId: string) => {
      const def = sections.find((s) => s.id === sectionId)!.def;
      return userOfEmployee[def.classTeacher] ?? admin.id;
    };
    const rows: Prisma.AttendanceRecordCreateManyInput[] = [];
    const remarksFor = () =>
      pick(['Fever', 'Family function', 'Not informed', 'Doctor appointment', 'Out of station']);
    const markDay = (day: string, sectionFilter?: string) => {
      for (const e of enrolments) {
        if (sectionFilter && e.sectionId !== sectionFilter) continue;
        if (day < e.enrolmentDate || (e.exitDate && day > e.exitDate)) continue;
        const r = rand();
        const status = e.irregular
          ? r < 0.35
            ? 'ABSENT'
            : r < 0.42
              ? 'LATE'
              : 'PRESENT'
          : r < 0.05
            ? 'ABSENT'
            : r < 0.08
              ? 'LATE'
              : 'PRESENT';
        rows.push({
          studentEnrolmentId: e.id,
          attendanceDate: dayToDate(day),
          status,
          remarks: status === 'ABSENT' && rand() < 0.5 ? remarksFor() : null,
          markedBy: markerFor(e.sectionId),
          markedAt: new Date(`${day}T09:15:00+05:30`),
        });
      }
    };
    days.forEach((d) => markDay(d));
    if (!isSunday(today) && today >= enrolmentDate) {
      markDay(today, sections.find((s) => s.def.className === 'Class 12')!.id);
    }
    await tx.attendanceRecord.createMany({ data: rows });
    counts.attendanceRecords = rows.length;

    // Leave: one teacher on approved leave today, pending requests to review, some history.
    const leave = (
      key: string,
      leaveType: string,
      from: number,
      to: number,
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
      reason: string,
      reviewRemarks?: string,
    ) => ({
      employeeId: employeeId[key],
      leaveType,
      startDate: dayToDate(addDays(today, from)),
      endDate: dayToDate(addDays(today, to)),
      reason,
      status,
      reviewedBy: status === 'APPROVED' || status === 'REJECTED' ? admin.id : null,
      reviewedAt: status === 'APPROVED' || status === 'REJECTED' ? hoursAgo(30) : null,
      reviewRemarks: reviewRemarks ?? null,
      createdAt: hoursAgo(72),
    });
    const leaveRows = [
      leave(
        'neha',
        'SICK',
        0,
        1,
        'APPROVED',
        'Viral fever, doctor advised two days of rest',
        'Get well soon',
      ),
      leave('sunita', 'CASUAL', 5, 6, 'PENDING', "Sister's wedding in Ajmer"),
      leave('anil', 'EARNED', 14, 18, 'PENDING', 'Family trip to Udaipur during the break'),
      leave('pooja', 'CASUAL', -10, -10, 'APPROVED', 'Personal work at the bank'),
      leave('pooja', 'SICK', 3, 3, 'CANCELLED', 'Dental appointment (rescheduled)'),
      leave(
        'kavita',
        'ON_DUTY',
        -25,
        -24,
        'APPROVED',
        'Board examination evaluation duty',
        'Approved as on duty',
      ),
      leave(
        'mahesh',
        'CASUAL',
        -7,
        -6,
        'REJECTED',
        'Out of station',
        'Half-yearly exams were scheduled that week',
      ),
    ];
    await tx.leaveRequest.createMany({ data: leaveRows });
    counts.leaveRequests = leaveRows.length;

    // --- Fees: heads, one plan per demo class, dues, concessions, fines and payments ------------
    const headId: Record<string, string> = {};
    for (const [code, name] of FEE_HEADS) {
      const existing = await tx.feeHead.findUnique({ where: { code } });
      if (existing) headId[code] = existing.id;
      else {
        const h = await tx.feeHead.create({ data: { code, name } });
        headId[code] = h.id;
        manifest.feeHeadIds.push(h.id);
      }
    }
    const y0 = Number(yearStart.slice(0, 4));
    const sched = {
      q1: `${y0}-04-15`,
      q2: `${y0}-07-15`,
      q3: `${y0}-10-15`,
      q4: `${y0 + 1}-01-15`,
      exam: `${y0}-09-15`,
      computer: `${y0}-07-31`,
    };
    const planByClass = new Map<
      string,
      {
        id: string;
        feeHeadId: string;
        head: string;
        label: string;
        amount: number;
        dueDate: string;
      }[]
    >();
    for (const def of SECTIONS) {
      if (planByClass.has(def.className)) continue;
      const lines: { head: string; label: string; amount: number; dueDate: string }[] = [
        { head: 'ANNUAL', label: '', amount: 2500, dueDate: sched.q1 },
        { head: 'TUITION', label: 'Q1 (Apr–Jun)', amount: def.tuition, dueDate: sched.q1 },
        { head: 'TUITION', label: 'Q2 (Jul–Sep)', amount: def.tuition, dueDate: sched.q2 },
        { head: 'TUITION', label: 'Q3 (Oct–Dec)', amount: def.tuition, dueDate: sched.q3 },
        { head: 'TUITION', label: 'Q4 (Jan–Mar)', amount: def.tuition, dueDate: sched.q4 },
        { head: 'EXAM', label: 'Half-yearly & annual', amount: 600, dueDate: sched.exam },
        ...(['Class 8', 'Class 10', 'Class 12'].includes(def.className)
          ? [{ head: 'COMPUTER', label: '', amount: 1200, dueDate: sched.computer }]
          : []),
      ];
      const s = await tx.feeStructure.create({
        data: {
          academicYearId: year.id,
          classId: classes.get(def.className)!.id,
          name: `${def.className} fees ${year.name} (demo)`,
          billingFrequency: 'QUARTERLY',
          items: {
            create: lines.map((l, i) => ({
              feeHeadId: headId[l.head],
              amount: paiseToDb(l.amount * 100),
              dueDate: dayToDate(l.dueDate),
              installmentLabel: l.label || null,
              sequenceNo: i + 1,
            })),
          },
        },
        include: { items: { orderBy: { sequenceNo: 'asc' } } },
      });
      manifest.feeStructureIds.push(s.id);
      planByClass.set(
        def.className,
        s.items.map((it, i) => ({
          id: it.id,
          feeHeadId: it.feeHeadId,
          head: lines[i].head,
          label: lines[i].label,
          amount: lines[i].amount,
          dueDate: lines[i].dueDate,
        })),
      );
    }

    // Dues for every demo enrolment, then concessions/fines, then payments in date order.
    interface PlannedDue {
      id: string;
      head: string;
      description: string;
      headName: string;
      dueDate: string;
      remaining: number;
    }
    const duesByEnrolment = new Map<string, PlannedDue[]>();
    for (const e of enrolments) {
      const plan = planByClass.get(e.className)!;
      const list: PlannedDue[] = [];
      for (const line of plan) {
        const headName = FEE_HEADS.find(([c]) => c === line.head)![1];
        const description = line.label ? `${headName} — ${line.label}` : headName;
        const due = await tx.studentFeeDue.create({
          data: {
            studentEnrolmentId: e.id,
            academicYearId: year.id,
            feeHeadId: line.feeHeadId,
            feeStructureItemId: line.id,
            description,
            amountDue: paiseToDb(line.amount * 100),
            dueDate: dayToDate(line.dueDate),
          },
        });
        list.push({
          id: due.id,
          head: line.head,
          description,
          headName,
          dueDate: line.dueDate,
          remaining: line.amount * 100,
        });
      }
      duesByEnrolment.set(e.id, list);
    }
    let dueCount = 0;
    duesByEnrolment.forEach((l) => (dueCount += l.length));
    counts.feeDues = dueCount;

    const adjust = async (
      due: PlannedDue,
      type: string,
      paise: number,
      reason: string,
      effective: string,
    ) => {
      if (effective > today) effective = today;
      await tx.feeAdjustment.create({
        data: {
          studentFeeDueId: due.id,
          adjustmentType: type,
          amount: paiseToDb(paise),
          reason,
          approvedBy: admin.id,
          effectiveDate: dayToDate(effective),
          createdAt: new Date(`${effective}T11:00:00+05:30`),
        },
      });
      due.remaining += type === 'FINE' ? paise : -paise;
    };
    let adjustments = 0;
    for (const [idx, e] of enrolments.entries()) {
      const dues = duesByEnrolment.get(e.id)!;
      const tuition = dues.filter((d) => d.head === 'TUITION');
      if (idx % 13 === 5) {
        for (const d of tuition)
          await adjust(
            d,
            'CONCESSION',
            Math.round(d.remaining * 0.1),
            'Sibling concession (10% of tuition)',
            yearStart,
          );
        adjustments += tuition.length;
      }
      if (idx === 8) {
        for (const d of tuition)
          await adjust(
            d,
            'DISCOUNT',
            Math.round(d.remaining * 0.5),
            'Staff ward discount (50% of tuition)',
            yearStart,
          );
        adjustments += tuition.length;
      }
      if (idx === 20) {
        await adjust(
          tuition[1],
          'WAIVER',
          tuition[1].remaining,
          'Merit scholarship — Q2 tuition waived',
          sched.q2,
        );
        adjustments++;
      }
    }

    // Who paid what: most families are up to date, some are behind, a few owe everything.
    interface PlannedPayment {
      enrolment: DemoEnrolment;
      date: string;
      mode: PaymentMode;
      lines: { due: PlannedDue; paise: number }[];
      status: 'POSTED' | 'VOID' | 'REVERSED';
      chequeStatus: 'PENDING' | 'CLEARED' | 'BOUNCED' | null;
      cancelReason?: string;
      balanceAfter: number;
    }
    const payments: PlannedPayment[] = [];
    const yesterday = addDays(today, -1);
    for (const [idx, e] of enrolments.entries()) {
      const dues = duesByEnrolment.get(e.id)!;
      const category = idx % 20;
      if (category === 0) continue; // owes everything
      const payable = dues.filter((d) => d.dueDate <= today && d.remaining > 0);
      const groups = new Map<string, PlannedDue[]>();
      for (const d of payable) {
        const key = d.dueDate === sched.computer ? sched.q2 : d.dueDate; // computer fee paid with Q2
        groups.set(key, [...(groups.get(key) ?? []), d]);
      }
      const groupDates = [...groups.keys()].sort();
      const paidGroups = category <= 3 ? groupDates.slice(0, 1) : groupDates; // 1–3: paid only the first instalment
      for (const [gi, gDate] of paidGroups.entries()) {
        let date = addDays(gDate, (idx % 7) + 1);
        if (date > yesterday) date = yesterday;
        if (date < enrolmentDate) date = enrolmentDate;
        const partial = (category === 4 || category === 5) && gi === paidGroups.length - 1;
        const lines = groups
          .get(gDate)!
          .map((d) => {
            const paise = partial ? Math.round(d.remaining / 2 / 100) * 100 : d.remaining;
            return { due: d, paise };
          })
          .filter((l) => l.paise > 0);
        if (!lines.length) continue;
        const mode: PaymentMode =
          idx % 10 === 7 ? 'BANK_TRANSFER' : idx % 10 === 9 ? 'CHEQUE' : 'CASH';
        lines.forEach((l) => (l.due.remaining -= l.paise));
        payments.push({
          enrolment: e,
          date,
          mode,
          lines,
          status: 'POSTED',
          chequeStatus: mode === 'CHEQUE' ? 'CLEARED' : null,
          balanceAfter: dues.reduce((s, d) => s + Math.max(d.remaining, 0), 0),
        });
      }
      // Late fine on an unpaid, overdue Q2 for families that are behind.
      if (category >= 1 && category <= 3) {
        const q2 = dues.find((d) => d.description.includes('Q2'));
        if (q2 && q2.remaining > 0 && addDays(sched.q2, 30) <= today) {
          await adjust(
            q2,
            'FINE',
            10000,
            'Late fee — Q2 tuition unpaid 30 days after the due date',
            addDays(sched.q2, 30),
          );
          adjustments++;
        }
      }
    }
    // Special cases: a cheque awaiting clearance, a bounced cheque and a payment voided by mistake.
    const lastOf = (i: number) =>
      payments.filter((p) => p.enrolment.id === enrolments[i % enrolments.length].id).at(-1);
    const pendingCheque = lastOf(3);
    if (pendingCheque) {
      pendingCheque.mode = 'CHEQUE';
      pendingCheque.chequeStatus = 'PENDING';
      pendingCheque.date = addDays(today, -2) < enrolmentDate ? enrolmentDate : addDays(today, -2);
    }
    const bounced = lastOf(11);
    if (bounced) {
      bounced.mode = 'CHEQUE';
      bounced.status = 'REVERSED';
      bounced.chequeStatus = 'BOUNCED';
      bounced.cancelReason = 'Cheque bounced: insufficient funds';
      bounced.lines.forEach((l) => (l.due.remaining += l.paise));
    }
    const original = lastOf(15);
    if (original) {
      payments.push({
        ...original,
        lines: original.lines.map((l) => ({ ...l })),
        status: 'VOID',
        mode: 'CASH',
        chequeStatus: null,
        cancelReason: 'Entered twice by mistake',
      });
    }

    payments.sort((a, b) => a.date.localeCompare(b.date));
    const shortYear = `${year.name.slice(0, 4)}-${year.name.slice(-2)}`;
    let seq = 0;
    for (const p of payments) {
      seq++;
      const paymentNumber = `DEMO-PAY/${shortYear}/${String(seq).padStart(5, '0')}`;
      const receiptNumber = `DEMO-RCT/${shortYear}/${String(seq).padStart(5, '0')}`;
      const total = p.lines.reduce((s, l) => s + l.paise, 0);
      const ref =
        p.mode === 'CHEQUE'
          ? String(100000 + seq * 37)
          : p.mode === 'BANK_TRANSFER'
            ? `UTR${String(4100000000 + seq * 7717)}`
            : null;
      const recordedAt = new Date(`${p.date}T10:30:00+05:30`);
      const snapshot: ReceiptSnapshot = {
        school,
        receiptNumber,
        paymentNumber,
        issuedAt: recordedAt.toISOString(),
        issuedBy: 'Ramesh Choudhary (Accountant)',
        student: {
          name: p.enrolment.student.name,
          admissionNumber: p.enrolment.student.admissionNumber,
          className: p.enrolment.className,
          sectionName: p.enrolment.sectionName,
          rollNumber: p.enrolment.rollNumber,
        },
        academicYear: year.name,
        guardianName: p.enrolment.student.guardian,
        payment: {
          date: p.date,
          mode: p.mode,
          referenceNumber: ref,
          bankName:
            p.mode === 'CHEQUE' ? 'State Bank of India' : p.mode === 'BANK_TRANSFER' ? 'UPI' : null,
          chequeDate: p.mode === 'CHEQUE' ? p.date : null,
        },
        lines: p.lines.map((l) => ({
          feeHead: l.due.headName,
          description: l.due.description,
          amount: l.paise / 100,
        })),
        total: total / 100,
        totalInWords: amountInWords(total / 100),
        balanceAfter: p.balanceAfter / 100,
      };
      await tx.payment.create({
        data: {
          paymentNumber,
          studentEnrolmentId: p.enrolment.id,
          paymentDate: dayToDate(p.date),
          amountReceived: paiseToDb(total),
          paymentMode: p.mode,
          referenceNumber: ref,
          bankName: snapshot.payment.bankName,
          chequeDate: p.mode === 'CHEQUE' ? dayToDate(p.date) : null,
          chequeStatus: p.chequeStatus,
          notes: p.status === 'VOID' ? 'Duplicate entry' : null,
          recordedBy: admin.id,
          status: p.status,
          createdAt: recordedAt,
          allocations: {
            create: p.lines.map((l) => ({
              studentFeeDueId: l.due.id,
              allocatedAmount: paiseToDb(l.paise),
            })),
          },
          receipt: {
            create: {
              receiptNumber,
              issuedBy: admin.id,
              issuedAt: recordedAt,
              snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
              isCancelled: p.status !== 'POSTED',
              cancellationReason: p.cancelReason ?? null,
            },
          },
        },
      });
    }
    await syncDueStatuses(
      tx,
      [...duesByEnrolment.values()].flatMap((l) => l.map((d) => d.id)),
    );
    counts.payments = payments.length;
    counts.feeAdjustments = adjustments;

    // --- Exams: a grading scale, a finalised unit test per class, a half-yearly in marks entry --
    const scale = await tx.gradingScale.create({
      data: {
        name: 'Standard 8-point (demo)',
        bands: {
          create: DEFAULT_GRADE_BANDS.map((b) => ({
            minPercentage: b.minPercentage.toFixed(2),
            maxPercentage: b.maxPercentage.toFixed(2),
            gradeLabel: b.gradeLabel,
            remark: b.remark,
          })),
        },
      },
    });
    manifest.gradingScaleIds.push(scale.id);
    const ability = new Map(
      enrolments.map((e) => [e.id, e.irregular ? 0.42 : 0.5 + rand() * 0.45]),
    );
    const teacherUserFor = (sectionId: string, code: SubjectCode) => {
      const def = sections.find((x) => x.id === sectionId)!.def;
      const key = def.subjects.find(([c]) => c === code)?.[1];
      return (key && userOfEmployee[key]) || admin.id;
    };
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const utStart =
      addDays(enrolmentDate, 25) > addDays(today, -40)
        ? addDays(enrolmentDate, 25)
        : addDays(today, -40);
    const utEnd = addDays(utStart, 5);
    let markRows = 0;
    for (const className of new Set(SECTIONS.map((x) => x.className))) {
      const subjects = [...classSubjectsOf.get(className)!.entries()];
      const classId = classes.get(className)!.id;
      const classEnrolments = enrolments.filter((e) => e.className === className);
      if (utEnd < today) {
        const ut = await tx.examination.create({
          data: {
            academicYearId: year.id,
            classId,
            name: 'Unit Test 1',
            examType: 'UNIT_TEST',
            startDate: dayToDate(utStart),
            endDate: dayToDate(utEnd),
            status: 'FINALIZED',
            gradingScaleId: scale.id,
            subjects: {
              create: subjects.map(([, cs], i) => ({
                classSubjectId: cs.id,
                maxMarks: '25.00',
                examDate: dayToDate(addDays(utStart, Math.min(i, 5))),
                sequenceNo: i + 1,
              })),
            },
          },
          include: { subjects: true },
        });
        manifest.examIds.push(ut.id);
        const rowsUt: Prisma.MarkEntryCreateManyInput[] = [];
        for (const e of classEnrolments.filter((x) => !x.exitDate || x.exitDate >= utEnd)) {
          for (const [i, [code, cs]] of subjects.entries()) {
            if (cs.type === 'OPTIONAL' && rand() < 0.4) continue; // did not take the optional subject
            const absent = rand() < 0.03;
            const marks = Math.round(25 * clamp(ability.get(e.id)! + (rand() - 0.5) * 0.3) * 2) / 2;
            rowsUt.push({
              examSubjectId: ut.subjects[i].id,
              studentEnrolmentId: e.id,
              marksObtained: absent ? null : marks.toFixed(2),
              isAbsent: absent,
              enteredBy: teacherUserFor(e.sectionId, code),
              approvedBy: admin.id,
              status: 'FINAL',
            });
          }
        }
        await tx.markEntry.createMany({ data: rowsUt });
        markRows += rowsUt.length;
      }

      const science = ['Class 8', 'Class 10', 'Class 12'].includes(className);
      const hy = await tx.examination.create({
        data: {
          academicYearId: year.id,
          classId,
          name: 'Half-yearly',
          examType: 'HALF_YEARLY',
          startDate: dayToDate(addDays(today, -3)),
          endDate: dayToDate(addDays(today, 6)),
          status: 'MARKS_ENTRY',
          gradingScaleId: null,
          subjects: {
            create: subjects
              .flatMap(([code, cs]) =>
                science && (code === 'SCI' || code === 'PHY' || code === 'CHEM' || code === 'BIO')
                  ? [
                      {
                        classSubjectId: cs.id,
                        componentName: 'Theory',
                        maxMarks: '60.00',
                        passMarks: '20.00',
                      },
                      {
                        classSubjectId: cs.id,
                        componentName: 'Practical',
                        maxMarks: '20.00',
                        passMarks: '7.00',
                      },
                    ]
                  : [{ classSubjectId: cs.id, maxMarks: '80.00' }],
              )
              .map((x, i) => ({
                ...x,
                sequenceNo: i + 1,
                examDate: dayToDate(addDays(today, -3 + Math.min(i, 8))),
              })),
          },
        },
        include: { subjects: { include: { classSubject: { include: { subject: true } } } } },
      });
      manifest.examIds.push(hy.id);
      // Class 8 A Maths entered by Anil but not yet submitted; Class 10 A English submitted for approval.
      const partial = [
        { cls: 'Class 8', subject: 'Mathematics', status: 'DRAFT' },
        { cls: 'Class 10', subject: 'English', status: 'SUBMITTED' },
      ].filter((x) => x.cls === className);
      for (const p of partial) {
        const es = hy.subjects.find((x) => x.classSubject.subject.name === p.subject)!;
        const code = SUBJECTS.find(([, n]) => n === p.subject)![0];
        const rowsHy = classEnrolments
          .filter((e) => !e.exitDate)
          .map((e) => ({
            examSubjectId: es.id,
            studentEnrolmentId: e.id,
            marksObtained: Math.round(
              80 * clamp(ability.get(e.id)! + (rand() - 0.5) * 0.25),
            ).toFixed(2),
            isAbsent: false,
            enteredBy: teacherUserFor(e.sectionId, code),
            status: p.status,
          }));
        await tx.markEntry.createMany({ data: rowsHy });
        markRows += rowsHy.length;
      }
    }
    counts.exams = manifest.examIds.length;
    counts.marks = markRows;

    // --- Timetables: one published, clash-free week per demo section ---------------------------
    const t = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
    const periods = [
      { n: 1, start: '08:00', end: '08:40' },
      { n: 2, start: '08:40', end: '09:20' },
      { n: 3, start: '09:20', end: '10:00' },
      { n: 4, start: '10:00', end: '10:40' },
      { n: 5, start: '10:40', end: '11:00', isBreak: true },
      { n: 6, start: '11:00', end: '11:40' },
      { n: 7, start: '11:40', end: '12:20' },
    ];
    const busy = new Set<string>();
    let lessons = 0;
    for (const [si, { def, id: sectionId }] of sections.entries()) {
      const entries: Prisma.TimetableEntryCreateManyTimetableInput[] = [];
      const options = def.subjects.map(([code, teacher]) => ({
        csId: classSubjectsOf.get(def.className)!.get(code)!.id,
        teacher,
      }));
      for (let day = 1; day <= 6; day++) {
        let pointer = day + si;
        for (const p of periods) {
          if (p.isBreak) {
            entries.push({
              dayOfWeek: day,
              periodNumber: p.n,
              startTime: t(p.start),
              endTime: t(p.end),
              isBreak: true,
            });
            continue;
          }
          let chosen: (typeof options)[number] | null = null;
          for (let k = 0; k < options.length; k++) {
            const o = options[(pointer + k) % options.length];
            if (!busy.has(`${day}-${p.n}-${o.teacher}`)) {
              chosen = o;
              pointer += k + 1;
              break;
            }
          }
          if (chosen) busy.add(`${day}-${p.n}-${chosen.teacher}`);
          entries.push({
            dayOfWeek: day,
            periodNumber: p.n,
            startTime: t(p.start),
            endTime: t(p.end),
            classSubjectId: chosen?.csId ?? null,
            teacherEmployeeId: chosen ? employeeId[chosen.teacher] : null,
            roomLabel: `Room ${100 + si * 3 + 1}`,
          });
          if (chosen) lessons++;
        }
      }
      await tx.timetable.create({
        data: {
          academicYearId: year.id,
          sectionId,
          name: 'Regular timetable (demo)',
          status: 'PUBLISHED',
          effectiveFrom: dayToDate(enrolmentDate),
          createdBy: admin.id,
          entries: { createMany: { data: entries } },
        },
      });
    }
    counts.timetableLessons = lessons;

    // Admission enquiries (Phase 2) — one NEW enquiry for Class 1 is ready to "Convert to student".
    const enquiries = [
      {
        student: 'Vivaan Khandelwal',
        cls: 'Class 1',
        guardian: 'Rohit Khandelwal',
        status: 'NEW',
        source: 'WEBSITE',
        ago: 20,
        follow: null,
      },
      {
        student: 'Ira Mathur',
        cls: 'Class 5',
        guardian: 'Sanjay Mathur',
        status: 'CONTACTED',
        source: 'PHONE',
        ago: 72,
        follow: {
          outcome: 'Called parent',
          notes: 'Parent wants to see the computer lab. Call back to fix a visit.',
          next: 24,
        },
      },
      {
        student: 'Kabir Bhati',
        cls: 'Class 8',
        guardian: 'Lokesh Bhati',
        status: 'VISIT_SCHEDULED',
        source: 'WALK_IN',
        ago: 120,
        follow: {
          outcome: 'Visit booked',
          notes: 'Campus visit booked; bring previous report card.',
          next: -6,
        },
      },
      {
        student: 'Saanvi Purohit',
        cls: 'Class 10',
        guardian: 'Manish Purohit',
        status: 'NOT_INTERESTED',
        source: 'REFERRAL',
        ago: 240,
        follow: { outcome: 'Not interested', notes: 'Chose a school closer to home.', next: null },
      },
      {
        student: 'Advik Soni',
        cls: 'Nursery',
        guardian: 'Kiran Soni',
        status: 'NEW',
        source: 'WEBSITE',
        ago: 5,
        follow: null,
      },
      {
        student: 'Tanya Kumawat',
        cls: 'Class 12',
        guardian: 'Hemant Kumawat',
        status: 'CLOSED',
        source: 'OTHER',
        ago: 400,
        follow: null,
      },
    ];
    for (const [i, q] of enquiries.entries()) {
      const row = await tx.admissionEnquiry.create({
        data: {
          referenceNumber: `DEMO-ENQ-${String(i + 1).padStart(4, '0')}`,
          studentName: q.student,
          classSoughtId: classes.get(q.cls)!.id,
          guardianName: q.guardian,
          phone: `9414${String(100000 + i * 4231).slice(0, 6)}`,
          email: `${q.guardian.split(' ')[0].toLowerCase()}@demo.local`,
          message:
            i % 2 === 0 ? 'Please share the fee structure and transport availability.' : null,
          source: q.source,
          status: q.status,
          assignedTo: q.status === 'NEW' ? null : admin.id,
          submittedAt: hoursAgo(q.ago),
        },
      });
      manifest.enquiryIds.push(row.id);
      if (q.follow) {
        await tx.enquiryFollowUp.create({
          data: {
            enquiryId: row.id,
            userId: admin.id,
            followUpAt: hoursAgo(q.ago - 2),
            outcome: q.follow.outcome,
            notes: q.follow.notes,
            nextFollowUpAt: q.follow.next === null ? null : hoursAgo(-q.follow.next),
          },
        });
      }
    }
    counts.enquiries = enquiries.length;

    // Contact messages, public announcements & events, staff notices.
    const messages = [
      {
        name: 'Deepak Saini',
        msg: 'Is there a school bus from Jagatpura? What are the timings?',
        status: 'NEW',
        ago: 3,
      },
      {
        name: 'Meena Jain',
        msg: 'I would like to know when admissions for Class 11 Science open.',
        status: 'NEW',
        ago: 26,
      },
      {
        name: 'Arvind Yadav',
        msg: 'Thank you for organising the science exhibition last year!',
        status: 'READ',
        ago: 200,
      },
    ];
    for (const m of messages) {
      const row = await tx.contactMessage.create({
        data: {
          fullName: m.name,
          email: `${m.name.split(' ')[0].toLowerCase()}@demo.local`,
          phone: '9829012345',
          message: m.msg,
          status: m.status,
          handledBy: m.status === 'READ' ? admin.id : null,
          handledAt: m.status === 'READ' ? hoursAgo(m.ago - 5) : null,
          createdAt: hoursAgo(m.ago),
        },
      });
      manifest.contactMessageIds.push(row.id);
    }
    const announcements = [
      {
        slug: 'demo-winter-vacation',
        title: 'Winter vacation from 25 December',
        body: 'The school will remain closed for winter vacation from 25 December to 5 January. Classes resume on 6 January.',
        status: 'PUBLISHED',
        ago: 48,
      },
      {
        slug: 'demo-parent-teacher-meeting',
        title: 'Parent-teacher meeting this Saturday',
        body: 'Parents of Classes 1 to 10 are invited to meet class teachers between 9 AM and 12 noon.',
        status: 'PUBLISHED',
        ago: 20,
      },
      {
        slug: 'demo-annual-function-draft',
        title: 'Annual function rehearsal schedule (draft)',
        body: 'Draft — not yet visible on the website.',
        status: 'DRAFT',
        ago: 5,
      },
    ];
    for (const a of announcements) {
      const row = await tx.announcement.create({
        data: {
          slug: a.slug,
          title: a.title,
          body: a.body,
          status: a.status,
          publishAt: a.status === 'PUBLISHED' ? hoursAgo(a.ago) : null,
          createdBy: admin.id,
        },
      });
      manifest.announcementIds.push(row.id);
    }
    const events = [
      {
        slug: 'demo-annual-sports-day',
        title: 'Annual Sports Day',
        venue: 'School playground',
        inDays: 20,
        description: 'Track events, kho-kho and kabaddi finals. Parents are welcome.',
      },
      {
        slug: 'demo-science-exhibition',
        title: 'Science Exhibition',
        venue: 'Main hall',
        inDays: 35,
        description: 'Projects by students of Classes 6 to 12.',
      },
    ];
    for (const e of events) {
      const startsAt = new Date(`${addDays(today, e.inDays)}T09:00:00+05:30`);
      const row = await tx.event.create({
        data: {
          slug: e.slug,
          title: e.title,
          description: e.description,
          venue: e.venue,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 5 * 3_600_000),
          status: 'PUBLISHED',
          createdBy: admin.id,
        },
      });
      manifest.eventIds.push(row.id);
    }
    const notices = [
      {
        title: 'Submit half-yearly question papers',
        body: 'Please submit question papers to the exam cell by Friday.',
        audience: ROLE_CODES.TEACHER,
      },
      {
        title: 'Staff meeting on Monday',
        body: 'All staff: meeting in the conference room at 2:30 PM.',
        audience: null,
      },
    ];
    for (const nt of notices) {
      const row = await tx.internalNotice.create({
        data: {
          title: nt.title,
          body: nt.body,
          audienceRoleCode: nt.audience,
          publishAt: hoursAgo(10),
          createdBy: admin.id,
        },
      });
      manifest.noticeIds.push(row.id);
    }

    // Holidays: one later this week (shows faded on teacher timetables), a winter break and
    // Republic Day — only those that fall inside the year and are not today.
    const yearEnd = isoDay(year.endDate);
    let soon = addDays(today, 2);
    if (isSunday(soon)) soon = addDays(soon, 1);
    const hy = Number(yearStart.slice(0, 4));
    const holidayDefs = [
      { name: 'Demo – Founders’ Day', startDate: soon, endDate: soon },
      { name: 'Demo – Winter break', startDate: `${hy}-12-25`, endDate: `${hy + 1}-01-01` },
      { name: 'Demo – Republic Day', startDate: `${hy + 1}-01-26`, endDate: `${hy + 1}-01-26` },
    ].filter(
      (h, i, all) =>
        h.startDate >= yearStart &&
        h.endDate <= yearEnd &&
        !(h.startDate <= today && today <= h.endDate) &&
        !all.slice(0, i).some((o) => o.startDate <= h.endDate && h.startDate <= o.endDate),
    );
    for (const h of holidayDefs) {
      const clash = await tx.holiday.findFirst({
        where: {
          academicYearId: year.id,
          startDate: { lte: dayToDate(h.endDate) },
          endDate: { gte: dayToDate(h.startDate) },
        },
      });
      if (clash) continue;
      const row = await tx.holiday.create({
        data: {
          academicYearId: year.id,
          name: h.name,
          startDate: dayToDate(h.startDate),
          endDate: dayToDate(h.endDate),
          createdBy: admin.id,
        },
      });
      manifest.holidayIds.push(row.id);
    }
    counts.holidays = manifest.holidayIds.length;

    // --- Phase 7: school operations -----------------------------------------------------------
    await seedOperations(tx, {
      manifest,
      counts,
      adminId: admin.id,
      officeUserId: (await tx.user.findUniqueOrThrow({ where: { email: 'office@demo.local' } })).id,
      employeeId,
      enrolments,
      sections,
      today,
      school,
      yearId: year.id,
      yearName: year.name,
    });

    counts.employees = manifest.employeeIds.length;
    counts.logins = manifest.userIds.length;

    // The manifest is what demo:clear uses to remove exactly this data.
    await tx.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.DEMO_DATA_SEEDED,
        entityType: 'demo_data',
        afterJson: manifest as unknown as Prisma.InputJsonValue,
        reason: 'pnpm demo:seed',
      },
    });
  }, TX);

  const logins = [
    {
      email: 'sunita@demo.local',
      password: DEMO_PASSWORD,
      role: 'Teacher',
      note: 'Class teacher of Class 1 A — can mark today',
    },
    {
      email: 'anil@demo.local',
      password: DEMO_PASSWORD,
      role: 'Teacher',
      note: 'Class teacher of Class 8 A, teaches Maths in several classes',
    },
    {
      email: 'pooja@demo.local',
      password: DEMO_PASSWORD,
      role: 'Teacher',
      note: 'Subject teacher only (English) — not a class teacher',
    },
    {
      email: 'office@demo.local',
      password: DEMO_PASSWORD,
      role: 'Office Assistant (demo)',
      note: 'Limited office role: views records, collects fees, handles enquiries and complaints, issues certificates',
    },
  ];
  return { manifest, counts, logins };
}

// --- Phase 7 demo content ----------------------------------------------------------------------

interface OperationsContext {
  manifest: DemoManifest;
  counts: Record<string, number>;
  adminId: string;
  officeUserId: string;
  employeeId: Record<string, string>;
  enrolments: { id: string; sectionId: string; exitDate: string | null; className: string }[];
  sections: { def: { className: string }; id: string }[];
  today: string;
  school: { name: string; address: string; phone: string; email: string };
  yearId: string;
  yearName: string;
}

/** Monthly pay by staff key (earnings and deductions entered as amounts, as the school would). */
const DEMO_PAY: Record<string, { basic: number; da: number; hra: number }> = {
  rekha: { basic: 52000, da: 9000, hra: 7800 },
  ramesh: { basic: 24000, da: 4000, hra: 3600 },
};
const DEFAULT_PAY = { basic: 32000, da: 5500, hra: 4800 };

async function seedOperations(tx: Tx, c: OperationsContext) {
  const { manifest, counts, today } = c;
  const riders = c.enrolments.filter((e) => !e.exitDate);

  // Transport: two buses and two routes; a dozen students ride.
  const bus1 = await tx.vehicle.create({
    data: {
      registrationNumber: 'DEMO RJ14 PB 4521',
      vehicleType: 'Bus',
      capacity: 40,
      insuranceExpiry: dayToDate(addDays(today, 200)),
      permitExpiry: dayToDate(addDays(today, 18)),
    },
  });
  const van = await tx.vehicle.create({
    data: {
      registrationNumber: 'DEMO RJ14 PC 0987',
      vehicleType: 'Van',
      capacity: 12,
      insuranceExpiry: dayToDate(addDays(today, 320)),
      permitExpiry: dayToDate(addDays(today, 280)),
    },
  });
  manifest.vehicleIds.push(bus1.id, van.id);
  const toTime = (t: string) => new Date(`1970-01-01T${t}:00Z`);
  const routeDefs = [
    {
      name: 'Demo Route 1 – Vaishali Nagar',
      vehicleId: bus1.id,
      stops: [
        ['Gandhi Path', '07:05', '14:20'],
        ['Amrapali Circle', '07:15', '14:10'],
        ['Queens Road', '07:25', '14:00'],
      ],
    },
    {
      name: 'Demo Route 2 – Mansarovar',
      vehicleId: van.id,
      stops: [
        ['Shipra Path', '07:10', '14:15'],
        ['VT Road', '07:20', '14:05'],
      ],
    },
  ] as const;
  let riderIndex = 0;
  for (const def of routeDefs) {
    const route = await tx.transportRoute.create({
      data: {
        name: def.name,
        vehicleId: def.vehicleId,
        attendantEmployeeId: c.employeeId.mahesh,
        stops: {
          create: def.stops.map(([name, pick, drop], i) => ({
            name,
            pickupTime: toTime(pick),
            dropTime: toTime(drop),
            sequenceNo: i + 1,
          })),
        },
      },
      include: { stops: true },
    });
    manifest.routeIds.push(route.id);
    for (let i = 0; i < 6 && riderIndex < riders.length; i++, riderIndex += 3) {
      await tx.studentTransport.create({
        data: {
          studentEnrolmentId: riders[riderIndex].id,
          routeId: route.id,
          routeStopId: route.stops[i % route.stops.length].id,
          startDate: dayToDate(addDays(today, -30)),
          createdBy: c.adminId,
        },
      });
      counts.transportRiders = (counts.transportRiders ?? 0) + 1;
    }
  }

  // Complaints: one open, one being handled, one resolved.
  const complaints = [
    {
      category: 'TRANSPORT',
      subject: 'Bus arrives late at Amrapali Circle',
      description: 'The morning bus has been 15–20 minutes late this week.',
      submittedByName: 'Ramesh Sharma',
      contactPhone: '9829012345',
      status: 'OPEN',
    },
    {
      category: 'FACILITIES',
      subject: 'Water cooler not working (2nd floor)',
      description: 'The water cooler near Class 8 has not been working since Monday.',
      submittedByName: 'Class 8 A monitor',
      status: 'IN_PROGRESS',
      assignedTo: c.officeUserId,
    },
    {
      category: 'FEES',
      subject: 'Receipt not received for October fee',
      description: 'Paid in cash at the counter but did not get a receipt.',
      submittedByName: 'Sunita Meena',
      contactPhone: '9414023456',
      status: 'RESOLVED',
      assignedTo: c.officeUserId,
      resolutionNotes: 'Duplicate receipt printed and handed over to the parent.',
    },
  ];
  for (const x of complaints) {
    const [{ n }] = await tx.$queryRaw<
      { n: bigint }[]
    >`SELECT nextval('complaint_reference_seq') AS n`;
    const row = await tx.complaint.create({
      data: {
        referenceNumber: `CMP-${today.slice(0, 4)}-${n.toString().padStart(5, '0')}`,
        category: x.category,
        subject: x.subject,
        description: x.description,
        submittedByName: x.submittedByName,
        contactPhone: x.contactPhone ?? null,
        status: x.status,
        assignedTo: x.assignedTo ?? null,
        resolutionNotes: x.resolutionNotes ?? null,
        resolvedAt: x.status === 'RESOLVED' ? hoursAgo(20) : null,
        createdBy: c.adminId,
        createdAt: hoursAgo(72),
      },
    });
    manifest.complaintIds.push(row.id);
  }
  counts.complaints = complaints.length;

  // Parent–teacher meetings for Anil's Class 8 students: two upcoming, one held.
  const class8 = c.sections.find((s) => s.def.className === 'Class 8');
  const class8Students = riders.filter((e) => e.sectionId === class8?.id).slice(0, 3);
  const meetingTimes = [
    {
      at: new Date(`${addDays(today, 2)}T10:30:00+05:30`),
      status: 'SCHEDULED',
      purpose: 'Maths progress after unit test',
    },
    {
      at: new Date(`${addDays(today, 3)}T11:00:00+05:30`),
      status: 'SCHEDULED',
      purpose: 'Attendance',
    },
    {
      at: new Date(`${addDays(today, -5)}T12:00:00+05:30`),
      status: 'COMPLETED',
      purpose: 'Homework habits',
      notes: 'Parent will check the diary daily; follow up in a month.',
    },
  ];
  for (const [i, e] of class8Students.entries()) {
    const t = meetingTimes[i];
    await tx.parentTeacherMeeting.create({
      data: {
        studentEnrolmentId: e.id,
        teacherEmployeeId: c.employeeId.anil,
        meetingAt: t.at,
        venue: 'Class 8 A',
        purpose: t.purpose,
        status: t.status,
        notes: t.notes ?? null,
        createdBy: c.adminId,
      },
    });
  }
  counts.meetings = class8Students.length;

  // Inventory: a small asset register.
  const cats: Record<string, string> = {};
  for (const name of ['Demo – IT equipment', 'Demo – Furniture', 'Demo – Sports']) {
    const row = await tx.inventoryCategory.create({ data: { name } });
    cats[name] = row.id;
    manifest.inventoryCategoryIds.push(row.id);
  }
  const items: [string, string, number, string, string, number | null, string][] = [
    ['Demo – IT equipment', 'Desktop computer', 20, 'pcs', 'Computer lab', 32000, 'GOOD'],
    ['Demo – IT equipment', 'Projector', 3, 'pcs', 'Smart classes', 28000, 'NEEDS_REPAIR'],
    ['Demo – IT equipment', 'Laser printer', 2, 'pcs', 'Office', 15500, 'GOOD'],
    ['Demo – Furniture', 'Student desk (dual)', 240, 'pcs', 'Classrooms', 3200, 'GOOD'],
    ['Demo – Furniture', 'Teacher chair', 30, 'pcs', 'Classrooms', 1800, 'DAMAGED'],
    ['Demo – Sports', 'Football', 12, 'pcs', 'Sports room', 650, 'GOOD'],
    ['Demo – Sports', 'Cricket kit', 2, 'sets', 'Sports room', null, 'GOOD'],
  ];
  for (const [i, [cat, name, qty, unit, location, cost, condition]] of items.entries()) {
    const row = await tx.inventoryItem.create({
      data: {
        categoryId: cats[cat],
        assetCode: `DEMO-AST-${String(i + 1).padStart(3, '0')}`,
        name,
        quantity: qty.toString(),
        unit,
        location,
        conditionStatus: condition,
        purchaseDate: dayToDate(addDays(today, -400 + i * 30)),
        purchaseCost: cost === null ? null : paiseToDb(cost * qty * 100),
      },
    });
    manifest.inventoryItemIds.push(row.id);
  }
  counts.inventoryItems = items.length;

  // Payroll: last month, paid (needs the starter salary components from db:seed).
  const comps = new Map((await tx.salaryComponent.findMany()).map((x) => [x.name, x]));
  const [basic, da, hra, pf, pt] = [
    'Basic pay',
    'Dearness allowance (DA)',
    'House rent allowance (HRA)',
    'Provident fund (PF)',
    'Professional tax',
  ].map((n) => comps.get(n));
  const last = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() - 1);
  const periodStart = isoDay(last);
  const periodEnd = isoDay(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)));
  const runExists = await tx.payrollRun.findUnique({
    where: { periodStart: dayToDate(periodStart) },
  });
  if (basic && da && hra && pf && pt && !runExists) {
    const run = await tx.payrollRun.create({
      data: {
        periodStart: dayToDate(periodStart),
        periodEnd: dayToDate(periodEnd),
        createdBy: c.adminId,
      },
    });
    manifest.payrollRunIds.push(run.id);
    for (const [key, empId] of Object.entries(c.employeeId)) {
      const p = DEMO_PAY[key] ?? DEFAULT_PAY;
      const pfAmount = Math.round(p.basic * 0.12);
      const lines = [
        { comp: basic, amount: p.basic },
        { comp: da, amount: p.da },
        { comp: hra, amount: p.hra },
        { comp: pf, amount: pfAmount },
        { comp: pt, amount: 200 },
      ];
      const gross = p.basic + p.da + p.hra;
      const ded = pfAmount + 200;
      await tx.payrollRecord.create({
        data: {
          payrollRunId: run.id,
          employeeId: empId,
          grossAmount: paiseToDb(gross * 100),
          deductionAmount: paiseToDb(ded * 100),
          netAmount: paiseToDb((gross - ded) * 100),
          items: {
            create: lines.map((l) => ({
              salaryComponentId: l.comp.id,
              componentName: l.comp.name,
              componentType: l.comp.componentType,
              amount: paiseToDb(l.amount * 100),
            })),
          },
        },
      });
    }
    await tx.payrollRun.update({
      where: { id: run.id },
      data: { status: 'APPROVED', approvedBy: c.adminId, approvedAt: hoursAgo(24 * 5) },
    });
    await tx.payrollRun.update({
      where: { id: run.id },
      data: { status: 'PAID', paidAt: hoursAgo(24 * 4) },
    });
    counts.payrollEntries = Object.keys(c.employeeId).length;
  }

  // One Bonafide certificate (needs the starter templates from db:seed).
  const bonafide = await tx.certificateTemplate.findUnique({ where: { code: 'BONAFIDE' } });
  const certFor = riders[1];
  if (bonafide && certFor) {
    const e = await tx.studentEnrolment.findUniqueOrThrow({
      where: { id: certFor.id },
      include: { student: { include: { guardians: true } }, class: true, section: true },
    });
    const s = e.student;
    const name = [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');
    const p = pronouns(s.gender);
    const father =
      s.guardians.find((g) => g.relationship === 'FATHER') ?? s.guardians.find((g) => g.isPrimary);
    const number = `DEMO-BONAFIDE/${today.slice(0, 4)}/0001`;
    const snapshot: CertificateSnapshot = {
      school: c.school,
      title: bonafide.name,
      certificateNumber: number,
      issuedOn: today,
      issuedBy: 'Demo data',
      student: { name, admissionNumber: s.admissionNumber },
      paragraphs: renderCertificate(bonafide.templateHtml, {
        student_name: name,
        admission_number: s.admissionNumber,
        date_of_birth: longDate(s.dateOfBirth),
        gender_pronoun: p.subject,
        gender_possessive: p.possessive,
        child_relation: p.child,
        father_name: father?.fullName,
        class_name: e.class.name,
        section_name: e.section.name,
        academic_year: c.yearName,
        purpose: 'scholarship application',
        conduct: 'good',
        school_name: c.school.name,
        issue_date: longDate(today),
        certificate_number: number,
      }),
    };
    await tx.certificateIssue.create({
      data: {
        certificateNumber: number,
        templateId: bonafide.id,
        studentId: s.id,
        studentEnrolmentId: e.id,
        issuedOn: dayToDate(today),
        issuedBy: c.adminId,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    counts.certificates = 1;
  }

  // ID cards for Class 1 A (needs the starter ID card designs from db:seed).
  const studentCard = await tx.idCardTemplate.findFirst({
    where: { audience: 'STUDENT', isActive: true },
  });
  const class1 = c.sections.find((s) => s.def.className === 'Class 1');
  if (studentCard && class1) {
    const cards = await tx.studentEnrolment.count({
      where: { sectionId: class1.id, status: 'ACTIVE' },
    });
    const batch = await tx.idCardBatch.create({
      data: {
        templateId: studentCard.id,
        academicYearId: c.yearId,
        filters: { sectionIds: [class1.id] },
        cardCount: cards,
        createdBy: c.adminId,
      },
    });
    manifest.idCardBatchIds.push(batch.id);
  }
}

// --- Clear -----------------------------------------------------------------------------------

export interface ClearDemoResult {
  cleared: boolean;
  removed: Record<string, number>;
  /** Things kept on purpose, with the reason. */
  kept: string[];
}

export async function clearDemoData(
  prisma: PrismaClient,
  opts: { storageDir?: string; log?: Log } = {},
): Promise<ClearDemoResult> {
  const log = opts.log ?? (() => {});
  const m = await activeDemoManifest(prisma);
  if (!m) return { cleared: false, removed: {}, kept: [] };

  const removed: Record<string, number> = {};
  const kept: string[] = [];
  const files: string[] = [];
  const count = (key: string, n: number) => {
    if (n) removed[key] = (removed[key] ?? 0) + n;
  };
  const demoSections = new Set(m.sectionIds);

  await prisma.$transaction(async (tx) => {
    // Fee records are normally undeletable (database triggers); this transaction-local switch
    // is the only bypass and exists for this development tool.
    await tx.$executeRawUnsafe(`SET LOCAL app.allow_financial_delete = 'on'`);
    await tx.$executeRawUnsafe(`SET LOCAL app.allow_protected_delete = 'on'`);

    // Students to remove: the seeded ones, plus students that exist only inside demo classes
    // (for example ones created while testing "Convert to student" or "Register student").
    const inDemoSections = await tx.studentEnrolment.findMany({
      where: { sectionId: { in: m.sectionIds }, studentId: { notIn: m.studentIds } },
      select: { studentId: true },
    });
    const extraStudentIds: string[] = [];
    for (const studentId of new Set(inDemoSections.map((e) => e.studentId))) {
      const all = await tx.studentEnrolment.findMany({
        where: { studentId },
        select: { sectionId: true },
      });
      if (all.every((e) => demoSections.has(e.sectionId))) {
        extraStudentIds.push(studentId);
      } else {
        const s = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
        throw new Error(
          `Student ${s.firstName} ${s.lastName ?? ''} (${s.admissionNumber}) is enrolled in both a demo class and one of your own classes. Remove their demo-class enrolment first, then run demo:clear again.`,
        );
      }
    }
    const studentIds = [...m.studentIds, ...extraStudentIds];
    if (extraStudentIds.length)
      log(`Also removing ${extraStudentIds.length} student(s) that only belonged to demo classes`);

    const enrolmentIds = (
      await tx.studentEnrolment.findMany({
        where: { studentId: { in: studentIds } },
        select: { id: true },
      })
    ).map((e) => e.id);

    count(
      'holidays',
      (
        await tx.holiday.deleteMany({
          where: {
            OR: [
              { id: { in: m.holidayIds } },
              ...(m.academicYearId ? [{ academicYearId: m.academicYearId }] : []),
            ],
          },
        })
      ).count,
    );
    // Phase 7 rows that point at demo students, staff or the demo year.
    count(
      'transport assignments',
      (
        await tx.studentTransport.deleteMany({
          where: {
            OR: [{ studentEnrolmentId: { in: enrolmentIds } }, { routeId: { in: m.routeIds } }],
          },
        })
      ).count,
    );
    await tx.routeStop.deleteMany({ where: { routeId: { in: m.routeIds } } });
    count(
      'routes',
      (await tx.transportRoute.deleteMany({ where: { id: { in: m.routeIds } } })).count,
    );
    await tx.transportRoute.updateMany({
      where: {
        OR: [
          { driverEmployeeId: { in: m.employeeIds } },
          { attendantEmployeeId: { in: m.employeeIds } },
        ],
      },
      data: { driverEmployeeId: null, attendantEmployeeId: null },
    });
    await tx.transportRoute.updateMany({
      where: { vehicleId: { in: m.vehicleIds } },
      data: { vehicleId: null },
    });
    count('vehicles', (await tx.vehicle.deleteMany({ where: { id: { in: m.vehicleIds } } })).count);
    count(
      'complaints',
      (await tx.complaint.deleteMany({ where: { id: { in: m.complaintIds } } })).count,
    );
    count(
      'parent meetings',
      (
        await tx.parentTeacherMeeting.deleteMany({
          where: {
            OR: [
              { studentEnrolmentId: { in: enrolmentIds } },
              { teacherEmployeeId: { in: m.employeeIds } },
            ],
          },
        })
      ).count,
    );
    count(
      'inventory items',
      (await tx.inventoryItem.deleteMany({ where: { id: { in: m.inventoryItemIds } } })).count,
    );
    for (const id of m.inventoryCategoryIds) {
      if (await tx.inventoryItem.count({ where: { categoryId: id } })) {
        kept.push('An inventory category used by your own items');
        continue;
      }
      count(
        'inventory categories',
        (await tx.inventoryCategory.deleteMany({ where: { id } })).count,
      );
    }
    const payrollRecordIds = (
      await tx.payrollRecord.findMany({
        where: {
          OR: [{ payrollRunId: { in: m.payrollRunIds } }, { employeeId: { in: m.employeeIds } }],
        },
        select: { id: true },
      })
    ).map((r) => r.id);
    await tx.payrollItem.deleteMany({ where: { payrollRecordId: { in: payrollRecordIds } } });
    count(
      'payroll entries',
      (await tx.payrollRecord.deleteMany({ where: { id: { in: payrollRecordIds } } })).count,
    );
    count(
      'payroll months',
      (await tx.payrollRun.deleteMany({ where: { id: { in: m.payrollRunIds } } })).count,
    );
    count(
      'certificates',
      (await tx.certificateIssue.deleteMany({ where: { studentId: { in: studentIds } } })).count,
    );
    count(
      'ID card batches',
      (
        await tx.idCardBatch.deleteMany({
          where: {
            OR: [
              { id: { in: m.idCardBatchIds } },
              ...(m.academicYearId ? [{ academicYearId: m.academicYearId }] : []),
            ],
          },
        })
      ).count,
    );

    count(
      'attendance records',
      (
        await tx.attendanceRecord.deleteMany({
          where: { studentEnrolmentId: { in: enrolmentIds } },
        })
      ).count,
    );
    count(
      'leave requests',
      (await tx.leaveRequest.deleteMany({ where: { employeeId: { in: m.employeeIds } } })).count,
    );

    // Exams: the seeded ones plus any exam set up on demo classes while testing; marks of removed
    // students in any exam. Finalised marks/exams are protected, hence the bypass above.
    const examIds = [
      ...new Set([
        ...m.examIds,
        ...(
          await tx.examSubject.findMany({
            where: { classSubjectId: { in: m.classSubjectIds } },
            select: { examinationId: true },
          })
        ).map((x) => x.examinationId),
      ]),
    ];
    count(
      'marks',
      (
        await tx.markEntry.deleteMany({
          where: {
            OR: [
              { examSubject: { examinationId: { in: examIds } } },
              { studentEnrolmentId: { in: enrolmentIds } },
            ],
          },
        })
      ).count,
    );
    await tx.examSubject.deleteMany({ where: { examinationId: { in: examIds } } });
    count(
      'examinations',
      (await tx.examination.deleteMany({ where: { id: { in: examIds } } })).count,
    );
    for (const id of m.gradingScaleIds) {
      if (await tx.examination.count({ where: { gradingScaleId: id } })) {
        kept.push('the demo grading scale (your own exams use it)');
        continue;
      }
      await tx.gradeBand.deleteMany({ where: { gradingScaleId: id } });
      count('grading scales', (await tx.gradingScale.deleteMany({ where: { id } })).count);
    }

    // Timetables of demo sections; demo teachers/subjects are cleared from any other timetable.
    const timetableIds = (
      await tx.timetable.findMany({
        where: { sectionId: { in: m.sectionIds } },
        select: { id: true },
      })
    ).map((x) => x.id);
    await tx.timetableEntry.deleteMany({ where: { timetableId: { in: timetableIds } } });
    count(
      'timetables',
      (await tx.timetable.deleteMany({ where: { id: { in: timetableIds } } })).count,
    );
    await tx.timetableEntry.updateMany({
      where: { teacherEmployeeId: { in: m.employeeIds } },
      data: { teacherEmployeeId: null },
    });
    await tx.timetableEntry.updateMany({
      where: { classSubjectId: { in: m.classSubjectIds } },
      data: { classSubjectId: null },
    });

    // Fees of the removed students (seeded ones and anything recorded later while testing).
    const paymentIds = (
      await tx.payment.findMany({
        where: { studentEnrolmentId: { in: enrolmentIds } },
        select: { id: true },
      })
    ).map((p) => p.id);
    const dueIds = (
      await tx.studentFeeDue.findMany({
        where: { studentEnrolmentId: { in: enrolmentIds } },
        select: { id: true },
      })
    ).map((d) => d.id);
    count(
      'receipts',
      (await tx.receipt.deleteMany({ where: { paymentId: { in: paymentIds } } })).count,
    );
    await tx.paymentAllocation.deleteMany({
      where: { OR: [{ paymentId: { in: paymentIds } }, { studentFeeDueId: { in: dueIds } }] },
    });
    count('payments', (await tx.payment.deleteMany({ where: { id: { in: paymentIds } } })).count);
    count(
      'fee adjustments',
      (await tx.feeAdjustment.deleteMany({ where: { studentFeeDueId: { in: dueIds } } })).count,
    );
    count('fee dues', (await tx.studentFeeDue.deleteMany({ where: { id: { in: dueIds } } })).count);

    // Private files (documents and photos) are removed from storage after the transaction commits.
    const studentDocs = await tx.studentDocument.findMany({
      where: { studentId: { in: studentIds } },
      select: { storageKey: true },
    });
    const employeeDocs = await tx.employeeDocument.findMany({
      where: { employeeId: { in: m.employeeIds } },
      select: { storageKey: true },
    });
    const photos = await tx.student.findMany({
      where: { id: { in: studentIds }, photoStorageKey: { not: null } },
      select: { photoStorageKey: true },
    });
    files.push(
      ...studentDocs.map((d) => d.storageKey),
      ...employeeDocs.map((d) => d.storageKey),
      ...photos.map((p) => p.photoStorageKey!),
    );
    count(
      'student documents',
      (await tx.studentDocument.deleteMany({ where: { studentId: { in: studentIds } } })).count,
    );
    count(
      'staff documents',
      (await tx.employeeDocument.deleteMany({ where: { employeeId: { in: m.employeeIds } } }))
        .count,
    );

    // Enquiries: demo ones go; your own enquiries converted into demo students just lose the link.
    count(
      'enquiry follow-ups',
      (await tx.enquiryFollowUp.deleteMany({ where: { enquiryId: { in: m.enquiryIds } } })).count,
    );
    count(
      'admission enquiries',
      (await tx.admissionEnquiry.deleteMany({ where: { id: { in: m.enquiryIds } } })).count,
    );
    const unlinked = await tx.admissionEnquiry.updateMany({
      where: { convertedStudentId: { in: studentIds } },
      data: { convertedStudentId: null },
    });
    if (unlinked.count)
      kept.push(`${unlinked.count} of your enquiries (their link to a demo student was removed)`);

    await tx.studentEnrolment.updateMany({
      where: { id: { in: enrolmentIds } },
      data: { previousEnrolmentId: null },
    });
    count(
      'enrolments',
      (await tx.studentEnrolment.deleteMany({ where: { id: { in: enrolmentIds } } })).count,
    );
    count(
      'guardians',
      (await tx.studentGuardian.deleteMany({ where: { studentId: { in: studentIds } } })).count,
    );
    count('students', (await tx.student.deleteMany({ where: { id: { in: studentIds } } })).count);

    // Fee plans and heads created by the seed (heads now used by your own plans or dues stay).
    const planItems = await tx.feeStructureItem.findMany({
      where: { feeStructureId: { in: m.feeStructureIds } },
      select: { id: true },
    });
    const usedItems = await tx.studentFeeDue.count({
      where: { feeStructureItemId: { in: planItems.map((i) => i.id) } },
    });
    if (usedItems) {
      kept.push('demo fee plans (your own students were billed from them)');
    } else {
      await tx.feeStructureItem.deleteMany({
        where: { feeStructureId: { in: m.feeStructureIds } },
      });
      count(
        'fee plans',
        (await tx.feeStructure.deleteMany({ where: { id: { in: m.feeStructureIds } } })).count,
      );
    }
    for (const id of m.feeHeadIds) {
      const h = await tx.feeHead.findUnique({
        where: { id },
        include: { _count: { select: { items: true, dues: true } } },
      });
      if (!h) continue;
      if (h._count.items || h._count.dues)
        kept.push(`fee head ${h.name} (now used by your own fee plans or dues)`);
      else {
        await tx.feeHead.delete({ where: { id } });
        count('fee heads', 1);
      }
    }

    count(
      'teacher assignments',
      (
        await tx.teacherAssignment.deleteMany({
          where: {
            OR: [
              { employeeId: { in: m.employeeIds } },
              { sectionId: { in: m.sectionIds } },
              { classSubjectId: { in: m.classSubjectIds } },
            ],
          },
        })
      ).count,
    );
    const ownSections = await tx.section.updateMany({
      where: { classTeacherId: { in: m.employeeIds }, id: { notIn: m.sectionIds } },
      data: { classTeacherId: null },
    });
    if (ownSections.count)
      kept.push(`${ownSections.count} of your sections (their demo class teacher was removed)`);
    count('sections', (await tx.section.deleteMany({ where: { id: { in: m.sectionIds } } })).count);
    count(
      'class subjects',
      (await tx.classSubject.deleteMany({ where: { id: { in: m.classSubjectIds } } })).count,
    );

    for (const id of m.subjectIds) {
      const s = await tx.subject.findUnique({
        where: { id },
        include: { _count: { select: { classSubjects: true } } },
      });
      if (!s) continue;
      if (s._count.classSubjects) kept.push(`subject ${s.name} (now used by your own classes)`);
      else {
        await tx.subject.delete({ where: { id } });
        count('subjects', 1);
      }
    }

    count('staff', (await tx.employee.deleteMany({ where: { id: { in: m.employeeIds } } })).count);

    if (m.academicYearId) {
      const y = await tx.academicYear.findUnique({
        where: { id: m.academicYearId },
        include: {
          _count: {
            select: {
              sections: true,
              examinations: true,
              timetables: true,
              gradingScales: true,
              classSubjects: true,
              enrolments: true,
              teacherAssignments: true,
              feeStructures: true,
              feeDues: true,
            },
          },
        },
      });
      if (y) {
        const used = Object.values(y._count).some((c) => c > 0);
        if (used) kept.push(`academic year ${y.name} (it now has your own classes or fee plans)`);
        else {
          await tx.academicYear.delete({ where: { id: y.id } });
          count('academic years', 1);
        }
      }
    }

    count(
      'contact messages',
      (await tx.contactMessage.deleteMany({ where: { id: { in: m.contactMessageIds } } })).count,
    );
    count(
      'announcements',
      (await tx.announcement.deleteMany({ where: { id: { in: m.announcementIds } } })).count,
    );
    count('events', (await tx.event.deleteMany({ where: { id: { in: m.eventIds } } })).count);
    count(
      'staff notices',
      (await tx.internalNotice.deleteMany({ where: { id: { in: m.noticeIds } } })).count,
    );

    const roleAssignments = await tx.userRole.deleteMany({
      where: { roleId: { in: m.roleIds }, userId: { notIn: m.userIds } },
    });
    if (roleAssignments.count)
      kept.push(`${roleAssignments.count} of your users (the demo role was taken off them)`);
    await tx.userRole.deleteMany({ where: { roleId: { in: m.roleIds } } });
    await tx.rolePermission.deleteMany({ where: { roleId: { in: m.roleIds } } });
    count('roles', (await tx.role.deleteMany({ where: { id: { in: m.roleIds } } })).count);

    await tx.auditLog.create({
      data: {
        action: AUDIT_ACTIONS.DEMO_DATA_CLEARED,
        entityType: 'demo_data',
        afterJson: { removed, kept } as Prisma.InputJsonValue,
        reason: 'pnpm demo:clear',
      },
    });
  }, TX);

  // Demo logins: deleted, unless the audit log (which can never be changed) refers to them —
  // e.g. after you signed in with one. Those are deactivated instead and reused by the next seed.
  for (const id of m.userIds) {
    try {
      await prisma.$transaction([
        prisma.userRole.deleteMany({ where: { userId: id } }),
        prisma.user.delete({ where: { id } }),
      ]);
      count('logins', 1);
    } catch {
      const u = await prisma.user.update({
        where: { id },
        data: { status: 'INACTIVE', roles: { deleteMany: {} } },
      });
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      kept.push(`login ${u.email} (deactivated — the audit log refers to it)`);
    }
  }

  const root = resolve(opts.storageDir ?? './storage');
  let deletedFiles = 0;
  for (const key of files) {
    try {
      await unlink(join(root, key));
      deletedFiles++;
    } catch {
      // Already gone — nothing to do.
    }
  }
  count('files', deletedFiles);

  return { cleared: true, removed, kept };
}
