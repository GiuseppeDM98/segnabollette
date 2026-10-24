import { describe, expect, it } from 'vitest';
import { allocateCentsByWeights, microsFromEuro, unitPriceMicros } from './money';

describe('allocateCentsByWeights', () => {
  it('splits an amount so the parts add up exactly to it', () => {
    const parts = allocateCentsByWeights(100, [1, 1, 1]);

    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(100);
  });

  it('splits a negative amount with the same rounding', () => {
    expect(allocateCentsByWeights(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
  });

  it('keeps the exact sum with uneven weights', () => {
    const parts = allocateCentsByWeights(7, [31, 30]);

    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(7);
  });

  it('refuses weights that sum to zero', () => {
    expect(() => allocateCentsByWeights(100, [0, 0])).toThrow(RangeError);
  });
});

describe('unit prices', () => {
  it('divides cents by the quantity into micro-euros per unit', () => {
    expect(unitPriceMicros(2000, 200)).toBe(100_000);
  });

  it('has no price without a positive quantity', () => {
    expect(unitPriceMicros(5, 0)).toBeNull();
  });

  it('turns a typed euro price into micro-euros', () => {
    expect(microsFromEuro(0.099)).toBe(99_000);
  });
});
