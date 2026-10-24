import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { meterReadings } from '@/lib/db/schema/app';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import {
  billInput,
  createHouseWithSupply,
  expectDomainError,
  snapshotUserRows,
} from '@/lib/db/testing/fixtures';
import { addDays } from '@/lib/domain/dates';
import { confirmBill } from './bills';
import { createHouse } from './houses-supplies';
import {
  createSelfReadings,
  deleteReading,
  latestReadings,
  listReadings,
  suggestedRegisters,
} from './readings';

const TODAY = '2026-10-24';

async function setup() {
  const { db } = await createTestDb();
  const user = await createTestUser(db);
  const { supplyId } = await createHouseWithSupply(db, user.id);
  return { db, userId: user.id, supplyId };
}

function selfReading(supplyId: string, readOn = TODAY, register = 'single', value = 1000) {
  return { supplyId, readOn, values: [{ register, value }] };
}

describe('createSelfReadings', () => {
  it('refuses a reading on a flat-fee supply', async () => {
    const { db, userId } = await setup();
    const { supplyId } = await createHouseWithSupply(db, userId, {
      kind: 'telecom',
      label: 'Internet',
    });

    await expectDomainError(
      createSelfReadings(db, userId, selfReading(supplyId), { today: TODAY }),
      'VALIDATION',
    );
  });

  it('refuses the production register without photovoltaic', async () => {
    const { db, userId, supplyId } = await setup();

    await expectDomainError(
      createSelfReadings(db, userId, selfReading(supplyId, TODAY, 'production'), { today: TODAY }),
      'VALIDATION',
    );
  });

  it('saves a reading dated today and refuses one dated tomorrow', async () => {
    const { db, userId, supplyId } = await setup();

    const { readingIds } = await createSelfReadings(db, userId, selfReading(supplyId), {
      today: TODAY,
    });
    const error = await expectDomainError(
      createSelfReadings(db, userId, selfReading(supplyId, addDays(TODAY, 1), 'single', 1100), {
        today: TODAY,
      }),
      'VALIDATION',
    );

    expect(readingIds).toHaveLength(1);
    expect(error.details).toEqual(['La lettura non può essere nel futuro.']);
    expect(await db.select().from(meterReadings)).toHaveLength(1);
  });
});

describe('deleteReading', () => {
  it('refuses to delete a reading printed on a bill', async () => {
    const { db, userId, supplyId } = await setup();
    const { billId } = await confirmBill(
      db,
      userId,
      billInput(supplyId, {
        readings: [
          { readOn: '2026-09-30', register: 'single', value: 1000, source: 'bill_actual' },
        ],
      }),
      { source: 'manual' },
    );
    const [billReading] = await db
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.billId, billId));
    if (!billReading) throw new Error('the bill reading was not saved');

    await expectDomainError(deleteReading(db, userId, billReading.id), 'VALIDATION');
  });
});

describe('readings — isolation between users', () => {
  async function twoUsers() {
    const owner = await setup();
    const intruder = await createTestUser(owner.db);
    const { supplyId: intruderSupplyId } = await createHouseWithSupply(owner.db, intruder.id);
    const {
      readingIds: [readingId],
    } = await createSelfReadings(owner.db, owner.userId, selfReading(owner.supplyId), {
      today: TODAY,
    });
    if (!readingId) throw new Error('the reading was not saved');
    return { ...owner, readingId, intruderId: intruder.id, intruderSupplyId };
  }

  it('writes on the own supply and refuses the supply of someone else', async () => {
    const { db, userId, supplyId, intruderId, intruderSupplyId } = await twoUsers();
    const before = await snapshotUserRows(db, userId);

    await createSelfReadings(db, intruderId, selfReading(intruderSupplyId), { today: TODAY });
    await expectDomainError(
      createSelfReadings(db, intruderId, selfReading(supplyId), { today: TODAY }),
      'NOT_FOUND',
    );

    expect(await snapshotUserRows(db, userId)).toEqual(before);
    expect((await snapshotUserRows(db, intruderId)).meterReadings).toHaveLength(1);
  });

  it('refuses to delete the reading of someone else and deletes the own one', async () => {
    const { db, userId, readingId, intruderId } = await twoUsers();
    const before = await snapshotUserRows(db, userId);

    await expectDomainError(deleteReading(db, intruderId, readingId), 'NOT_FOUND');
    expect(await snapshotUserRows(db, userId)).toEqual(before);

    await deleteReading(db, userId, readingId);
    expect((await snapshotUserRows(db, userId)).meterReadings).toEqual([]);
  });

  it('names the house of the supply once there is a second house', async () => {
    const { db, userId } = await twoUsers();
    expect((await listReadings(db, userId, {}))[0]?.supplyLabel).toBe('Luce');

    await createHouse(db, userId, { name: 'Casa Gabbiano' });

    expect((await listReadings(db, userId, {}))[0]?.supplyLabel).toBe('Luce · Casa Pellicano');
  });

  it('lists nothing for the supply of someone else', async () => {
    const { db, userId, supplyId, intruderId } = await twoUsers();

    expect(await listReadings(db, userId, { supplyId })).toHaveLength(1);
    expect(await listReadings(db, intruderId, { supplyId })).toEqual([]);
  });
});

