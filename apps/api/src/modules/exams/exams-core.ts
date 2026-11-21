import { DEFAULT_PASS_PERCENT, type ExamSubjectItem, type GradeBandItem } from '@school/shared';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { isoDayOrNull } from '../../common/utils/content.js';

type Db = PrismaClient | Prisma.TransactionClient;

export const examSubjectInclude = {
  classSubject: { include: { subject: { select: { id: true, name: true, code: true } } } },
} satisfies Prisma.ExamSubjectInclude;

export type ExamSubjectRow = Prisma.ExamSubjectGetPayload<{ include: typeof examSubjectInclude }>;

/** Marks are NUMERIC(7,2); handle them as hundredths to avoid float drift. */
export const toHundredths = (v: Prisma.Decimal | string | number | null | undefined) =>
  v === null || v === undefined ? null : Math.round(Number(v.toString()) * 100);
export const fromHundredths = (h: number) => h / 100;
export const hundredthsToDb = (h: number) =>
  `${Math.floor(h / 100)}.${String(h % 100).padStart(2, '0')}`;

/** Pass mark of a component: the configured one, else 33% of the maximum (rounded up to 2 dp). */
export function passMarksOf(s: {
  maxMarks: Prisma.Decimal | string;
  passMarks: Prisma.Decimal | string | null;
}) {
  const configured = toHundredths(s.passMarks);
  if (configured !== null) return configured;
  return Math.ceil((toHundredths(s.maxMarks)! * DEFAULT_PASS_PERCENT) / 100);
}

export function subjectLabel(s: ExamSubjectRow) {
  return s.componentName
    ? `${s.classSubject.subject.name} — ${s.componentName}`
    : s.classSubject.subject.name;
}

export function toExamSubjectItem(s: ExamSubjectRow): ExamSubjectItem {
  return {
    id: s.id,
    classSubjectId: s.classSubjectId,
    subject: s.classSubject.subject,
    subjectType: s.classSubject.subjectType,
    componentName: s.componentName,
    label: subjectLabel(s),
    examDate: isoDayOrNull(s.examDate),
    maxMarks: fromHundredths(toHundredths(s.maxMarks)!),
    passMarks: fromHundredths(passMarksOf(s)),
    sequenceNo: s.sequenceNo,
  };
}

/** Percentage rounded to 2 decimals (what the grade bands are matched against). */
export const percentage = (obtained: number, max: number) =>
  max > 0 ? Math.round((obtained / max) * 10000) / 100 : 0;

export function gradeFor(bands: GradeBandItem[], pct: number): string | null {
  return bands.find((b) => pct >= b.minPercentage && pct <= b.maxPercentage)?.gradeLabel ?? null;
}

/**
 * The scale an exam uses: its own (fixed at finalisation), otherwise the most specific active
 * scale — year + class, then year, then class, then school-wide.
 */
export async function resolveScale(
  db: Db,
  exam: { gradingScaleId: string | null; academicYearId: string; classId: string },
) {
  const include = { bands: { orderBy: { minPercentage: 'desc' as const } } };
  if (exam.gradingScaleId) {
    return db.gradingScale.findUnique({ where: { id: exam.gradingScaleId }, include });
  }
  const candidates = await db.gradingScale.findMany({
    where: {
      isActive: true,
      OR: [{ academicYearId: exam.academicYearId }, { academicYearId: null }],
      AND: [{ OR: [{ classId: exam.classId }, { classId: null }] }],
    },
    include,
    orderBy: { createdAt: 'desc' },
  });
  const score = (s: { academicYearId: string | null; classId: string | null }) =>
    (s.academicYearId ? 2 : 0) + (s.classId ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function toBands(
  bands: {
    minPercentage: Prisma.Decimal;
    maxPercentage: Prisma.Decimal;
    gradeLabel: string;
    remark: string | null;
  }[],
): GradeBandItem[] {
  return bands.map((b) => ({
    minPercentage: Number(b.minPercentage),
    maxPercentage: Number(b.maxPercentage),
    gradeLabel: b.gradeLabel,
    remark: b.remark,
  }));
}
