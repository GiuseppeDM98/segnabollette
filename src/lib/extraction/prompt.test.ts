import { describe, expect, it } from 'vitest';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt';

describe('EXTRACTION_SYSTEM_PROMPT', () => {
  // A bill saves only with a commodity line in the supply's unit: a summary-only bill would
  // otherwise come back with the consumption nowhere.
  it('puts the billed consumption of a summary-only bill on the commodity line', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain('"consumo fatturato 200 Smc"');
    expect(EXTRACTION_SYSTEM_PROMPT).toContain(
      'commodity, component lump, quantity 200, quantityUnit Smc, unitPriceMicros 0, amountCents 12000.',
    );
  });
});
