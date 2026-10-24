import type { Band } from '@/lib/domain/types';
import type { EngineBill } from './types';

export type BandShares = Record<'F1' | 'F2' | 'F3', number>;

/**
 * The F1/F2/F3 split of a bill from its own readings: each register's growth over the bill's
 * readings, as a share of the total. Null unless all three registers have readings on two
 * different days, none of them went down and together they grew (one register may stay still).
 * A single-rate offer still prints F1/F2/F3 readings, which is what makes the split possible.
 */
export function bandSharesOfBill(bill: Pick<EngineBill, 'readings'>): BandShares | null {
  const deltas: Partial<Record<'F1' | 'F2' | 'F3', number>> = {};
  for (const register of ['F1', 'F2', 'F3'] as const) {
    const values = bill.readings
      .filter((r) => r.register === register)
      .sort((a, b) => (a.readOn < b.readOn ? -1 : 1));
    const first = values[0];
    const last = values[values.length - 1];
    if (!first || !last || first.readOn === last.readOn) return null;
    const delta = last.value - first.value;
    if (delta < 0) return null;
    deltas[register] = delta;
  }
  const total = (deltas.F1 ?? 0) + (deltas.F2 ?? 0) + (deltas.F3 ?? 0);
  if (total <= 0) return null;
  return {
    F1: (deltas.F1 ?? 0) / total,
    F2: (deltas.F2 ?? 0) / total,
    F3: (deltas.F3 ?? 0) / total,
  };
}

export function addToBand(target: Partial<Record<Band, number>>, band: Band, amount: number): void {
  target[band] = (target[band] ?? 0) + amount;
}
