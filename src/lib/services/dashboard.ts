/**
 * The data behind the charts: one supply, and one house with all its supplies.
 *
 * Design: each supply's months are built once, from a start early enough that the series holds
 * any 24-month window ending in a month with data (24 months before the oldest bill line or
 * reading; before that the months are simply empty). The range the owner picked (12, 24 months or
 * everything) is then a slice of that series, while the year-over-year chart and the 12-month
 * tiles always use the 24 months ending at the last billed month: changing the range never changes
 * the tiles.
 *
 * "Last billed month" is the latest month at least half covered by confirmed bills, so a bill
 * that touches a month by a few days does not make it the reference. The house tiles end at the
 * oldest of those months among its active supplies, so that every active supply is billed in the
 * whole window and a supply billed quarterly does not look cheaper than one billed monthly.
 * Every total is net of the credit for energy fed into the grid (the engine's totalCents).
 *
 * The household (the people in the house over time) rides along when the house has one: the
 * people of each month shown, and their day-weighted average over the tiles' two 12-month windows
 * for the per-person tiles.
 */

import type { Db } from '@/lib/db/create-db';
import * as billsRepository from '@/lib/db/repositories/bills';
import * as householdRepository from '@/lib/db/repositories/household-sizes';
import type { HouseRow } from '@/lib/db/repositories/houses';
import * as housesRepository from '@/lib/db/repositories/houses';
import * as readingsRepository from '@/lib/db/repositories/readings';
import type { SupplyRow } from '@/lib/db/repositories/supplies';
import * as suppliesRepository from '@/lib/db/repositories/supplies';
import { daysInMonth, monthEnd, monthKeyOf, monthStart, shiftMonth } from '@/lib/domain/dates';
import type { IsoDate, MonthKey } from '@/lib/domain/types';
import {
  averagePeople,
  buildHouseholdMonths,
  buildHouseMonths,
  buildSupplyMonths,
  type EngineBill,
  type EngineReading,
  type HouseholdMonth,
  type HouseMonth,
  rolling12,
  type SupplyMonth,
} from '@/lib/engine';
import { DomainError } from '@/lib/errors';

export type DashboardRange = '12' | '24' | 'all';

export interface HouseholdView {
  /** One entry per month shown (range): the people at the month's end and the changes in it. */
  months: HouseholdMonth[];
  /**
   * The people over the 12 months ending at the tiles' end month, and over the 12 before, each day
   * weighing the same; null unless every day of the window is known.
   */
  last12: number | null;
  previous12: number | null;
}

export interface SupplyDashboard {
  supply: SupplyRow;
  /** The months shown (range), each with its consumption, costs and unit prices. */
  months: SupplyMonth[];
  /** The 24 months ending at the last billed month (or the current one): year-over-year chart and tiles. */
  yearOverYearMonths: SupplyMonth[];
  rolling: ReturnType<typeof rolling12>;
  /** Both 12-month periods have 12 months with bills: only then the change is shown. */
  isComparable: boolean;
  lastBilledMonth: MonthKey | null;
  /** The household of the supply's house; null when the house has none. */
  household: HouseholdView | null;
}

export interface HouseDashboard {
  house: HouseRow;
  /** Every supply of the house, archived ones included (they count in the costs, they get no card). */
  supplies: Array<{
    supply: SupplyRow;
    months: SupplyMonth[];
    lastBilledMonth: MonthKey | null;
    /** The month lastBilledMonth taken from the whole series, not only from the range. */
    lastBilled: SupplyMonth | null;
  }>;
  /** The months shown (range), summed over all the supplies. */
  houseMonths: HouseMonth[];
  /** Last month of the tiles' window; null when no active supply has a billed month. */
  houseEndMonth: MonthKey | null;
  /** Cents of the 12 months ending at houseEndMonth and of the 12 before; null with houseEndMonth null. */
  rolling: { last12: number; previous12: number; isComparable: boolean } | null;
  /** rolling.last12 over the months of its window with billed days, rounded; null when there are none. */
  averageMonthlyCents: number | null;
  /** null when the house has no household. */
  household: HouseholdView | null;
}

interface SupplyData {
  supply: SupplyRow;
  bills: EngineBill[];
  readings: EngineReading[];
  /** The oldest month with a confirmed bill line or a reading; null without either. */
  oldestMonth: MonthKey | null;
}

/** The months a dashboard covers: what is shown, and where its supplies' series start. */
interface DashboardWindow {
  toMonth: MonthKey;
  fromMonth: MonthKey;
  seriesStart: MonthKey;
}

