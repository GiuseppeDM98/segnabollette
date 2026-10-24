import { describe, expect, it } from 'vitest';
import { monthRange } from '@/lib/domain/dates';
import type { HouseMonth } from '@/lib/engine';
import { emptyCosts, type SupplyMonth } from '@/lib/engine/types';
import { formatMonth } from '@/lib/format';
import {
  percentChange,
  toConsumptionSeries,
  toCostSeries,
  toHouseCostSeries,
  toUnitPriceSeries,
  toYearOverYearSeries,
} from './series';

function supplyMonth(overrides: Partial<SupplyMonth>): SupplyMonth {
  return {
    month: '2026-09',
    billedDays: 30,
    consumption: null,
    consumptionByBand: {},
    hasCommodityBands: false,
    isEstimated: false,
    readingsConsumption: null,
    isReadingsConversionAssumed: false,
    costs: emptyCosts(),
    totalCents: 0,
    commodityUnitPriceMicros: null,
    totalUnitPriceMicros: null,
    feedInKwh: null,
    productionKwh: null,
    selfConsumptionKwh: null,
    houseConsumptionKwh: null,
    ...overrides,
  };
}

const NO_PANELS = { hasPhotovoltaic: false };

describe('toConsumptionSeries', () => {
  it('stacks the bands of a month and leaves the bands without consumption null', () => {
    const [point] = toConsumptionSeries(
      [supplyMonth({ consumption: 200, consumptionByBand: { F1: 80, F2: 60, F3: 60 } })],
      NO_PANELS,
    );

    expect(point?.F1).toBeCloseTo(80);
    expect(point?.F2).toBeCloseTo(60);
    expect(point?.F3).toBeCloseTo(60);
    expect(point?.single).toBeNull();
    expect(point?.F23).toBeNull();
    expect(point?.label).toBe(formatMonth('2026-09'));
  });

  it('keeps the consumption from readings not yet billed as its own segment', () => {
    const [point] = toConsumptionSeries(
      [supplyMonth({ billedDays: 0, readingsConsumption: 50 })],
      NO_PANELS,
    );

    expect(point?.fromReadings).toBeCloseTo(50);
  });

  it('adds self-consumption and fed-in energy only with photovoltaic panels', () => {
    const month = supplyMonth({ consumption: 200, selfConsumptionKwh: 70, feedInKwh: 120 });

    const [withPanels] = toConsumptionSeries([month], { hasPhotovoltaic: true });
    const [withoutPanels] = toConsumptionSeries([month], NO_PANELS);

    expect(withPanels?.selfConsumption).toBeCloseTo(70);
    expect(withPanels?.feedIn).toBeCloseTo(120);
    expect(withoutPanels?.selfConsumption).toBeNull();
    expect(withoutPanels?.feedIn).toBeNull();
  });

  it('marks an estimated month, and not a recalculated one', () => {
    const [estimated, recalculated] = toConsumptionSeries(
      [
        supplyMonth({ month: '2026-08', consumption: 200, isEstimated: true }),
        supplyMonth({ month: '2026-09', consumption: 200, isEstimated: false }),
      ],
      NO_PANELS,
    );

    expect(estimated?.isEstimated).toBe(true);
    expect(recalculated?.isEstimated).toBe(false);
  });

  it('carries the gas readings converted with an assumed coefficient', () => {
    const [point] = toConsumptionSeries(
      [supplyMonth({ readingsConsumption: 20, isReadingsConversionAssumed: true })],
      NO_PANELS,
    );

    expect(point?.isReadingsConversionAssumed).toBe(true);
  });
});

describe('toUnitPriceSeries', () => {
  it('turns micro-euros into euros per unit, and keeps a month without price a gap', () => {
    const [priced, unpriced] = toUnitPriceSeries([
      supplyMonth({ commodityUnitPriceMicros: 100_000, totalUnitPriceMicros: 236_500 }),
      supplyMonth({ month: '2026-10' }),
    ]);

    expect(priced?.commodity).toBe(0.1);
    expect(priced?.total).toBe(0.2365);
    expect(unpriced?.commodity).toBeNull();
    expect(unpriced?.total).toBeNull();
  });
});

describe('toCostSeries', () => {
  it('draws the fed-in credit below zero and keeps the total net of it', () => {
    const [point] = toCostSeries([
      supplyMonth({
        costs: { ...emptyCosts(), commodity: 2000, feed_in: -500 },
        totalCents: 1500,
      }),
    ]);

    expect(point?.commodity).toBe(20);
    expect(point?.feedIn).toBe(-5);
    expect(point?.total).toBe(15);
    expect(point?.flat).toBe(0);
  });

  it('puts the house flat fees in their own bucket', () => {
    const house: HouseMonth = {
      month: '2026-09',
      totalCents: 5530,
      costs: { ...emptyCosts(), commodity: 2000, vat: 500, flat: 3030 },
      bySupply: {},
    };

    const [point] = toHouseCostSeries([house]);

    expect(point?.flat).toBe(30.3);
    expect(point?.commodity).toBe(20);
    expect(point?.total).toBe(55.3);
  });
});

describe('toYearOverYearSeries', () => {
  // 24 months: the first year at 100 kWh and 1000 cents a month, the second at 200 and 2000.
  const months = monthRange('2024-10', '2026-09').map((month, index) =>
    index < 12
      ? supplyMonth({ month, consumption: 100, totalCents: 1000 })
      : supplyMonth({ month, consumption: 200, totalCents: 2000 }),
  );

  it('gives the 12 months ending at the end month, each with the same month a year earlier', () => {
    const points = toYearOverYearSeries(months, '2026-09', 'cost');

    expect(points).toHaveLength(12);
    expect(points[0]?.month).toBe('2025-10');
    expect(points[11]?.month).toBe('2026-09');
    expect(points[11]?.label).toBe(formatMonth('2026-09'));
    expect(points[11]?.current).toBe(20);
    expect(points[11]?.previous).toBe(10);
  });

  it('leaves a month without bills null in the cost, not zero', () => {
    const unbilled = months.map((month) =>
      month.month === '2026-09' ? { ...month, billedDays: 0, totalCents: 0 } : month,
    );

    const points = toYearOverYearSeries(unbilled, '2026-09', 'cost');

    expect(points[11]?.current).toBeNull();
  });

  it('counts only the billed consumption, not the readings after the last bill', () => {
    const readingsOnly = months.map((month) =>
      month.month === '2026-09'
        ? { ...month, billedDays: 0, consumption: null, readingsConsumption: 50 }
        : month,
    );

    const points = toYearOverYearSeries(readingsOnly, '2026-09', 'consumption');

    expect(points[11]?.current).toBeNull();
    expect(points[10]?.current).toBeCloseTo(200);
    expect(points[10]?.previous).toBeCloseTo(100);
  });

  it('gives null for a month missing from the series', () => {
    const points = toYearOverYearSeries(months, '2026-10', 'consumption');

    expect(points[11]?.current).toBeNull();
    expect(points[11]?.previous).toBeCloseTo(200);
  });
});

describe('percentChange', () => {
  it('gives the change in percent, and null without a base', () => {
    expect(percentChange(110, 100)).toBeCloseTo(10);
    expect(percentChange(5, 0)).toBeNull();
  });
});
