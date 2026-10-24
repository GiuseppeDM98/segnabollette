import { describe, expect, it } from 'vitest';
import { dailyFromReadings, pickReadings } from './readings';
import type { EngineReading } from './types';

function reading(overrides: Partial<EngineReading>): EngineReading {
  return {
    readOn: '2026-09-30',
    register: 'single',
    value: 1000,
    source: 'self',
    billId: null,
    createdAt: 1,
    ...overrides,
  };
}

describe('pickReadings', () => {
  it('keeps the actual bill reading over a self reading of the same day and register', () => {
    const picked = pickReadings([
      reading({ source: 'self', value: 1010 }),
      reading({ source: 'bill_actual', value: 1000 }),
    ]);

    expect(picked).toHaveLength(1);
    expect(picked[0]?.source).toBe('bill_actual');
  });

  it('keeps the latest entered of two self readings', () => {
    const picked = pickReadings([
      reading({ value: 1010, createdAt: 2 }),
      reading({ value: 1000, createdAt: 1 }),
    ]);

    expect(picked.map((r) => r.value)).toEqual([1010]);
  });
});

describe('dailyFromReadings', () => {
  it('spreads the growth between two readings evenly over the days after the first', () => {
    const daily = dailyFromReadings(
      [
        reading({ readOn: '2026-08-31', value: 1000 }),
        reading({ readOn: '2026-09-30', value: 1300 }),
      ],
      'single',
    );

    expect(daily.size).toBe(30);
    expect(daily.get('2026-09-01')).toBeCloseTo(10);
    expect(daily.get('2026-09-30')).toBeCloseTo(10);
    expect(daily.has('2026-08-31')).toBe(false);
  });

  it('skips an interval in which the counter goes down', () => {
    const daily = dailyFromReadings(
      [
        reading({ readOn: '2026-08-31', value: 1300 }),
        reading({ readOn: '2026-09-30', value: 100 }),
      ],
      'single',
    );

    expect(daily.size).toBe(0);
  });
});
