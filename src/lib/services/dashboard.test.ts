import { describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/create-db';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import {
  billInput,
  commodityLine,
  createHouseWithSupply,
  expectDomainError,
} from '@/lib/db/testing/fixtures';
import { monthEnd, monthRange, monthStart } from '@/lib/domain/dates';
import type { MonthKey } from '@/lib/domain/types';
import { confirmBill } from './bills';
import { getHouseDashboard, getSupplyDashboard } from './dashboard';
import { createSupply } from './houses-supplies';
import { createSelfReadings } from './readings';

const MANUAL = { source: 'manual' } as const;
const TODAY = '2026-10-24';
const LAST_MONTH = '2026-09';

async function setup() {
  const { db } = await createTestDb();
  const user = await createTestUser(db);
  const other = await createTestUser(db);
  return { db, userId: user.id, otherId: other.id };
}

/** One electricity bill per month: 200 kWh for `cents`, the whole month. */
async function addMonthlyElectricity(
  db: Db,
  userId: string,
  supplyId: string,
  months: MonthKey[],
  cents: number,
): Promise<void> {
  for (const month of months) {
    const period = { periodStart: monthStart(month), periodEnd: monthEnd(month) };
    await confirmBill(
      db,
      userId,
      billInput(
        supplyId,
        {
          totalCents: cents,
          amountDueCents: cents,
          lines: [commodityLine({ ...period, amountCents: cents })],
        },
        period,
      ),
      MANUAL,
    );
  }
}

/** One water bill per quarter (three months each, from `first`), 30 m³ for `cents`. */
async function addQuarterlyWater(
  db: Db,
  userId: string,
  supplyId: string,
  quarters: Array<[MonthKey, MonthKey]>,
  cents: number,
): Promise<void> {
  for (const [first, last] of quarters) {
    const period = { periodStart: monthStart(first), periodEnd: monthEnd(last) };
    await confirmBill(
      db,
      userId,
      billInput(
        supplyId,
        {
          supplierName: 'Ornitorinco Acque',
          totalCents: cents,
          amountDueCents: cents,
          lines: [
            commodityLine({
              ...period,
              description: 'Quota variabile',
              quantity: 30,
              quantityUnit: 'm3',
              unitPriceMicros: 1_000_000,
              amountCents: cents,
            }),
          ],
        },
        period,
      ),
      MANUAL,
    );
  }
}

describe('getSupplyDashboard', () => {
  // 14 monthly bills up to last month, and one self reading older than all of them.
  async function supplyWithBills() {
    const context = await setup();
    const { supplyId } = await createHouseWithSupply(context.db, context.userId);
    await addMonthlyElectricity(
      context.db,
      context.userId,
      supplyId,
      monthRange('2025-08', LAST_MONTH),
      4730,
    );
    await createSelfReadings(
      context.db,
      context.userId,
      { supplyId, readOn: '2025-05-10', values: [{ register: 'single', value: 1000 }] },
      { today: TODAY },
    );
    return { ...context, supplyId };
  }

  it('slices the range but keeps the 24 months ending at the last billed month', async () => {
    const { db, userId, supplyId } = await supplyWithBills();

    const twelve = await getSupplyDashboard(db, userId, supplyId, { today: TODAY, range: '12' });
    const twentyFour = await getSupplyDashboard(db, userId, supplyId, {
      today: TODAY,
      range: '24',
    });

    expect(twelve.months.map((month) => month.month)).toEqual(monthRange('2025-11', '2026-10'));
    expect(twentyFour.months).toHaveLength(24);
    expect(twelve.yearOverYearMonths).toHaveLength(24);
    expect(twelve.yearOverYearMonths.at(-1)?.month).toBe(LAST_MONTH);
    expect(twelve.lastBilledMonth).toBe(LAST_MONTH);
    expect(twelve.rolling.last12.totalCents).toBe(12 * 4730);
    expect(twelve.rolling.previous12).toEqual(twentyFour.rolling.previous12);
    expect(twelve.rolling.previous12.monthsWithBills).toBe(2);
    expect(twelve.isComparable).toBe(false);
  });

  it('starts «everything» at the month of the oldest reading', async () => {
    const { db, userId, supplyId } = await supplyWithBills();

    const all = await getSupplyDashboard(db, userId, supplyId, { today: TODAY, range: 'all' });

    expect(all.months[0]?.month).toBe('2025-05');
    expect(all.months.at(-1)?.month).toBe('2026-10');
  });

  it('starts «everything» no later than this month when the only bill is dated in the future', async () => {
    const { db, userId } = await setup();
    const { supplyId } = await createHouseWithSupply(db, userId);
    await addMonthlyElectricity(db, userId, supplyId, ['2026-12'], 2000);

    const all = await getSupplyDashboard(db, userId, supplyId, { today: TODAY, range: 'all' });

    expect(all.months.map((month) => month.month)).toEqual(['2026-10']);
  });

  it('reads the own supply and refuses someone else’s as missing', async () => {
    const { db, userId, otherId, supplyId } = await supplyWithBills();

    const own = await getSupplyDashboard(db, userId, supplyId, { today: TODAY, range: '24' });

    expect(own.supply.id).toBe(supplyId);
    await expectDomainError(
      getSupplyDashboard(db, otherId, supplyId, { today: TODAY, range: '24' }),
      'NOT_FOUND',
    );
  });
});

