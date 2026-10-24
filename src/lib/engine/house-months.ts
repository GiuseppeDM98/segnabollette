import type { CostCategory, MonthKey, SupplyKind } from '@/lib/domain/types';
import { isMetered } from '@/lib/domain/types';
import { emptyCosts, type SupplyMonth } from './types';

export type HouseCostCategory = CostCategory | 'flat';

export interface HouseMonth {
  month: MonthKey;
  totalCents: number;
  costs: Record<HouseCostCategory, number>;
  bySupply: Record<string, number>;
}

/** Sum the supplies of a house month by month; flat-fee supplies count as one 'flat' bucket. */
export function buildHouseMonths(
  supplies: ReadonlyArray<{ supplyId: string; kind: SupplyKind; months: SupplyMonth[] }>,
): HouseMonth[] {
  const result = new Map<MonthKey, HouseMonth>();
  for (const supply of supplies) {
    for (const month of supply.months) {
      const house = result.get(month.month) ?? {
        month: month.month,
        totalCents: 0,
        costs: { ...emptyCosts(), flat: 0 },
        bySupply: {},
      };
      if (isMetered(supply.kind)) {
        for (const [category, cents] of Object.entries(month.costs) as Array<
          [CostCategory, number]
        >) {
          house.costs[category] += cents;
        }
      } else {
        house.costs.flat += month.totalCents;
      }
      house.totalCents += month.totalCents;
      house.bySupply[supply.supplyId] = month.totalCents;
      result.set(month.month, house);
    }
  }
  return [...result.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}
