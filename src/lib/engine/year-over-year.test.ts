import { describe, expect, it } from 'vitest';
import { monthRange } from '@/lib/domain/dates';
import { emptyCosts, type SupplyMonth } from './types';
import { rolling12, yearOverYear } from './year-over-year';

function supplyMonth(month: string, consumption: number, totalCents: number): SupplyMonth {
  return {
    month,
    billedDays: 30,
    consumption,
    consumptionByBand: {},
    hasCommodityBands: false,
    isEstimated: false,
    readingsConsumption: null,
    isReadingsConversionAssumed: false,
    costs: emptyCosts(),
    totalCents,
    commodityUnitPriceMicros: null,
    totalUnitPriceMicros: null,
    feedInKwh: null,
    productionKwh: null,
    selfConsumptionKwh: null,
    houseConsumptionKwh: null,
  };
}

// 24 months: the first year at 100 kWh and 1000 cents a month, the second at 200 and 2000.
const MONTHS = monthRange('2024-10', '2026-09').map((month, index) =>
  index < 12 ? supplyMonth(month, 100, 1000) : supplyMonth(month, 200, 2000),
);

describe('rolling12', () => {
  it('sums the last 12 months and the 12 before them separately', () => {
    const { last12, previous12 } = rolling12(MONTHS, '2026-09');

    expect(last12).toEqual({ consumption: 2400, totalCents: 24_000, monthsWithBills: 12 });
    expect(previous12).toEqual({ consumption: 1200, totalCents: 12_000, monthsWithBills: 12 });
  });
});

describe('yearOverYear', () => {
  it('pairs a month with the same month of the year before', () => {
    const { current, previous } = yearOverYear(MONTHS, '2026-09');

    expect(current?.month).toBe('2026-09');
    expect(previous?.month).toBe('2025-09');
  });
});
