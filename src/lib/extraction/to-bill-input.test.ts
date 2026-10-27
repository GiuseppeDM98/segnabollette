import { describe, expect, it } from 'vitest';
import type { Extraction } from './schema';
import { fixtureExtraction } from './testing/fixture-bills';
import { type ToBillInputContext, toBillInput } from './to-bill-input';

const SUPPLIES: ToBillInputContext['supplies'] = [
  { id: 'luce', kind: 'electricity', identifier: 'IT001E00000011', archivedAt: null },
  { id: 'gas', kind: 'gas', identifier: '00000000000011', archivedAt: null },
];

function context(preselectedSupplyId: string | null = null): ToBillInputContext {
  return { supplies: SUPPLIES, preselectedSupplyId };
}

describe('toBillInput', () => {
  it('keeps the re-billed August lines in August and the others in the bill period', () => {
    const gas = fixtureExtraction('gas-pellicano.pdf');

    const { input } = toBillInput(gas, context());

    const august = input.lines.filter((line) => line.isRecalculation);
    expect(august).toHaveLength(2);
    for (const line of august) {
      expect(line).toMatchObject({ periodStart: '2024-08-01', periodEnd: '2024-08-31' });
    }
    for (const line of input.lines.filter((other) => !other.isRecalculation)) {
      expect(line).toMatchObject({ periodStart: '2024-09-01', periodEnd: '2024-09-30' });
    }
    expect(input.conversionFactor).toBe(1.02);
    expect(input.readings.every((reading) => reading.source === 'bill_actual')).toBe(true);
  });

  it('drops the band from the lines of a supply that is not electricity', () => {
    const gas = fixtureExtraction('gas-pellicano.pdf');
    const withBand: Extraction = {
      ...gas,
      lines: gas.lines.map((line) => ({ ...line, band: 'single' as const })),
    };

    const { input } = toBillInput(withBand, context('gas'));

    expect(input.lines.every((line) => line.band === null)).toBe(true);
  });

  it('turns the sentinels back into null', () => {
    const { input } = toBillInput(fixtureExtraction('luce-pellicano.pdf'), context());

    expect(input.conversionFactor).toBeNull();
    expect(input.calorificValueGj).toBeNull();
    const vat = input.lines.find((line) => line.category === 'vat');
    expect(vat).toMatchObject({
      quantity: null,
      quantityUnit: null,
      unitPriceMicros: null,
      band: null,
      vatRateBp: 1000,
    });
    const outside = input.lines.find((line) => line.category === 'outside');
    expect(outside?.vatRateBp).toBeNull();
  });

  it('recognises the supply by its identifier written with spaces', () => {
    const electricity: Extraction = {
      ...fixtureExtraction('luce-pellicano.pdf'),
      supplyIdentifier: 'IT 001 E00000011',
    };

    const draft = toBillInput(electricity, context());

    expect(draft.matchedSupplyId).toBe('luce');
    expect(draft.input.supplyId).toBe('luce');
    expect(draft.suggestedSupply).toBeNull();
  });

  it('warns when the chosen supply has another kind than the document', () => {
    const draft = toBillInput(fixtureExtraction('luce-pellicano.pdf'), context('gas'));

    expect(draft.matchedSupplyId).toBe('gas');
    expect(draft.warnings).toContain('Il documento sembra una bolletta di Luce');
  });

  it('leaves an unrecognised utility without a kind and says so', () => {
    const other: Extraction = {
      ...fixtureExtraction('internet-armadillo.pdf'),
      supplyKind: 'other',
    };

    const draft = toBillInput(other, context());

    expect(draft.input.supplyId).toBe('');
    expect(draft.suggestedSupply?.kind).toBeNull();
    expect(draft.warnings).toContain('Tipo di utenza non riconosciuto');
  });

  it('gives a line with half a period the whole period of the bill', () => {
    const gas = fixtureExtraction('gas-pellicano.pdf');
    const [first, ...rest] = gas.lines;
    if (!first) throw new Error('fixture without lines');

    const { input } = toBillInput(
      { ...gas, lines: [{ ...first, periodEnd: '' }, ...rest] },
      context(),
    );

    expect(input.lines[0]).toMatchObject({ periodStart: '2024-09-01', periodEnd: '2024-09-30' });
  });

  it('drops a reading without a date and says which', () => {
    const electricity = fixtureExtraction('luce-pellicano.pdf');
    const readings = [
      { date: '', register: 'F1' as const, value: 1200, kind: 'actual' as const },
      ...electricity.readings,
    ];

    const draft = toBillInput({ ...electricity, readings }, context());

    expect(draft.input.readings).toHaveLength(electricity.readings.length);
    expect(draft.warnings).toContain('Lettura senza data scartata: F1 1200');
  });

  it('keeps a printed quantity of 0 kWh as 0 kWh', () => {
    const electricity = fixtureExtraction('luce-pellicano.pdf');
    const [first, ...rest] = electricity.lines;
    if (!first) throw new Error('fixture without lines');

    const { input } = toBillInput(
      { ...electricity, lines: [{ ...first, quantity: 0, amountCents: 0 }, ...rest] },
      context(),
    );

    expect(input.lines[0]).toMatchObject({ quantity: 0, quantityUnit: 'kWh' });
  });
});
