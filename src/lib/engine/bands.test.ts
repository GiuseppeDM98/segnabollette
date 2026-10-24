import { describe, expect, it } from 'vitest';
import type { ReadingRegister } from '@/lib/domain/types';
import { bandSharesOfBill } from './bands';
import type { EngineReading } from './types';

function reading(readOn: string, register: ReadingRegister, value: number): EngineReading {
  return { readOn, register, value, source: 'bill_actual', billId: 'bill', createdAt: 1 };
}

describe('bandSharesOfBill', () => {
  it('splits by the growth of each register over the bill', () => {
    const shares = bandSharesOfBill({
      readings: [
        reading('2026-08-31', 'F1', 100),
        reading('2026-09-30', 'F1', 180),
        reading('2026-08-31', 'F2', 100),
        reading('2026-09-30', 'F2', 160),
        reading('2026-08-31', 'F3', 100),
        reading('2026-09-30', 'F3', 160),
      ],
    });

    expect(shares?.F1).toBeCloseTo(0.4);
    expect(shares?.F2).toBeCloseTo(0.3);
    expect(shares?.F3).toBeCloseTo(0.3);
  });

  it('has no split when a register has a single date', () => {
    const shares = bandSharesOfBill({
      readings: [
        reading('2026-08-31', 'F1', 100),
        reading('2026-09-30', 'F1', 180),
        reading('2026-08-31', 'F2', 100),
        reading('2026-09-30', 'F2', 160),
        reading('2026-09-30', 'F3', 160),
      ],
    });

    expect(shares).toBeNull();
  });
});
