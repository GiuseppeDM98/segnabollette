import { describe, expect, it } from 'vitest';
import { BillInputSchema } from '@/lib/domain/bill-input';
import type { SupplyKind } from '@/lib/domain/types';
import { assertInputFitsSupply } from '@/lib/services/bills';
import { emptyBillInput, lineTemplateFor } from './line-templates';

const CASES: Array<{ kind: SupplyKind; hasPhotovoltaic: boolean }> = [
  { kind: 'electricity', hasPhotovoltaic: false },
  { kind: 'electricity', hasPhotovoltaic: true },
  { kind: 'gas', hasPhotovoltaic: false },
  { kind: 'water', hasPhotovoltaic: false },
  { kind: 'telecom', hasPhotovoltaic: false },
  { kind: 'waste', hasPhotovoltaic: false },
];

/** The template filled with round invented figures, as a person would type it. */
function filledBill(kind: SupplyKind, hasPhotovoltaic: boolean) {
  const input = emptyBillInput(
    { id: 'supply-1', kind, supplierName: 'Fenicottero Energia', hasPhotovoltaic },
    '2026-10-15',
  );
  return {
    ...input,
    totalCents: 1000 * input.lines.length,
    lines: input.lines.map((line) => ({
      ...line,
      amountCents: line.category === 'feed_in' ? -500 : 1000,
      quantity: line.quantity === null ? null : 100,
    })),
  };
}

describe('lineTemplateFor', () => {
  it.each(CASES)(
    'gives $kind (photovoltaic $hasPhotovoltaic) a template that the schema and the supply checks accept',
    ({ kind, hasPhotovoltaic }) => {
      const bill = filledBill(kind, hasPhotovoltaic);

      expect(BillInputSchema.safeParse(bill).success).toBe(true);
      expect(() => assertInputFitsSupply({ kind, hasPhotovoltaic }, bill)).not.toThrow();
    },
  );

  it('gives electricity exactly one commodity line, in kWh', () => {
    const commodity = lineTemplateFor('electricity', false).filter(
      (line) => line.category === 'commodity',
    );

    expect(commodity).toHaveLength(1);
    expect(commodity[0]?.quantityUnit).toBe('kWh');
  });

  it('ends the photovoltaic electricity template with the fed-in energy credit', () => {
    const withPanels = lineTemplateFor('electricity', true);
    const withoutPanels = lineTemplateFor('electricity', false);

    expect(withPanels.at(-1)).toMatchObject({
      description: 'Energia ceduta',
      category: 'feed_in',
      component: 'lump',
    });
    expect(withoutPanels.some((line) => line.category === 'feed_in')).toBe(false);
  });

  it('gives internet and phone a fee and its VAT, and TARI one fee without VAT', () => {
    const shape = (kind: SupplyKind) =>
      lineTemplateFor(kind, false).map(({ description, category, component }) => ({
        description,
        category,
        component,
      }));

    expect(shape('telecom')).toEqual([
      { description: 'Canone', category: 'sale', component: 'fixed' },
      { description: 'IVA', category: 'vat', component: 'lump' },
    ]);
    expect(shape('waste')).toEqual([{ description: 'TARI', category: 'sale', component: 'fixed' }]);
  });
});

describe('emptyBillInput', () => {
  const supply = {
    id: 'supply-1',
    kind: 'gas' as const,
    supplierName: 'Fenicottero Energia',
    hasPhotovoltaic: false,
  };

  it('covers the month before today', () => {
    expect(emptyBillInput(supply, '2026-01-15')).toMatchObject({
      periodStart: '2025-12-01',
      periodEnd: '2025-12-31',
    });
    expect(emptyBillInput(supply, '2028-03-10')).toMatchObject({
      periodStart: '2028-02-01',
      periodEnd: '2028-02-29',
    });
  });

  it('starts every line on the bill period with zero amounts and a quantity only on consumption', () => {
    const input = emptyBillInput(supply, '2026-01-15');

    expect(input.supplierName).toBe('Fenicottero Energia');
    for (const line of input.lines) {
      expect(line).toMatchObject({ periodStart: '2025-12-01', periodEnd: '2025-12-31' });
      expect(line.amountCents).toBe(0);
      expect(line.quantity).toBe(line.category === 'commodity' ? 0 : null);
    }
    expect(BillInputSchema.safeParse(input).success).toBe(true);
  });
});
