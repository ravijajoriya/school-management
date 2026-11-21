import { z } from 'zod';
import { optionalText, uuidSchema } from './common.js';

export const TIMETABLE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type TimetableStatus = (typeof TIMETABLE_STATUSES)[number];
export const TIMETABLE_STATUS_LABELS: Record<TimetableStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  ARCHIVED: 'Archived',
};

/** ISO weekday numbers (1 = Monday). Schools here work Monday–Saturday. */
export const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6] as const;
export const DAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};
export const DAY_SHORT: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const optionalDate = z.iso
  .date()
  .or(z.literal(''))
  .optional()
  .transform((v) => v || undefined);

export const createTimetableSchema = z.object({
  sectionId: uuidSchema,
  name: z.string().trim().min(2, 'Enter a name').max(100),
  effectiveFrom: optionalDate,
  effectiveTo: optionalDate,
  /** Optional: start from a copy of another timetable's periods and lessons. */
  copyFromId: uuidSchema
    .or(z.literal(''))
    .optional()
    .transform((v) => v || undefined),
});
export type CreateTimetableInput = z.input<typeof createTimetableSchema>;
export type CreateTimetableData = z.output<typeof createTimetableSchema>;

export const updateTimetableSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  effectiveFrom: z.iso.date().nullable().optional(),
  effectiveTo: z.iso.date().nullable().optional(),
});
export type UpdateTimetableInput = z.infer<typeof updateTimetableSchema>;

export const timetableEntryInputSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    periodNumber: z.coerce.number().int().min(0).max(20),
    startTime: time,
    endTime: time,
    isBreak: z.boolean().default(false),
    classSubjectId: uuidSchema.nullable().optional(),
    teacherEmployeeId: uuidSchema.nullable().optional(),
    roomLabel: optionalText(50),
  })
  .refine((e) => e.endTime > e.startTime, {
    path: ['endTime'],
    message: 'End time must be after start time',
  })
  .refine((e) => !e.isBreak || (!e.classSubjectId && !e.teacherEmployeeId), {
    message: 'A break has no subject or teacher',
  });
export type TimetableEntryInput = z.input<typeof timetableEntryInputSchema>;

/** Replaces all entries of a DRAFT timetable. */
export const saveTimetableEntriesSchema = z.object({
  entries: z
    .array(timetableEntryInputSchema)
    .max(200)
    .refine((e) => new Set(e.map((x) => `${x.dayOfWeek}|${x.periodNumber}`)).size === e.length, {
      message: 'Each day and period can have only one entry',
    }),
});
export type SaveTimetableEntriesInput = z.input<typeof saveTimetableEntriesSchema>;
export type SaveTimetableEntriesData = z.output<typeof saveTimetableEntriesSchema>;

export const listTimetablesQuerySchema = z.object({
  academicYearId: uuidSchema,
  sectionId: uuidSchema.optional(),
});

export interface TimetableEntryItem {
  id: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  roomLabel: string | null;
  classSubject: { id: string; subjectName: string } | null;
  teacher: { id: string; fullName: string } | null;
}

export interface TimetableItem {
  id: string;
  name: string;
  status: TimetableStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  section: {
    id: string;
    className: string;
    sectionName: string;
    academicYear: { id: string; name: string; status: string };
  };
  createdBy: string;
  entries: TimetableEntryItem[];
}

export interface TimetableListItem {
  id: string;
  name: string;
  status: TimetableStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  section: { id: string; className: string; sectionName: string };
  periods: number;
  lessons: number;
}

export interface TimetableClash {
  kind: 'TEACHER' | 'INCOMPLETE';
  dayOfWeek: number;
  periodNumber: number;
  message: string;
}

/** A teacher's week across every published timetable. */
export interface TeacherTimetable {
  teacher: { id: string; fullName: string };
  entries: {
    dayOfWeek: number;
    periodNumber: number;
    startTime: string;
    endTime: string;
    className: string;
    sectionName: string;
    subjectName: string;
    roomLabel: string | null;
  }[];
}
