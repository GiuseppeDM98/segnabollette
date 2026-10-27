import { describe, expect, it } from 'vitest';
import { monthRange } from '@/lib/domain/dates';
import { unitPriceMicros } from '@/lib/domain/money';
import type { IsoDate, MonthKey, ReadingRegister, SupplyKind } from '@/lib/domain/types';
import { buildSupplyMonths } from './supply-months';
import type { EngineBill, EngineLine, EngineReading, SupplyMonth } from './types';

function line(overrides: Partial<EngineLine>): EngineLine {
  return {
    category: 'commodity',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    quantity: null,
    quantityUnit: null,
    amountCents: 0,
    band: null,
    isRecalculation: false,
    isEstimated: false,
    ...overrides,
  };
}

function bill(overrides: Partial<EngineBill>): EngineBill {
  return {
    id: 'bill-september',
    status: 'confirmed',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    conversionFactor: null,
    lines: [],
    readings: [],
    ...overrides,
  };
}

function reading(
  readOn: IsoDate,
  register: ReadingRegister,
  value: number,
  billId: string | null = null,
): EngineReading {
  return {
    readOn,
    register,
    value,
    source: billId === null ? 'self' : 'bill_actual',
    billId,
    createdAt: 1,
  };
}

function build(options: {
  kind: SupplyKind;
  bills: EngineBill[];
  readings?: EngineReading[];
  hasPhotovoltaic?: boolean;
  fromMonth?: MonthKey;
  toMonth?: MonthKey;
}): Map<MonthKey, SupplyMonth> {
  const months = buildSupplyMonths({
    kind: options.kind,
    hasPhotovoltaic: options.hasPhotovoltaic ?? false,
    bills: options.bills,
    // Every reading of the supply: the bills' own and the self readings.
    readings: [...options.bills.flatMap((b) => b.readings), ...(options.readings ?? [])],
    fromMonth: options.fromMonth ?? '2026-08',
    toMonth: options.toMonth ?? '2026-10',
  });
  return new Map(months.map((month) => [month.month, month]));
}

function month(months: Map<MonthKey, SupplyMonth>, key: MonthKey): SupplyMonth {
  const found = months.get(key);
  if (!found) throw new Error(`no month ${key}`);
  return found;
}

describe('buildSupplyMonths — monthly electricity', () => {
  const energy = line({ quantity: 200, quantityUnit: 'kWh', amountCents: 2000 });
  const others = [
    line({ category: 'sale', amountCents: 600 }),
    line({ category: 'network', amountCents: 800 }),
    line({ category: 'system', amountCents: 500 }),
    line({ category: 'excise', amountCents: 400 }),
    line({ category: 'vat', amountCents: 430 }),
  ];
  const bandReadings = [
    reading('2026-08-31', 'F1', 1000, 'bill-september'),
    reading('2026-09-30', 'F1', 1080, 'bill-september'),
    reading('2026-08-31', 'F2', 1000, 'bill-september'),
    reading('2026-09-30', 'F2', 1060, 'bill-september'),
    reading('2026-08-31', 'F3', 1000, 'bill-september'),
    reading('2026-09-30', 'F3', 1060, 'bill-september'),
  ];

  it('gives consumption, the two unit prices and the billed days of the month', () => {
    const september = month(
      build({ kind: 'electricity', bills: [bill({ lines: [energy, ...others] })] }),
      '2026-09',
    );

    expect(september.consumption).toBeCloseTo(200);
    expect(september.commodityUnitPriceMicros).toBe(100_000);
    expect(september.totalCents).toBe(4730);
    expect(september.totalUnitPriceMicros).toBe((4730 * 10_000) / 200);
    expect(september.billedDays).toBe(30);
  });

  it('splits a single-rate offer into bands from the readings without calling it banded', () => {
    const september = month(
      build({
        kind: 'electricity',
        bills: [bill({ lines: [energy, ...others], readings: bandReadings })],
      }),
      '2026-09',
    );

    expect(september.consumptionByBand.F1).toBeCloseTo(80);
    expect(september.consumptionByBand.F2).toBeCloseTo(60);
    expect(september.consumptionByBand.F3).toBeCloseTo(60);
    expect(september.hasCommodityBands).toBe(false);
  });

  it('calls the month banded when a commodity line has a band', () => {
    const september = month(
      build({
        kind: 'electricity',
        bills: [bill({ lines: [{ ...energy, band: 'F1' }, ...others], readings: bandReadings })],
      }),
      '2026-09',
    );

    expect(september.hasCommodityBands).toBe(true);
  });
});

