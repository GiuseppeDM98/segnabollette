import { describe, expect, it } from 'vitest';
import { buildHouseMonths } from './house-months';
import { emptyCosts, type SupplyMonth } from './types';

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
    totalUnitPrice12Micros: null,
    feedInKwh: null,
    productionKwh: null,
    selfConsumptionKwh: null,
    houseConsumptionKwh: null,
    ...overrides,
  };
}

describe('buildHouseMonths', () => {
  it('sums the supplies and puts the flat fees in one bucket', () => {
    const [september] = buildHouseMonths([
      {
        supplyId: 'electricity',
        kind: 'electricity',
        months: [supplyMonth({ costs: { ...emptyCosts(), commodity: 3000 }, totalCents: 3000 })],
      },
      {
        supplyId: 'internet',
        kind: 'telecom',
        months: [
          supplyMonth({ costs: { ...emptyCosts(), sale: 2500, vat: 550 }, totalCents: 3050 }),
        ],
      },
    ]);

    expect(september?.totalCents).toBe(6050);
    expect(september?.costs.flat).toBe(3050);
    expect(september?.costs.commodity).toBe(3000);
    expect(september?.costs.sale).toBe(0);
    expect(september?.bySupply).toEqual({ electricity: 3000, internet: 3050 });
  });
});
