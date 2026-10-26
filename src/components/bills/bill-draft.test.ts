import { describe, expect, it } from 'vitest';
import { billInput, commodityLine } from '@/lib/db/testing/fixtures';
import type { BillInput } from '@/lib/domain/bill-input';
import { type BillDraft, draftFromInput, inputFromDraft } from './bill-draft';

function lineOf(draft: BillDraft, index: number) {
  const line = draft.lines[index];
  if (!line) throw new Error(`The draft has no line ${index}`);
  return line;
}

/** A September bill with a pro-rata yearly fee, a VAT line at 10% and a reading. */
function richInput(): BillInput {
  return billInput('supply-1', {
    totalCents: 3434,
    amountDueCents: 4334,
    lines: [
      commodityLine({ amountCents: 2000 }),
      {
        ...commodityLine(),
        description: 'Quota fissa',
        category: 'sale',
        component: 'fixed',
        quantity: 30 / 365,
        quantityUnit: 'year',
        unitPriceMicros: 40_000_000,
        amountCents: 329,
      },
      {
        ...commodityLine(),
        description: 'IVA 10%',
        category: 'vat',
        component: 'lump',
        quantity: null,
        quantityUnit: null,
        unitPriceMicros: null,
        amountCents: 233,
        vatRateBp: 1000,
      },
      {
        ...commodityLine({ periodStart: '2026-08-01', periodEnd: '2026-08-31' }),
        description: 'Energia (voce di ricalcolo)',
        isRecalculation: true,
        amountCents: 872,
      },
    ],
    readings: [{ readOn: '2026-09-30', register: 'single', value: 1200, source: 'bill_actual' }],
  });
}

describe('draftFromInput and inputFromDraft', () => {
  it('give back the same input, a 30/365 quantity and a 10% VAT rate included', () => {
    const input = richInput();

    const { input: roundTrip, errors } = inputFromDraft(draftFromInput(input));

    expect(errors).toEqual({});
    expect(roundTrip).toEqual(input);
  });

  it('writes amounts in euros, prices in euros at six decimals and keeps own periods', () => {
    const draft = draftFromInput(richInput());

    expect(draft.totalCents).toBe('34,34');
    expect(lineOf(draft, 0).unitPriceMicros).toBe('0,1');
    expect(lineOf(draft, 2).vatRateBp).toBe('10');
    expect(lineOf(draft, 0).hasOwnPeriod).toBe(false);
    expect(lineOf(draft, 3).hasOwnPeriod).toBe(true);
  });

  it('reads typed euros into cents and a typed price into micro-euros', () => {
    const draft = draftFromInput(richInput());
    lineOf(draft, 0).amountCents = '12,34';
    lineOf(draft, 0).unitPriceMicros = '0,099';

    const { input } = inputFromDraft(draft);

    expect(input?.lines[0]?.amountCents).toBe(1234);
    expect(input?.lines[0]?.unitPriceMicros).toBe(99_000);
  });

  it('refuses a price with more than six decimals', () => {
    const draft = draftFromInput(richInput());
    lineOf(draft, 0).unitPriceMicros = '0,0990001';

    const { input, errors } = inputFromDraft(draft);

    expect(input).toBeUndefined();
    expect(errors['lines.0.unitPriceMicros']).toBe('Al massimo 6 decimali');
  });

  it('refuses an amount with more than two decimals', () => {
    const draft = draftFromInput(richInput());
    lineOf(draft, 1).amountCents = '3,291';

    expect(inputFromDraft(draft).errors['lines.1.amountCents']).toBe('Al massimo 2 decimali');
  });

  it('asks for an empty line amount on that field', () => {
    const draft = draftFromInput(richInput());
    lineOf(draft, 2).amountCents = '';

    const { input, errors } = inputFromDraft(draft);

    expect(input).toBeUndefined();
    expect(errors['lines.2.amountCents']).toBe('Importo obbligatorio');
  });

  it('reports text that is not a number', () => {
    const draft = draftFromInput(richInput());
    lineOf(draft, 0).quantity = 'abc';

    expect(inputFromDraft(draft).errors['lines.0.quantity']).toBe('Numero non valido');
  });

  it('gives a line without its own period the period of the bill', () => {
    const draft = draftFromInput(richInput());
    draft.periodStart = '2026-09-02';

    const { input } = inputFromDraft(draft);

    expect(input?.lines[0]?.periodStart).toBe('2026-09-02');
    expect(input?.lines[3]?.periodStart).toBe('2026-08-01');
  });
});

