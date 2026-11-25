import { describe, expect, it } from 'vitest';
import { isoWeekday, lessonStatus, weekStart } from './week-status';

describe('timetable week status', () => {
  it('shows this week, or the coming week on a Sunday', () => {
    expect(weekStart('2026-11-25')).toBe('2026-11-23'); // Wednesday → Monday
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2026-11-29')).toBe('2026-11-30'); // Sunday → next Monday
    expect(isoWeekday('2026-11-29')).toBe(7);
  });

  it('classifies lessons as done, current, upcoming or holiday', () => {
    const now = { date: '2026-11-25', minutes: 9 * 60 + 10 }; // Wed 09:10
    const at = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime });
    expect(lessonStatus(at('2026-11-24', '10:00', '10:40'), now, false)).toBe('done');
    expect(lessonStatus(at('2026-11-25', '08:00', '08:40'), now, false)).toBe('done');
    expect(lessonStatus(at('2026-11-25', '08:50', '09:30'), now, false)).toBe('current');
    expect(lessonStatus(at('2026-11-25', '09:30', '10:10'), now, false)).toBe('upcoming');
    expect(lessonStatus(at('2026-11-26', '08:00', '08:40'), now, false)).toBe('upcoming');
    expect(lessonStatus(at('2026-11-26', '08:00', '08:40'), now, true)).toBe('holiday');
  });
});
