import { shiftMonth } from '@/lib/domain/dates';
import type { MonthKey } from '@/lib/domain/types';
import type { SupplyMonth } from './types';

export function yearOverYear(months: readonly SupplyMonth[], month: MonthKey) {
  const byMonth = new Map(months.map((m) => [m.month, m]));
  return {
    current: byMonth.get(month) ?? null,
    previous: byMonth.get(shiftMonth(month, -12)) ?? null,
  };
}

export interface PeriodTotals {
  consumption: number | null;
  totalCents: number;
  monthsWithBills: number;
}

/** The 12 months ending at endMonth against the 12 before them. */
export function rolling12(
  months: readonly SupplyMonth[],
  endMonth: MonthKey,
): { last12: PeriodTotals; previous12: PeriodTotals } {
  const sum = (from: MonthKey, to: MonthKey): PeriodTotals => {
    const inRange = months.filter((m) => m.month >= from && m.month <= to);
    const withConsumption = inRange.filter((m) => m.consumption !== null);
    return {
      consumption: withConsumption.length
        ? withConsumption.reduce((s, m) => s + (m.consumption ?? 0), 0)
        : null,
      totalCents: inRange.reduce((s, m) => s + m.totalCents, 0),
      monthsWithBills: inRange.filter((m) => m.billedDays > 0).length,
    };
  };
  return {
    last12: sum(shiftMonth(endMonth, -11), endMonth),
    previous12: sum(shiftMonth(endMonth, -23), shiftMonth(endMonth, -12)),
  };
}
