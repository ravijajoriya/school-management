import { describe, expect, it } from 'vitest';
import { monthBounds, monthLabel, payTotals } from './payroll-core.js';

describe('payroll core', () => {
  it('finds the first and last day of a month, including leap years', () => {
    expect(monthBounds('2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthBounds('2027-02')).toEqual({ start: '2027-02-01', end: '2027-02-28' });
    expect(monthBounds('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('labels a month', () => {
    expect(monthLabel('2026-04-01')).toBe('April 2026');
  });

  it('computes gross, deductions and net in paise', () => {
    expect(
      payTotals([
        { componentType: 'EARNING', amount: 25_000_00 },
        { componentType: 'EARNING', amount: 4_500_50 },
        { componentType: 'DEDUCTION', amount: 1_800_00 },
        { componentType: 'DEDUCTION', amount: 200_00 },
      ]),
    ).toEqual({ gross: 29_500_50, deductions: 2_000_00, net: 27_500_50 });
    expect(payTotals([])).toEqual({ gross: 0, deductions: 0, net: 0 });
  });
});