const WINDOW_MONTHS = 24;

async function loadSupplyData(db: Db, userId: string, supply: SupplyRow): Promise<SupplyData> {
  const [bills, readings] = await Promise.all([
    billsRepository.listEngineBills(db, userId, supply.id),
    readingsRepository.listEngineReadings(db, userId, supply.id),
  ]);
  const days = [
    ...bills
      .filter((bill) => bill.status === 'confirmed')
      .flatMap((bill) => bill.lines.map((line) => line.periodStart)),
    ...readings.map((reading) => reading.readOn),
  ];
  const oldestDay = days.reduce<IsoDate | null>(
    (oldest, day) => (oldest === null || day < oldest ? day : oldest),
    null,
  );
  return {
    supply,
    bills,
    readings,
    oldestMonth: oldestDay === null ? null : monthKeyOf(oldestDay),
  };
}

function minMonth(a: MonthKey, b: MonthKey): MonthKey {
  return a < b ? a : b;
}

function dashboardWindow(
  range: DashboardRange,
  today: IsoDate,
  oldestMonth: MonthKey | null,
): DashboardWindow {
  const toMonth = monthKeyOf(today);
  // Bill dates are free: a bill dated in the future must not push the start past this month.
  const oldest = oldestMonth === null ? toMonth : minMonth(oldestMonth, toMonth);
  const fromMonth =
    range === '12'
      ? shiftMonth(toMonth, -11)
      : range === '24'
        ? shiftMonth(toMonth, -(WINDOW_MONTHS - 1))
        : oldest;
  return {
    toMonth,
    fromMonth,
    seriesStart: minMonth(fromMonth, shiftMonth(oldest, -(WINDOW_MONTHS - 1))),
  };
}

function buildSeries(data: SupplyData, window: DashboardWindow): SupplyMonth[] {
  return buildSupplyMonths({
    kind: data.supply.kind,
    hasPhotovoltaic: data.supply.hasPhotovoltaic,
    bills: data.bills,
    readings: data.readings,
    fromMonth: window.seriesStart,
    toMonth: window.toMonth,
  });
}

/** The latest month at least half covered by confirmed bills. */
function lastBilledMonthOf(series: readonly SupplyMonth[]): MonthKey | null {
  const billed = series.filter((month) => month.billedDays * 2 >= daysInMonth(month.month));
  return billed.at(-1)?.month ?? null;
}

async function loadHousehold(
  db: Db,
  userId: string,
  houseId: string,
  months: readonly MonthKey[],
  endMonth: MonthKey | null,
): Promise<HouseholdView | null> {
  const rows = await householdRepository.listHouseholdSizes(db, userId, houseId);
  if (rows.length === 0) return null;
  const changes = rows.map(({ validFrom, people }) => ({ validFrom, people }));
  const over = (from: MonthKey, to: MonthKey) =>
    averagePeople(changes, monthStart(from), monthEnd(to));
  return {
    months: buildHouseholdMonths(changes, months),
    last12: endMonth === null ? null : over(shiftMonth(endMonth, -11), endMonth),
    previous12:
      endMonth === null ? null : over(shiftMonth(endMonth, -23), shiftMonth(endMonth, -12)),
  };
}

function monthsBetween<T extends { month: MonthKey }>(
  series: readonly T[],
  from: MonthKey,
  to: MonthKey,
): T[] {
  return series.filter((month) => month.month >= from && month.month <= to);
}

export async function getSupplyDashboard(
  db: Db,
  userId: string,
  supplyId: string,
  options: { today: IsoDate; range: DashboardRange },
): Promise<SupplyDashboard> {
  const supply = await suppliesRepository.getSupply(db, userId, supplyId);
  if (!supply) throw new DomainError('NOT_FOUND');
  const data = await loadSupplyData(db, userId, supply);
  const window = dashboardWindow(options.range, options.today, data.oldestMonth);
  const series = buildSeries(data, window);

  const lastBilledMonth = lastBilledMonthOf(series);
  const endMonth = lastBilledMonth ?? window.toMonth;
  const yearOverYearMonths = monthsBetween(
    series,
    shiftMonth(endMonth, -(WINDOW_MONTHS - 1)),
    endMonth,
  );
  const rolling = rolling12(yearOverYearMonths, endMonth);
  const months = monthsBetween(series, window.fromMonth, window.toMonth);
  return {
    supply,
    months,
    yearOverYearMonths,
    rolling,
    isComparable:
      rolling.last12.monthsWithBills === 12 && rolling.previous12.monthsWithBills === 12,
    lastBilledMonth,
    household: await loadHousehold(
      db,
      userId,
      supply.houseId,
      months.map((month) => month.month),
      endMonth,
    ),
  };
}

