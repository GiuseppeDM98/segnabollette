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
import { createSelfReadings, deleteReading, listReadings } from './readings';

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

  it('lists nothing for the supply of someone else', async () => {
    const { db, userId, supplyId, intruderId } = await twoUsers();

    expect(await listReadings(db, userId, { supplyId })).toHaveLength(1);
    expect(await listReadings(db, intruderId, { supplyId })).toEqual([]);
  });
});
