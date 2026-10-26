import { describe, expect, it } from 'vitest';
import type { Extraction } from './schema';
import { fixtureExtraction } from './testing/fixture-bills';
import { validateExtraction } from './validate';

function electricity(overrides: Partial<Extraction> = {}): Extraction {
  return { ...fixtureExtraction('luce-pellicano.pdf'), ...overrides };
}

describe('validateExtraction', () => {
  it('accepts the fixture electricity bill', () => {
    expect(validateExtraction(electricity())).toEqual([]);
  });

  it('marks a document that is not a bill on its own', () => {
    expect(validateExtraction(electricity({ isBill: false }))).toEqual(['not_a_bill']);
  });

  it('refuses a period that ends before it starts', () => {
    const errors = validateExtraction(
      electricity({ periodStart: '2024-09-30', periodEnd: '2024-09-01' }),
    );

    expect(errors).toHaveLength(1);
  });

  it('refuses a day that does not exist', () => {
    expect(validateExtraction(electricity({ periodEnd: '2026-02-30' }))).toHaveLength(1);
  });

  it('refuses a bill without lines', () => {
    expect(validateExtraction(electricity({ lines: [] }))).toEqual(['La bolletta non ha voci.']);
  });

  it('refuses a quantity without its unit', () => {
    const [first, ...rest] = electricity().lines;
    if (!first) throw new Error('fixture without lines');

    const errors = validateExtraction(
      electricity({ lines: [{ ...first, quantity: 5, quantityUnit: 'none' }, ...rest] }),
    );

    expect(errors).toHaveLength(1);
  });

  it('accepts a printed quantity of 0 with its unit («Energia F3 0 kWh»)', () => {
    const [first, ...rest] = electricity().lines;
    if (!first) throw new Error('fixture without lines');

    const errors = validateExtraction(
      electricity({
        lines: [{ ...first, quantity: 0, quantityUnit: 'kWh', amountCents: 0 }, ...rest],
      }),
    );

    expect(errors).toEqual([]);
  });
});