describe('getHouseDashboard', () => {
  it('sums electricity and internet in the same month, the internet as a flat fee', async () => {
    const { db, userId } = await setup();
    const { houseId, supplyId } = await createHouseWithSupply(db, userId);
    const { supplyId: internetId } = await createSupply(db, userId, {
      houseId,
      kind: 'telecom',
      label: 'Internet',
      supplierName: null,
      identifier: null,
      hasPhotovoltaic: false,
    });
    await addMonthlyElectricity(db, userId, supplyId, [LAST_MONTH], 2000);
    await confirmBill(
      db,
      userId,
      billInput(internetId, {
        supplierName: 'Lemure Telecomunicazioni',
        totalCents: 2500,
        amountDueCents: 2500,
        lines: [
          commodityLine({
            description: 'Canone',
            category: 'sale',
            component: 'fixed',
            quantity: null,
            quantityUnit: null,
            unitPriceMicros: null,
            amountCents: 2500,
          }),
        ],
      }),
      MANUAL,
    );

    const dashboard = await getHouseDashboard(db, userId, houseId, { today: TODAY, range: '12' });

    const september = dashboard.houseMonths.find((month) => month.month === LAST_MONTH);
    expect(dashboard.houseMonths).toHaveLength(12);
    expect(september?.totalCents).toBe(4500);
    expect(september?.costs.flat).toBe(2500);
    expect(september?.costs.commodity).toBe(2000);
  });

  it('ends the tiles at the oldest last billed month and averages over the billed months', async () => {
    const { db, userId } = await setup();
    const { houseId, supplyId } = await createHouseWithSupply(db, userId);
    const { supplyId: waterId } = await createSupply(db, userId, {
      houseId,
      kind: 'water',
      label: 'Acqua',
      supplierName: null,
      identifier: null,
      hasPhotovoltaic: false,
    });
    // Electricity from 9 months ago to last month; water from 11 months ago to 3 months ago.
    await addMonthlyElectricity(db, userId, supplyId, monthRange('2026-01', LAST_MONTH), 1000);
    await addQuarterlyWater(
      db,
      userId,
      waterId,
      [
        ['2025-11', '2026-01'],
        ['2026-02', '2026-04'],
        ['2026-05', '2026-07'],
      ],
      3000,
    );

    const dashboard = await getHouseDashboard(db, userId, houseId, { today: TODAY, range: '24' });

    expect(dashboard.houseEndMonth).toBe('2026-07');
    expect(dashboard.rolling?.last12).toBe(16_000);
    expect(dashboard.rolling?.previous12).toBe(0);
    expect(dashboard.rolling?.isComparable).toBe(false);
    expect(dashboard.averageMonthlyCents).toBe(1778);
    const electricity = dashboard.supplies.find((entry) => entry.supply.id === supplyId);
    expect(electricity?.lastBilledMonth).toBe(LAST_MONTH);
    expect(electricity?.lastBilled?.totalCents).toBe(1000);
  });

  it('has no tiles for a house without bills', async () => {
    const { db, userId } = await setup();
    const { houseId } = await createHouseWithSupply(db, userId);

    const dashboard = await getHouseDashboard(db, userId, houseId, { today: TODAY, range: '24' });

    expect(dashboard.houseEndMonth).toBeNull();
    expect(dashboard.rolling).toBeNull();
    expect(dashboard.averageMonthlyCents).toBeNull();
    expect(dashboard.supplies[0]?.lastBilled).toBeNull();
  });

  it('reads the own house and refuses someone else’s as missing', async () => {
    const { db, userId, otherId } = await setup();
    const { houseId } = await createHouseWithSupply(db, userId);

    const own = await getHouseDashboard(db, userId, houseId, { today: TODAY, range: '24' });

    expect(own.house.id).toBe(houseId);
    await expectDomainError(
      getHouseDashboard(db, otherId, houseId, { today: TODAY, range: '24' }),
      'NOT_FOUND',
    );
  });
});
