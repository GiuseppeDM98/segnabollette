import { describe, expect, it } from 'vitest';
import { checkBillArithmetic } from '@/lib/domain/bill-checks';
import { BillInputSchema } from '@/lib/domain/bill-input';
import { monthRange } from '@/lib/domain/dates';
import { buildSeedBills } from './seed-data';

describe('buildSeedBills', () => {
  it('builds 14 valid and consistent electricity bills, the second with the recalculation pair', () => {
    const bills = buildSeedBills('electricity', 'supply-test', monthRange('2025-01', '2026-02'));

    expect(bills).toHaveLength(14);
    for (const bill of bills) {
      expect(BillInputSchema.safeParse(bill).success).toBe(true);
      const report = checkBillArithmetic(bill);
      expect(report.isTotalConsistent).toBe(true);
      expect(report.isAmountDueConsistent).toBe(true);
    }
    const recalculations = bills[1]?.lines.filter((line) => line.isRecalculation) ?? [];
    expect(
      recalculations.map((line) => [line.quantity, line.amountCents, line.periodStart]),
    ).toEqual([
      [200, 2000, '2025-01-01'],
      [-200, -2000, '2025-01-01'],
    ]);
  });

  it('charges the TV fee from January to October, outside the bill total', () => {
    const bills = buildSeedBills('electricity', 'supply-test', monthRange('2025-01', '2026-02'));

    const january = bills[0];
    const november = bills[10];
    expect(january?.lines.some((line) => line.category === 'outside')).toBe(true);
    expect(january).toMatchObject({ totalCents: 4730, amountDueCents: 5630 });
    expect(november?.lines.some((line) => line.category === 'outside')).toBe(false);
    expect(november).toMatchObject({ totalCents: 4730, amountDueCents: 4730 });
  });

  it('builds 5 quarterly water bills from 15 months, the last ending with the range', () => {
    const bills = buildSeedBills('water', 'supply-test', monthRange('2025-01', '2026-03'));

    expect(bills).toHaveLength(5);
    expect(bills[4]).toMatchObject({ periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    for (const bill of bills) expect(BillInputSchema.safeParse(bill).success).toBe(true);
  });
});