describe('buildSupplyMonths — two-month water bill', () => {
  it('spreads quantity and amount by day over the two months', () => {
    const months = build({
      kind: 'water',
      bills: [
        bill({
          periodStart: '2026-01-01',
          periodEnd: '2026-02-28',
          lines: [
            line({
              periodStart: '2026-01-01',
              periodEnd: '2026-02-28',
              quantity: 59,
              quantityUnit: 'm3',
              amountCents: 5900,
            }),
          ],
        }),
      ],
      fromMonth: '2026-01',
      toMonth: '2026-02',
    });

    expect(month(months, '2026-01').consumption).toBeCloseTo(31);
    expect(month(months, '2026-01').costs.commodity).toBe(3100);
    expect(month(months, '2026-02').consumption).toBeCloseTo(28);
    expect(month(months, '2026-02').costs.commodity).toBe(2800);
  });
});

describe('buildSupplyMonths — gas with a recalculation', () => {
  const august = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };
  const augustBill = bill({
    id: 'bill-august',
    ...august,
    lines: [
      line({ ...august, quantity: 10, quantityUnit: 'Smc', amountCents: 500, isEstimated: true }),
    ],
  });
  const septemberEnergy = line({ quantity: 20, quantityUnit: 'Smc', amountCents: 1000 });

  it('lands the recalculation in August and clears its estimate', () => {
    const septemberBill = bill({
      lines: [
        septemberEnergy,
        line({
          ...august,
          quantity: 12,
          quantityUnit: 'Smc',
          amountCents: 600,
          isRecalculation: true,
        }),
        line({
          ...august,
          quantity: -10,
          quantityUnit: 'Smc',
          amountCents: -500,
          isRecalculation: true,
        }),
      ],
    });

    const result = month(build({ kind: 'gas', bills: [augustBill, septemberBill] }), '2026-08');

    expect(result.consumption).toBeCloseTo(12);
    expect(result.isEstimated).toBe(false);
  });

  it('keeps August estimated until a later bill recalculates it', () => {
    const result = month(build({ kind: 'gas', bills: [augustBill] }), '2026-08');

    expect(result.isEstimated).toBe(true);
  });

  it('keeps August estimated when the recalculation is itself still estimated', () => {
    const septemberBill = bill({
      lines: [
        septemberEnergy,
        line({
          ...august,
          quantity: 15,
          quantityUnit: 'Smc',
          amountCents: 750,
          isRecalculation: true,
          isEstimated: true,
        }),
        line({
          ...august,
          quantity: -10,
          quantityUnit: 'Smc',
          amountCents: -500,
          isRecalculation: true,
        }),
      ],
    });

    const result = month(build({ kind: 'gas', bills: [augustBill, septemberBill] }), '2026-08');

    expect(result.consumption).toBeCloseTo(15);
    expect(result.isEstimated).toBe(true);
  });
});

describe('buildSupplyMonths — replaced bill', () => {
  it('counts only the confirmed bill and ignores the readings of the replaced one', () => {
    const energy = line({ quantity: 200, quantityUnit: 'kWh', amountCents: 2000 });
    const confirmed = bill({
      id: 'bill-kept',
      lines: [energy],
      readings: [reading('2026-09-30', 'single', 7000, 'bill-kept')],
    });
    const replaced = bill({
      id: 'bill-replaced',
      status: 'replaced',
      lines: [energy],
      readings: [reading('2026-10-01', 'single', 9000, 'bill-replaced')],
    });

    const months = build({
      kind: 'electricity',
      bills: [confirmed, replaced],
      readings: [reading('2026-10-10', 'single', 7100)],
    });

    expect(month(months, '2026-09').consumption).toBeCloseTo(200);
    expect(month(months, '2026-10').readingsConsumption).toBeCloseTo(100);
  });
});

describe('buildSupplyMonths — gas readings after the last bill', () => {
  const gasBill = (conversionFactor: number | null) =>
    bill({
      conversionFactor,
      lines: [line({ quantity: 100, quantityUnit: 'Smc', amountCents: 5000 })],
      readings: [
        reading('2026-08-31', 'single', 6900, 'bill-september'),
        reading('2026-09-30', 'single', 7000, 'bill-september'),
      ],
    });
  const selfReading = reading('2026-10-10', 'single', 7100);

  it('converts the cubic metres after the last billed day with the bill coefficient', () => {
    const months = build({ kind: 'gas', bills: [gasBill(1.02)], readings: [selfReading] });

    expect(month(months, '2026-10').readingsConsumption).toBeCloseTo(102);
    expect(month(months, '2026-10').isReadingsConversionAssumed).toBe(false);
    expect(month(months, '2026-09').readingsConsumption).toBeNull();
  });

  it('assumes a coefficient of 1 and says so when no bill gives one', () => {
    const months = build({ kind: 'gas', bills: [gasBill(null)], readings: [selfReading] });

    expect(month(months, '2026-10').readingsConsumption).toBeCloseTo(100);
    expect(month(months, '2026-10').isReadingsConversionAssumed).toBe(true);
  });
});

