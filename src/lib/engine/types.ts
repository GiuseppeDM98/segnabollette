import type {
  Band,
  BillStatus,
  CostCategory,
  IsoDate,
  LineCategory,
  MonthKey,
  QuantityUnit,
  ReadingRegister,
  ReadingSource,
  SupplyKind,
} from '@/lib/domain/types';

export interface EngineLine {
  category: LineCategory;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  amountCents: number;
  band: Band | null;
  isRecalculation: boolean;
  isEstimated: boolean;
}

export interface EngineReading {
  readOn: IsoDate;
  register: ReadingRegister;
  value: number;
  source: ReadingSource;
  billId: string | null;
  createdAt: number;
}

export interface EngineBill {
  id: string;
  status: BillStatus;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  conversionFactor: number | null;
  lines: EngineLine[];
  readings: EngineReading[];
}

export interface SupplyMonthsInput {
  kind: SupplyKind;
  hasPhotovoltaic: boolean;
  bills: EngineBill[];
  /** Every reading of the supply: the bills' (any status) and the self readings. */
  readings: EngineReading[];
  fromMonth: MonthKey;
  toMonth: MonthKey;
}

export type CostBreakdown = Record<CostCategory, number>;

export interface SupplyMonth {
  month: MonthKey;
  /** Days of the month inside at least one confirmed bill's billing period. */
  billedDays: number;
  /** Billed consumption by competence, in the supply's consumption unit; null for flat kinds and unbilled months. */
  consumption: number | null;
  consumptionByBand: Partial<Record<Band, number>>;
  /**
   * True when at least one commodity line in the consumption unit spread over this month has an
   * F1/F2/F3/F23 band. A single-rate offer stays false even when the bill's readings split its
   * consumption into bands, so market references compare it with the single-rate price.
   */
  hasCommodityBands: boolean;
  isEstimated: boolean;
  /** Consumption measured by readings on the days after the last billed day; null when none. */
  readingsConsumption: number | null;
  /** True when gas readings were converted with C = 1 because no bill gave a coefficient. */
  isReadingsConversionAssumed: boolean;
  costs: CostBreakdown;
  /** Everything paid for the supply in the month, VAT included, net of the credit for energy fed into the grid. */
  totalCents: number;
  /** Commodity cents (net of VAT) per unit. */
  commodityUnitPriceMicros: number | null;
  /** totalCents per unit. */
  totalUnitPriceMicros: number | null;
  /**
   * Billed consumption under a quarter of the supply's median billed month (LOW_CONSUMPTION_SHARE):
   * the month's total per unit is then mostly its fixed shares, and the charts leave it out.
   */
  isLowConsumption: boolean;
  feedInKwh: number | null;
  productionKwh: number | null;
  selfConsumptionKwh: number | null;
  houseConsumptionKwh: number | null;
}

export function emptyCosts(): CostBreakdown {
  return {
    commodity: 0,
    sale: 0,
    network: 0,
    system: 0,
    excise: 0,
    vat: 0,
    other: 0,
    feed_in: 0,
  };
}