/** The months of the window with billed days in at least one supply. */
function billedMonths(
  supplySeries: ReadonlyArray<readonly SupplyMonth[]>,
  from: MonthKey,
  to: MonthKey,
): Set<MonthKey> {
  return new Set(
    supplySeries.flatMap((series) =>
      monthsBetween(series, from, to)
        .filter((month) => month.billedDays > 0)
        .map((month) => month.month),
    ),
  );
}

function sumCents(months: readonly HouseMonth[], from: MonthKey, to: MonthKey): number {
  return monthsBetween(months, from, to).reduce((sum, month) => sum + month.totalCents, 0);
}

export async function getHouseDashboard(
  db: Db,
  userId: string,
  houseId: string,
  options: { today: IsoDate; range: DashboardRange },
): Promise<HouseDashboard> {
  const house = await housesRepository.getHouse(db, userId, houseId);
  if (!house) throw new DomainError('NOT_FOUND');
  const supplyRows = await suppliesRepository.listSupplies(db, userId, {
    houseId,
    includeArchived: true,
  });
  const supplyData = await Promise.all(
    supplyRows.map((supply) => loadSupplyData(db, userId, supply)),
  );
  // Every supply is built over the same months, so that the house has one entry per month.
  const houseOldest = supplyData
    .map((data) => data.oldestMonth)
    .reduce<MonthKey | null>(
      (oldest, month) =>
        month === null ? oldest : oldest === null ? month : minMonth(oldest, month),
      null,
    );
  const window = dashboardWindow(options.range, options.today, houseOldest);

  const built = supplyData.map((data) => {
    const series = buildSeries(data, window);
    const lastBilledMonth = lastBilledMonthOf(series);
    return {
      supply: data.supply,
      series,
      months: monthsBetween(series, window.fromMonth, window.toMonth),
      lastBilledMonth,
      lastBilled: series.find((month) => month.month === lastBilledMonth) ?? null,
    };
  });
  const houseMonths = buildHouseMonths(
    built.map((entry) => ({
      supplyId: entry.supply.id,
      kind: entry.supply.kind,
      months: entry.months,
    })),
  );

  const activeEnds = built
    .filter((entry) => entry.supply.archivedAt === null && entry.lastBilledMonth !== null)
    .map((entry) => entry.lastBilledMonth as MonthKey);
  const houseEndMonth = activeEnds.length > 0 ? activeEnds.reduce(minMonth) : null;

  const tiles = houseEndMonth === null ? null : houseTiles(built, houseEndMonth);
  return {
    house,
    supplies: built.map(({ supply, months, lastBilledMonth, lastBilled }) => ({
      supply,
      months,
      lastBilledMonth,
      lastBilled,
    })),
    houseMonths,
    houseEndMonth,
    rolling: tiles?.rolling ?? null,
    averageMonthlyCents: tiles?.averageMonthlyCents ?? null,
    household: await loadHousehold(
      db,
      userId,
      houseId,
      houseMonths.map((month) => month.month),
      houseEndMonth,
    ),
  };
}

/**
 * The house tiles over the whole series of every supply (archived ones are real spending too):
 * the 12 months ending at endMonth against the 12 before, and the monthly average over the months
 * of the window that something billed.
 */
function houseTiles(
  supplies: ReadonlyArray<{ supply: SupplyRow; series: SupplyMonth[] }>,
  endMonth: MonthKey,
): Pick<HouseDashboard, 'rolling' | 'averageMonthlyCents'> {
  const months = buildHouseMonths(
    supplies.map((entry) => ({
      supplyId: entry.supply.id,
      kind: entry.supply.kind,
      months: entry.series,
    })),
  );
  const allSeries = supplies.map((entry) => entry.series);
  const lastStart = shiftMonth(endMonth, -11);
  const previousStart = shiftMonth(endMonth, -23);
  const previousEnd = shiftMonth(endMonth, -12);
  const last12 = sumCents(months, lastStart, endMonth);
  const billedInLast12 = billedMonths(allSeries, lastStart, endMonth).size;
  return {
    rolling: {
      last12,
      previous12: sumCents(months, previousStart, previousEnd),
      isComparable: billedMonths(allSeries, previousStart, endMonth).size === WINDOW_MONTHS,
    },
    averageMonthlyCents: billedInLast12 === 0 ? null : Math.round(last12 / billedInLast12),
  };
}