describe('a new hand-typed bill', () => {
  it('starts with every amount and the total empty, quantities and prices as they were', () => {
    const input = richInput();

    const draft = draftFromInput(input, { blankAmounts: true });

    expect(draft.totalCents).toBe('');
    expect(draft.lines.every((line) => line.amountCents === '')).toBe(true);
    expect(lineOf(draft, 0).quantity).toBe('200');
    expect(lineOf(draft, 0).unitPriceMicros).toBe('0,1');
  });

  it('requires every amount and the total before it gives an input', () => {
    const draft = draftFromInput(richInput(), { blankAmounts: true });

    const { input, errors } = inputFromDraft(draft);

    expect(input).toBeUndefined();
    expect(errors.totalCents).toBe('Totale obbligatorio');
    for (const index of [0, 1, 2, 3]) {
      expect(errors[`lines.${index}.amountCents`]).toBe('Importo obbligatorio');
    }
  });
});

/** Readings at two dates, F1/F2/F3 each, as a banded electricity bill prints them. */
function bandedInput(): BillInput {
  const at = (readOn: string, base: number): BillInput['readings'] =>
    (['F1', 'F2', 'F3'] as const).map((register, index) => ({
      readOn,
      register,
      value: base + index * 100,
      source: 'bill_actual',
    }));
  return billInput('supply-1', {
    readings: [...at('2026-08-31', 1000), ...at('2026-09-30', 1100)],
  });
}

describe('the readings of the draft', () => {
  it('are one row per date with a column per register, and come back identical', () => {
    const input = bandedInput();
    const draft = draftFromInput(input);

    expect(draft.readingRegisters).toEqual(['F1', 'F2', 'F3']);
    expect(draft.readings).toEqual([
      {
        readOn: '2026-08-31',
        source: 'bill_actual',
        values: { F1: '1000', F2: '1100', F3: '1200' },
      },
      {
        readOn: '2026-09-30',
        source: 'bill_actual',
        values: { F1: '1100', F2: '1200', F3: '1300' },
      },
    ]);
    expect(inputFromDraft(draft).input).toEqual(input);
  });

  it('skip an empty cell: the bill prints nothing for that register on that date', () => {
    const draft = draftFromInput(bandedInput());
    const [first] = draft.readings;
    if (first) first.values.F2 = '';

    const { input, errors } = inputFromDraft(draft);

    expect(errors).toEqual({});
    expect(input?.readings).toHaveLength(5);
    expect(input?.readings.some((r) => r.readOn === '2026-08-31' && r.register === 'F2')).toBe(
      false,
    );
  });

  it('report a value on its cell and a date on its row', () => {
    const draft = draftFromInput(bandedInput());
    const [first, second] = draft.readings;
    if (!first || !second) throw new Error('two rows expected');
    second.values.F3 = 'abc';
    expect(inputFromDraft(draft).errors['readings.1.F3']).toBe('Numero non valido');

    second.values.F3 = '1300';
    first.readOn = '';
    const { errors } = inputFromDraft(draft);
    expect(Object.keys(errors)).toEqual(['readings.0.readOn']);
  });

  it('keep a reading taken and one estimated on the same day in two rows', () => {
    const input = billInput('supply-1', {
      readings: [
        { readOn: '2026-09-30', register: 'single', value: 10, source: 'bill_actual' },
        { readOn: '2026-09-30', register: 'single', value: 12, source: 'bill_estimated' },
      ],
    });

    expect(draftFromInput(input).readings.map((row) => row.source)).toEqual([
      'bill_actual',
      'bill_estimated',
    ]);
  });

  it('take the default columns when the bill has no readings yet', () => {
    const input = billInput('supply-1', { readings: [] });

    expect(
      draftFromInput(input, { defaultRegisters: ['F1', 'F2', 'F3'] }).readingRegisters,
    ).toEqual(['F1', 'F2', 'F3']);
  });
});
