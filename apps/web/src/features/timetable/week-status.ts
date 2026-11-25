import { useEffect, useState } from 'react';

export type LessonStatus = 'done' | 'current' | 'next' | 'upcoming' | 'holiday';

const dayMs = 86_400_000;
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const addDays = (d: string, n: number) =>
  new Date(toDate(d).getTime() + n * dayMs).toISOString().slice(0, 10);
/** 1 = Monday … 7 = Sunday. */
export const isoWeekday = (d: string) => {
  const w = toDate(d).getUTCDay();
  return w === 0 ? 7 : w;
};
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Monday of the week to show: this week, or next week when today is a Sunday. */
export function weekStart(today: string): string {
  const dow = isoWeekday(today);
  return dow === 7 ? addDays(today, 1) : addDays(today, 1 - dow);
}

/** Status of one lesson for the shown week, given "now" in the school's time zone. */
export function lessonStatus(
  lesson: { date: string; startTime: string; endTime: string },
  now: { date: string; minutes: number },
  holiday: boolean,
): Exclude<LessonStatus, 'next'> {
  if (holiday) return 'holiday';
  if (lesson.date < now.date) return 'done';
  if (lesson.date > now.date) return 'upcoming';
  if (now.minutes >= minutes(lesson.endTime)) return 'done';
  if (now.minutes >= minutes(lesson.startTime)) return 'current';
  return 'upcoming';
}

const zoned = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

/** Current school-local date and minute of the day, refreshed every 30 seconds. */
export function useSchoolNow() {
  const [now, setNow] = useState(zoned);
  useEffect(() => {
    const id = setInterval(() => setNow(zoned()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