describe('suggestedRegisters', () => {
  const bandReadings = (readOn: string, base: number) =>
    (['F1', 'F2', 'F3'] as const).map((register, index) => ({
      readOn,
      register,
      value: base + index * 100,
      source: 'bill_actual' as const,
    }));

  it('asks for F1, F2 and F3 when a confirmed bill has banded readings', async () => {
    const { db, userId, supplyId } = await setup();
    await confirmBill(
      db,
      userId,
      billInput(supplyId, { readings: bandReadings('2026-09-30', 1000) }),
      { source: 'manual' },
    );

    expect(await suggestedRegisters(db, userId, supplyId)).toEqual(['F1', 'F2', 'F3']);
  });

  it('keeps the bands when the banded bill is older and the latest one has no readings', async () => {
    const { db, userId, supplyId } = await setup();
    const august = { periodStart: '2026-08-01', periodEnd: '2026-08-31' };
    await confirmBill(
      db,
      userId,
      billInput(supplyId, { readings: bandReadings('2026-08-31', 1000) }, august),
      { source: 'manual' },
    );
    await confirmBill(db, userId, billInput(supplyId), { source: 'manual' });

    expect(await suggestedRegisters(db, userId, supplyId)).toEqual(['F1', 'F2', 'F3']);
  });

  it('asks for a single value without readings, for gas, and adds the panels registers', async () => {
    const { db, userId, supplyId } = await setup();
    const { supplyId: gasId } = await createHouseWithSupply(db, userId, {
      kind: 'gas',
      label: 'Gas',
    });
    const { supplyId: panelsId } = await createHouseWithSupply(db, userId, {
      label: 'Luce con pannelli',
      hasPhotovoltaic: true,
    });

    expect(await suggestedRegisters(db, userId, supplyId)).toEqual(['single']);
    expect(await suggestedRegisters(db, userId, gasId)).toEqual(['single']);
    expect(await suggestedRegisters(db, userId, panelsId)).toEqual([
      'single',
      'feed_in',
      'production',
    ]);
  });

  it('refuses a flat-fee supply', async () => {
    const { db, userId } = await setup();
    const { supplyId } = await createHouseWithSupply(db, userId, {
      kind: 'telecom',
      label: 'Internet',
    });

    await expectDomainError(suggestedRegisters(db, userId, supplyId), 'VALIDATION');
  });

  it('answers for the own supply and refuses the supply of someone else', async () => {
    const { db, userId, supplyId } = await setup();
    const intruder = await createTestUser(db);

    expect(await suggestedRegisters(db, userId, supplyId)).toEqual(['single']);
    await expectDomainError(suggestedRegisters(db, intruder.id, supplyId), 'NOT_FOUND');
  });
});

describe('latestReadings', () => {
  const january = { periodStart: '2025-01-01', periodEnd: '2025-01-31' };
  const february = { periodStart: '2025-02-01', periodEnd: '2025-02-28' };
  const f1 = (readOn: string, value: number) => ({
    readOn,
    register: 'F1' as const,
    value,
    source: 'bill_actual' as const,
  });

  it('gives the most recent reading per register, ignoring a replaced bill', async () => {
    const { db, userId, supplyId } = await setup();
    await confirmBill(
      db,
      userId,
      billInput(supplyId, { readings: [f1('2025-01-31', 100)] }, january),
      { source: 'manual' },
    );
    await createSelfReadings(
      db,
      userId,
      { supplyId, readOn: '2025-02-15', values: [{ register: 'F1', value: 120 }] },
      { today: TODAY },
    );
    // A February bill read F1 later, then a second February bill replaced it.
    await confirmBill(
      db,
      userId,
      billInput(supplyId, { readings: [f1('2025-02-28', 130)] }, february),
      { source: 'manual' },
    );
    await confirmBill(db, userId, billInput(supplyId, { overlapDecision: 'replace' }, february), {
      source: 'manual',
    });

    expect(await latestReadings(db, userId, supplyId)).toEqual({
      F1: { value: 120, readOn: '2025-02-15' },
    });
  });

  it('answers for the own supply and refuses the supply of someone else', async () => {
    const { db, userId, supplyId } = await setup();
    await createSelfReadings(db, userId, selfReading(supplyId), { today: TODAY });
    const intruder = await createTestUser(db);

    expect(await latestReadings(db, userId, supplyId)).toEqual({
      single: { value: 1000, readOn: TODAY },
    });
    await expectDomainError(latestReadings(db, intruder.id, supplyId), 'NOT_FOUND');
  });
});
