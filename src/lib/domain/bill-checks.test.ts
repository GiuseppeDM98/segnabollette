import { describe, expect, it } from 'vitest';
import { checkBillArithmetic, findOverlappingBills } from './bill-checks';
import type { BillLineInput } from './bill-input';
import type { LineCategory } from './types';

function line(category: LineCategory, amountCents: number, extra: Partial<BillLineInput> = {}) {
  return {
    description: category,
    category,
    component: 'lump',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    quantity: null,
    quantityUnit: null,
    unitPriceMicros: null,
    amountCents,
    band: null,
    isRecalculation: false,
    isEstimated: false,
    vatRateBp: null,
    ...extra,
  } satisfies BillLineInput;
}

const LINES = [
  line('commodity', 1000),
  line('network', 500),
  line('vat', 150),
  line('outside', 900),
];

describe('checkBillArithmetic', () => {
  it('matches the bill total without the lines outside it', () => {
    const report = checkBillArithmetic({ totalCents: 1650, amountDueCents: null, lines: LINES });

    expect(report.isTotalConsistent).toBe(true);
    expect(report.amountDueDifferenceCents).toBeNull();
  });

  it('reports a total that is off by more than the tolerance', () => {
    const report = checkBillArithmetic({ totalCents: 1660, amountDueCents: null, lines: LINES });

    expect(report.totalDifferenceCents).toBe(-10);
    expect(report.isTotalConsistent).toBe(false);
  });

  it('matches the amount due with every line, outside ones included', () => {
    const report = checkBillArithmetic({ totalCents: 1650, amountDueCents: 2550, lines: LINES });

    expect(report.isAmountDueConsistent).toBe(true);
  });

  it('accepts a yearly fixed fee charged pro rata', () => {
    const fee = line('sale', 329, {
      component: 'fixed',
      quantity: 30 / 365,
      quantityUnit: 'year',
      unitPriceMicros: 40_000_000,
    });

    const report = checkBillArithmetic({ totalCents: 329, amountDueCents: null, lines: [fee] });

    expect(report.lineMismatches).toEqual([]);
  });

  it('reports a line whose quantity times price is far from its amount', () => {
    const energy = line('commodity', 1000, {
      quantity: 4,
      quantityUnit: 'kWh',
      unitPriceMicros: 99_000,
    });

    const report = checkBillArithmetic({ totalCents: 1000, amountDueCents: null, lines: [energy] });

    expect(report.lineMismatches).toEqual([{ index: 0, expectedCents: 40, amountCents: 1000 }]);
  });
});

describe('findOverlappingBills', () => {
  const september = { id: 'september', periodStart: '2026-09-01', periodEnd: '2026-09-30' };

  it('does not see the month before as an overlap', () => {
    const august = { id: 'august', periodStart: '2026-08-01', periodEnd: '2026-08-31' };

    expect(findOverlappingBills(september, [august])).toEqual([]);
  });

  it('sees a period that shares days', () => {
    const straddling = { id: 'straddling', periodStart: '2026-09-15', periodEnd: '2026-10-14' };

    expect(findOverlappingBills(september, [straddling])).toEqual([straddling]);
  });

  it('does not see the bill itself', () => {
    expect(findOverlappingBills(september, [september])).toEqual([]);
  });
});
