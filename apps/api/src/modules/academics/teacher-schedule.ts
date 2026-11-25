import { dayToDate, isoDay } from '../../common/utils/content.js';

const addDays = (day: string, n: number) =>
  isoDay(new Date(dayToDate(day).getTime() + n * 86_400_000));

/** 1 = Monday … 7 = Sunday (the timetable's day numbering). */
export const isoWeekday = (day: string) => {
  const d = dayToDate(day).getUTCDay();
  return d === 0 ? 7 : d;
};

/**
 * The day whose periods order "My classes": today if it is a school day on which the teacher has
 * lessons, otherwise the next such day (Sundays and holidays are skipped). Null when the teacher
 * has no lessons at all (or none within `horizon` days).
 */
export function scheduleDate(
  today: string,
  lessonDays: ReadonlySet<number>,
  holidays: readonly { startDate: string; endDate: string }[],
  horizon = 45,
): string | null {
  if (!lessonDays.size) return null;
  for (let i = 0; i <= horizon; i++) {
    const day = addDays(today, i);
    const dow = isoWeekday(day);
    if (dow === 7 || !lessonDays.has(dow)) continue;
    if (holidays.some((h) => h.startDate <= day && day <= h.endDate)) continue;
    return day;
  }
  return null;
}

export interface SortableSection {
  isClassTeacher: boolean;
  /** "HH:MM" of the teacher's first period in the section on the schedule day. */
  firstToday: string | null;
  /** Sortable key of the first period in the whole week (e.g. "1-08:00"), for sections not taught that day. */
  firstInWeek: string | null;
  levelOrder: number;
  sectionName: string;
}

/** Class-teacher class first, then by the schedule day's periods, then the week, then class order. */
export function compareSections(a: SortableSection, b: SortableSection): number {
  if (a.isClassTeacher !== b.isClassTeacher) return a.isClassTeacher ? -1 : 1;
  const byKey = (x: string | null, y: string | null) =>
    x === y ? 0 : x === null ? 1 : y === null ? -1 : x.localeCompare(y);
  return (
    byKey(a.firstToday, b.firstToday) ||
    byKey(a.firstInWeek, b.firstInWeek) ||
    a.levelOrder - b.levelOrder ||
    a.sectionName.localeCompare(b.sectionName)
  );
}
