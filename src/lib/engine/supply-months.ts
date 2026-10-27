/**
 * The monthly series of one supply, built from its confirmed bills and its readings.
 *
 * Design: every line is spread evenly over the days of its own competence period and summed into
 * calendar months. A recalculation line printed in September for August therefore lands in
 * August and corrects it, which is how Italian bills express adjustments (pairs of a line and its
 * "voce di ricalcolo" with opposite signs). Amounts are split with the largest-remainder method
 * so each line's months add up to its exact cents. Consumption is the commodity quantity in the
 * supply's unit; its F1/F2/F3 split comes from the line band or, failing that, from the bill's
 * own register readings.
 */
import {
  addDays,
  daysInclusive,
  eachMonthOverlap,
  monthKeyOf,
  monthRange,
} from '@/lib/domain/dates';
import { allocateCentsByWeights, unitPriceMicros } from '@/lib/domain/money';
import {
  type CostCategory,
  consumptionUnitOf,
  type IsoDate,
  isMetered,
  type MonthKey,
} from '@/lib/domain/types';
import { addToBand, bandSharesOfBill } from './bands';
import { dailyFromReadings, pickReadings } from './readings';
import {
  type EngineBill,
  type EngineLine,
  type EngineReading,
  emptyCosts,
  type SupplyMonth,
  type SupplyMonthsInput,
} from './types';

interface MonthAccumulator extends SupplyMonth {
  coveredDays: Set<IsoDate>;
  estimatedStamp: IsoDate | null;
  recalculatedStamp: IsoDate | null;
}

export function buildSupplyMonths(input: SupplyMonthsInput): SupplyMonth[] {
  const months = new Map<MonthKey, MonthAccumulator>();
  for (const month of monthRange(input.fromMonth, input.toMonth)) {
    months.set(month, emptyMonth(month));
  }
  const confirmed = input.bills.filter((bill) => bill.status === 'confirmed');
  // A replaced bill is excluded from the figures, and so are the readings it printed.
  const confirmedIds = new Set(confirmed.map((bill) => bill.id));
  const readings = input.readings.filter(
    (reading) => reading.billId === null || confirmedIds.has(reading.billId),
  );

  for (const bill of confirmed) addBill(months, bill, input);
  if (isMetered(input.kind)) addReadingsConsumption(months, confirmed, readings, input);
  if (input.kind === 'electricity' && input.hasPhotovoltaic) addPhotovoltaic(months, readings);

  return markLowConsumption([...months.values()].map(finishMonth));
}

/**
 * A month whose billed consumption is under this share of the supply's median billed month: gas
 * in summer (2 Smc against 80 in a winter month) costs mostly its fixed shares, so its total per
 * unit (6 €/Smc against 1,20) says nothing about the price and squeezes every other month.
 */
export const LOW_CONSUMPTION_SHARE = 0.25;

/**
 * The median is taken over every month of the series with a positive billed consumption, so it
 * does not move with the range the dashboard shows (the series always covers all the data).
 */
function markLowConsumption(months: SupplyMonth[]): SupplyMonth[] {
  const billed = months
    .map((month) => month.consumption)
    .filter((consumption): consumption is number => consumption !== null && consumption > 0)
    .sort((a, b) => a - b);
  if (billed.length === 0) return months;
  const middle = Math.floor(billed.length / 2);
  const median =
    billed.length % 2 === 1
      ? (billed[middle] ?? 0)
      : ((billed[middle - 1] ?? 0) + (billed[middle] ?? 0)) / 2;
  const threshold = median * LOW_CONSUMPTION_SHARE;
  return months.map((month) => ({
    ...month,
    isLowConsumption: month.consumption !== null && month.consumption < threshold,
  }));
}

function emptyMonth(month: MonthKey): MonthAccumulator {
  return {
    month,
    billedDays: 0,
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
    isLowConsumption: false,
    feedInKwh: null,
    productionKwh: null,
    selfConsumptionKwh: null,
    houseConsumptionKwh: null,
    coveredDays: new Set(),
    estimatedStamp: null,
    recalculatedStamp: null,
  };
}

function addBill(
  months: Map<MonthKey, MonthAccumulator>,
  bill: EngineBill,
  input: SupplyMonthsInput,
): void {
  // Billing-period coverage: a day counted once even when two bills overlap.
  for (let day = 0; day < daysInclusive(bill.periodStart, bill.periodEnd); day++) {
    const date = addDays(bill.periodStart, day);
    months.get(monthKeyOf(date))?.coveredDays.add(date);
  }

  const shares = bandSharesOfBill(bill);
  const unit = isMetered(input.kind) ? consumptionUnitOf(input.kind) : null;

  for (const line of bill.lines) {
    if (line.category === 'outside') continue;
    const category: CostCategory = line.category;
    const overlaps = eachMonthOverlap(line.periodStart, line.periodEnd);
    const totalDays = overlaps.reduce((sum, o) => sum + o.days, 0);
    if (totalDays === 0) continue;
    const cents = allocateCentsByWeights(
      line.amountCents,
      overlaps.map((o) => o.days),
    );
    const isConsumption =
      unit !== null &&
      line.category === 'commodity' &&
      line.quantity !== null &&
      line.quantityUnit === unit;

    overlaps.forEach((overlap, index) => {
      const month = months.get(overlap.month);
      if (!month) return; // outside the requested range
      month.costs[category] += cents[index] ?? 0;
      if (line.category === 'commodity') stampMonth(month, line, bill.periodEnd);
      if (!isConsumption || line.quantity === null) return;

      const quantity = (line.quantity * overlap.days) / totalDays;
      month.consumption = (month.consumption ?? 0) + quantity;
      if (line.band !== null) {
        addToBand(month.consumptionByBand, line.band, quantity);
        if (line.band !== 'single') month.hasCommodityBands = true;
      } else if (shares) {
        // Bands read from the meter, not offered by the contract: hasCommodityBands stays false.
        addToBand(month.consumptionByBand, 'F1', quantity * shares.F1);
        addToBand(month.consumptionByBand, 'F2', quantity * shares.F2);
        addToBand(month.consumptionByBand, 'F3', quantity * shares.F3);
      } else addToBand(month.consumptionByBand, 'single', quantity);
    });
  }
}