describe('buildSupplyMonths — photovoltaic', () => {
  it('gives fed-in, produced, self-consumed and house consumption, net of the credit', () => {
    const months = build({
      kind: 'electricity',
      hasPhotovoltaic: true,
      bills: [
        bill({
          lines: [
            line({ quantity: 200, quantityUnit: 'kWh', amountCents: 2000 }),
            line({ category: 'vat', amountCents: 200 }),
            line({ category: 'feed_in', amountCents: -500 }),
          ],
        }),
      ],
      readings: [
        reading('2026-08-31', 'feed_in', 0),
        reading('2026-09-30', 'feed_in', 300),
        reading('2026-08-31', 'production', 0),
        reading('2026-09-30', 'production', 500),
      ],
    });

    const september = month(months, '2026-09');
    expect(september.feedInKwh).toBeCloseTo(300);
    expect(september.productionKwh).toBeCloseTo(500);
    expect(september.selfConsumptionKwh).toBeCloseTo(200);
    expect(september.houseConsumptionKwh).toBeCloseTo(400);
    expect(september.costs.feed_in).toBe(-500);
    expect(september.totalCents).toBe(1700);
    expect(september.totalUnitPriceMicros).toBe(85_000);
  });
});

describe('buildSupplyMonths — flat fee', () => {
  it('totals the fee with its VAT and has no consumption or unit price', () => {
    const september = month(
      build({
        kind: 'telecom',
        bills: [
          bill({
            lines: [
              line({ category: 'sale', amountCents: 2500 }),
              line({ category: 'vat', amountCents: 550 }),
            ],
          }),
        ],
      }),
      '2026-09',
    );

    expect(september.totalCents).toBe(3050);
    expect(september.consumption).toBeNull();
    expect(september.commodityUnitPriceMicros).toBeNull();
    expect(september.totalUnitPriceMicros).toBeNull();
  });
});

describe('buildSupplyMonths — total per unit over 12 months', () => {
  /** One gas bill a month: `smc` at 50 cents each, plus a fixed share of 1000 cents. */
  function gasMonth(monthKey: MonthKey, smc: number): EngineBill {
    const start = `${monthKey}-01`;
    const end = `${monthKey}-28`;
    return bill({
      id: `bill-${monthKey}`,
      periodStart: start,
      periodEnd: end,
      lines: [
        line({
          periodStart: start,
          periodEnd: end,
          quantity: smc,
          quantityUnit: 'Smc',
          amountCents: smc * 50,
        }),
        line({ category: 'sale', periodStart: start, periodEnd: end, amountCents: 1000 }),
      ],
    });
  }

  // 80 Smc a month from October to March, 2 Smc from April to September.
  const YEAR = monthRange('2025-10', '2026-09');
  const BILLS = YEAR.map((key) =>
    gasMonth(key, ['04', '05', '06', '07', '08', '09'].includes(key.slice(5)) ? 2 : 80),
  );

  it('divides the spending of the 12 months by their consumption, not one month alone', () => {
    const months = build({ kind: 'gas', bills: BILLS, fromMonth: '2025-09', toMonth: '2026-10' });

    const september = month(months, '2026-09');
    // 6 × (4000 + 1000) + 6 × (100 + 1000) cents over 6 × 80 + 6 × 2 Smc.
    expect(september.totalUnitPrice12Micros).toBe(unitPriceMicros(36_600, 492));
    // The month alone: 1100 cents over 2 Smc, 5,50 €/Smc.
    expect(september.totalUnitPriceMicros).toBe(5_500_000);
  });

  it('has no value until 12 months are billed, nor in a month without bills', () => {
    const months = build({ kind: 'gas', bills: BILLS, fromMonth: '2025-09', toMonth: '2026-10' });

    // August's 12 months start in September 2025, which has no bill.
    expect(month(months, '2026-08').totalUnitPrice12Micros).toBeNull();
    expect(month(months, '2026-10').totalUnitPrice12Micros).toBeNull();
  });
});
