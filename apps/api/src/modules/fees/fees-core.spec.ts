import { amountInWords, formatRupees } from '@school/shared';
import { paiseToDb, toPaise } from '../../common/utils/money.js';
import { dueMath, shortYear, type DueRow } from './fees-core.js';

const due = (
  amount: string,
  adjustments: [string, string][] = [],
  allocations: [string, string][] = [],
) =>
  ({
    amountDue: amount,
    adjustments: adjustments.map(([adjustmentType, a]) => ({ adjustmentType, amount: a })),
    allocations: allocations.map(([a, status]) => ({ allocatedAmount: a, payment: { status } })),
  }) as unknown as DueRow;

describe('fees core', () => {
  it('writes amounts in Indian words for receipts', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only');
    expect(amountInWords(1500)).toBe('Rupees One Thousand Five Hundred Only');
    expect(amountInWords(123456.5)).toBe(
      'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only',
    );
    expect(amountInWords(25_00_00_000)).toBe('Rupees Twenty Five Crore Only');
    expect(formatRupees(123456.5)).toBe('₹1,23,456.50');
  });

  it('converts money without floating-point drift', () => {
    expect(toPaise('0.10') + toPaise('0.20')).toBe(30);
    expect(paiseToDb(123456)).toBe('1234.56');
    expect(paiseToDb(5)).toBe('0.05');
    expect(shortYear('2026-2027')).toBe('2026-27');
  });

  it('derives balance and status from adjustments and posted payments only', () => {
    expect(dueMath(due('3000.00'))).toMatchObject({ balance: 300000, status: 'OPEN' });
    expect(
      dueMath(
        due(
          '3000.00',
          [
            ['CONCESSION', '300.00'],
            ['FINE', '100.00'],
          ],
          [['1000.00', 'POSTED']],
        ),
      ),
    ).toMatchObject({
      balance: 180000,
      status: 'PARTIAL',
    });
    // Void and reversed payments no longer count.
    expect(
      dueMath(
        due(
          '3000.00',
          [],
          [
            ['3000.00', 'VOID'],
            ['3000.00', 'REVERSED'],
          ],
        ),
      ),
    ).toMatchObject({ status: 'OPEN' });
    expect(dueMath(due('500.00', [['WAIVER', '500.00']]))).toMatchObject({
      balance: 0,
      status: 'WAIVED',
    });
    expect(dueMath(due('500.00', [], [['500.00', 'POSTED']]))).toMatchObject({
      balance: 0,
      status: 'PAID',
    });
  });
});
