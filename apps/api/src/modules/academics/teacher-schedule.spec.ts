import { describe, expect, it } from 'vitest';
import { compareSections, isoWeekday, scheduleDate } from './teacher-schedule.js';

describe('teacher schedule', () => {
  it('numbers weekdays Monday = 1 … Sunday = 7', () => {
    expect(isoWeekday('2026-11-23')).toBe(1); // Monday
    expect(isoWeekday('2026-11-29')).toBe(7); // Sunday
  });

  it('uses today on a school day with lessons, otherwise the next one', () => {
    const monToSat = new Set([1, 2, 3, 4, 5, 6]);
    expect(scheduleDate('2026-11-25', monToSat, [])).toBe('2026-11-25'); // Wednesday
    expect(scheduleDate('2026-11-29', monToSat, [])).toBe('2026-11-30'); // Sunday → Monday
    // Holiday Mon–Tue: skip to Wednesday.
    expect(
      scheduleDate('2026-11-29', monToSat, [{ startDate: '2026-11-30', endDate: '2026-12-01' }]),
    ).toBe('2026-12-02');
    // Teaches only on Fridays.
    expect(scheduleDate('2026-11-25', new Set([5]), [])).toBe('2026-11-27');
    expect(scheduleDate('2026-11-25', new Set(), [])).toBeNull();
  });

  it('orders class-teacher class first, then by period, then the week', () => {
    const s = (over: Partial<Parameters<typeof compareSections>[0]>) => ({
      isClassTeacher: false,
      firstToday: null,
      firstInWeek: null,
      levelOrder: 5,
      sectionName: 'A',
      ...over,
    });
    const list = [
      s({ sectionName: 'C', firstToday: '10:00' }),
      s({ sectionName: 'D', firstInWeek: '2-08:00' }),
      s({ sectionName: 'B', firstToday: '08:40' }),
      s({ sectionName: 'CT', isClassTeacher: true, firstToday: '11:00' }),
      s({ sectionName: 'E', levelOrder: 1 }),
    ];
    expect(list.sort(compareSections).map((x) => x.sectionName)).toEqual([
      'CT',
      'B',
      'C',
      'D',
      'E',
    ]);
  });
});
