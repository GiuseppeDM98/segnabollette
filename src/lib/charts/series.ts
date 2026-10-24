/**
 * The points the charts draw, prepared from the engine's monthly series.
 *
 * Design: the engine speaks in integer cents and micro-euros; the charts need plain numbers in
 * display units (euros, euros per unit) for their scales. This module is the one place, beside
 * src/lib/format.ts, that divides by 100 and by 1,000,000: chart components receive ready points
 * and format them with formatEuroValue / formatUnitPriceValue / formatQuantity, never with the
 * cent-based formatEuro. A missing value is null, not 0, so Recharts leaves a gap instead of
 * drawing a zero.
 */
import { shiftMonth } from '@/lib/domain/dates';
import type { Band, MonthKey } from '@/lib/domain/types';
import type { HouseMonth, SupplyMonth } from '@/lib/engine';
import { formatMonth } from '@/lib/format';

const CENTS_PER_EURO = 100;
const MICROS_PER_EURO = 1_000_000;

export interface ConsumptionPoint {
  month: MonthKey;
  label: string;
  F1: number | null;
  F2: number | null;
  F3: number | null;
  F23: number | null;
  single: number | null;
  fromReadings: number | null;
  selfConsumption: number | null;
  feedIn: number | null;
  isEstimated: boolean;
  isReadingsConversionAssumed: boolean;
}

/** A band without consumption is null, so the stacked bar has no zero-height segment. */
function bandValue(byBand: SupplyMonth['consumptionByBand'], band: Band): number | null {
  const value = byBand[band];
  return value === undefined || value === 0 ? null : value;
}

export function toConsumptionSeries(
  months: SupplyMonth[],
  options: { hasPhotovoltaic: boolean },
): ConsumptionPoint[] {
  return months.map((month) => ({
    month: month.month,
    label: formatMonth(month.month),
    F1: bandValue(month.consumptionByBand, 'F1'),
    F2: bandValue(month.consumptionByBand, 'F2'),
    F3: bandValue(month.consumptionByBand, 'F3'),
    F23: bandValue(month.consumptionByBand, 'F23'),
    single: bandValue(month.consumptionByBand, 'single'),
    fromReadings: month.readingsConsumption,
    selfConsumption: options.hasPhotovoltaic ? month.selfConsumptionKwh : null,
    feedIn: options.hasPhotovoltaic ? month.feedInKwh : null,
    isEstimated: month.isEstimated,
    isReadingsConversionAssumed: month.isReadingsConversionAssumed,
  }));
}

export interface UnitPricePoint {
  month: MonthKey;
  label: string;
  /** €/unit, net of VAT */
  commodity: number | null;
  /** €/unit, VAT included */
  total: number | null;
}

function euroPerUnit(micros: number | null): number | null {
  return micros === null ? null : micros / MICROS_PER_EURO;
}

/** The engine leaves both prices null without a positive consumption: those months stay gaps. */
export function toUnitPriceSeries(months: SupplyMonth[]): UnitPricePoint[] {
  return months.map((month) => ({
    month: month.month,
    label: formatMonth(month.month),
    commodity: euroPerUnit(month.commodityUnitPriceMicros),
    total: euroPerUnit(month.totalUnitPriceMicros),
  }));
}

export interface CostPoint {
  month: MonthKey;
  label: string;
  commodity: number;
  sale: number;
  network: number;
  system: number;
  excise: number;
  vat: number;
  other: number;
  feedIn: number; // ≤ 0
  flat: number; // house only
  /** totalCents / 100: net of the credit for energy fed into the grid. */
  total: number;
}

function costPoint(
  month: MonthKey,
  costs: SupplyMonth['costs'] & { flat?: number },
  totalCents: number,
): CostPoint {
  return {
    month,
    label: formatMonth(month),
    commodity: costs.commodity / CENTS_PER_EURO,
    sale: costs.sale / CENTS_PER_EURO,
    network: costs.network / CENTS_PER_EURO,
    system: costs.system / CENTS_PER_EURO,
    excise: costs.excise / CENTS_PER_EURO,
    vat: costs.vat / CENTS_PER_EURO,
    other: costs.other / CENTS_PER_EURO,
    feedIn: costs.feed_in / CENTS_PER_EURO,
    flat: (costs.flat ?? 0) / CENTS_PER_EURO,
    // The engine's total already includes the (negative) fed-in credit: the month is net of it.
    total: totalCents / CENTS_PER_EURO,
  };
}

export function toCostSeries(months: SupplyMonth[]): CostPoint[] {
  return months.map((month) => costPoint(month.month, month.costs, month.totalCents));
}

export function toHouseCostSeries(months: HouseMonth[]): CostPoint[] {
  return months.map((month) => costPoint(month.month, month.costs, month.totalCents));
}

export interface YearOverYearPoint {
  /** The month of the current year. */
  month: MonthKey;
  label: string;
  current: number | null;
  previous: number | null;
}

/**
 * The value of one month for the year-over-year chart. Consumption is the billed one only: the
 * readings after the last bill are not comparable with a billed month a year earlier. A cost
 * without billed days is null, not 0: nothing was billed, which is not the same as paying nothing.
 */
function yearOverYearValue(
  month: SupplyMonth | undefined,
  metric: 'consumption' | 'cost',
): number | null {
  if (!month) return null;
  if (metric === 'consumption') return month.consumption;
  return month.billedDays > 0 ? month.totalCents / CENTS_PER_EURO : null;
}

/** The 12 months ending at endMonth, each with the same month a year earlier. */
export function toYearOverYearSeries(
  yearOverYearMonths: SupplyMonth[],
  endMonth: MonthKey,
  metric: 'consumption' | 'cost',
): YearOverYearPoint[] {
  const byMonth = new Map(yearOverYearMonths.map((month) => [month.month, month]));
  const points: YearOverYearPoint[] = [];
  for (let offset = -11; offset <= 0; offset++) {
    const month = shiftMonth(endMonth, offset);
    points.push({
      month,
      label: formatMonth(month),
      current: yearOverYearValue(byMonth.get(month), metric),
      previous: yearOverYearValue(byMonth.get(shiftMonth(month, -12)), metric),
    });
  }
  return points;
}

/** The change from previous to current, in percent; null when previous is 0 (no base). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface ReferenceLine {
  key: string;
  label: string;
  /** e.g. 'Fonte: ARERA' — printed under the chart. */
  source: string;
  /** €/unit (net of VAT) per month; null where the series has no value. */
  values: Record<MonthKey, number | null>;
}
