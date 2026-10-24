import { describe, expect, it } from 'vitest';
import {
  type BillInput,
  BillInputSchema,
  type BillLineInput,
  BillLineInputSchema,
  SelfReadingInputSchema,
} from './bill-input';

const LINE: BillLineInput = {
  description: 'Energia',
  category: 'commodity',
  component: 'variable',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  quantity: 200,
  quantityUnit: 'kWh',
  unitPriceMicros: 100_000,
  amountCents: 2000,
  band: null,
  isRecalculation: false,
  isEstimated: false,
  vatRateBp: null,
};

const BILL: BillInput = {
  supplyId: 'supply-test',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  issueDate: null,
  dueDate: null,
  supplierName: null,
  offerName: null,
  totalCents: 2000,
  amountDueCents: null,
  conversionFactor: null,
  calorificValueGj: null,
  isEstimated: false,
  lines: [LINE],
  readings: [],
  overlapDecision: null,
};

function errorPaths(result: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[] }> };
}) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

describe('BillInputSchema', () => {
  it('accepts a well-formed bill', () => {
    expect(BillInputSchema.safeParse(BILL).success).toBe(true);
  });

  it('refuses a period that ends before it starts, on periodEnd', () => {
    const result = BillInputSchema.safeParse({ ...BILL, periodEnd: '2026-08-31' });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('periodEnd');
  });

  it('refuses a line with a quantity and no unit', () => {
    const result = BillLineInputSchema.safeParse({ ...LINE, quantityUnit: null });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('quantityUnit');
  });

  it('speaks Italian also in the messages it does not spell out', () => {
    const result = BillLineInputSchema.safeParse({ ...LINE, category: 'fenicottero' });

    expect(result.error?.issues[0]?.message).toMatch(/non valid/);
  });
});

describe('SelfReadingInputSchema', () => {
  it('refuses the same register twice', () => {
    const result = SelfReadingInputSchema.safeParse({
      supplyId: 'supply-test',
      readOn: '2026-10-10',
      values: [
        { register: 'F1', value: 100 },
        { register: 'F1', value: 200 },
      ],
    });

    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('values');
  });
});