/**
 * Estimated months. An estimated commodity quantity stamps the month as estimated with its bill's
 * end; a recalculation that is not estimated, or any reversal (quantity ≤ 0), stamps it as
 * recalculated. finishMonth keeps the month estimated unless a recalculated stamp is strictly
 * later, so a recalculation that is itself still estimated leaves the month estimated.
 */
function stampMonth(month: MonthAccumulator, line: EngineLine, billEnd: IsoDate): void {
  const isReversal = line.quantity !== null && line.quantity <= 0;
  if (line.isEstimated && line.quantity !== null && line.quantity > 0) {
    if (!month.estimatedStamp || billEnd > month.estimatedStamp) month.estimatedStamp = billEnd;
  } else if ((line.isRecalculation && !line.isEstimated) || isReversal) {
    if (!month.recalculatedStamp || billEnd > month.recalculatedStamp) {
      month.recalculatedStamp = billEnd;
    }
  }
}

/** Consumption measured by readings on the days after the last billed day. */
function addReadingsConsumption(
  months: Map<MonthKey, MonthAccumulator>,
  confirmed: EngineBill[],
  readings: EngineReading[],
  input: SupplyMonthsInput,
): void {
  const lastBilledDay = confirmed.reduce<IsoDate | null>(
    (last, bill) => (!last || bill.periodEnd > last ? bill.periodEnd : last),
    null,
  );
  const picked = pickReadings(readings);
  const usesBands =
    input.kind === 'electricity' &&
    picked.some((r) => r.register === 'F1' || r.register === 'F2' || r.register === 'F3');
  const registers = usesBands ? (['F1', 'F2', 'F3'] as const) : (['single'] as const);

  let factor = 1;
  let isAssumed = false;
  if (input.kind === 'gas') {
    const withFactor = [...confirmed]
      .filter((b) => b.conversionFactor !== null)
      .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
    factor = withFactor?.conversionFactor ?? 1;
    isAssumed = !withFactor;
  }

  for (const register of registers) {
    for (const [day, amount] of dailyFromReadings(readings, register)) {
      if (lastBilledDay && day <= lastBilledDay) continue;
      const month = months.get(monthKeyOf(day));
      if (!month) continue;
      month.readingsConsumption = (month.readingsConsumption ?? 0) + amount * factor;
      month.isReadingsConversionAssumed = month.isReadingsConversionAssumed || isAssumed;
    }
  }
}

function addPhotovoltaic(months: Map<MonthKey, MonthAccumulator>, readings: EngineReading[]): void {
  const feedIn = dailyFromReadings(readings, 'feed_in');
  const production = dailyFromReadings(readings, 'production');
  for (const [day, kwh] of feedIn) {
    const month = months.get(monthKeyOf(day));
    if (month) month.feedInKwh = (month.feedInKwh ?? 0) + kwh;
  }
  for (const [day, kwh] of production) {
    const month = months.get(monthKeyOf(day));
    if (!month) continue;
    month.productionKwh = (month.productionKwh ?? 0) + kwh;
    const exported = feedIn.get(day);
    if (exported !== undefined) {
      month.selfConsumptionKwh = (month.selfConsumptionKwh ?? 0) + (kwh - exported);
    }
  }
}

function finishMonth(month: MonthAccumulator): SupplyMonth {
  const { coveredDays, estimatedStamp, recalculatedStamp, ...result } = month;
  result.billedDays = coveredDays.size;
  result.isEstimated =
    estimatedStamp !== null && !(recalculatedStamp !== null && recalculatedStamp > estimatedStamp);
  // The credit for energy fed into the grid ('feed_in', negative) lowers the month's total.
  result.totalCents = Object.values(result.costs).reduce((sum, cents) => sum + cents, 0);
  result.commodityUnitPriceMicros = unitPriceMicros(result.costs.commodity, result.consumption);
  result.totalUnitPriceMicros = unitPriceMicros(result.totalCents, result.consumption);
  if (result.selfConsumptionKwh !== null) {
    result.selfConsumptionKwh = Math.max(0, result.selfConsumptionKwh);
  }
  result.houseConsumptionKwh =
    result.consumption !== null && result.selfConsumptionKwh !== null
      ? result.consumption + result.selfConsumptionKwh
      : null;
  return result;
}
