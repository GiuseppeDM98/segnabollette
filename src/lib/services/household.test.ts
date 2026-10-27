import { describe, expect, it } from 'vitest';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import {
  createHouseWithSupply,
  expectDomainError,
  snapshotUserRows,
} from '@/lib/db/testing/fixtures';
import { addHouseholdSize, deleteHouseholdSize, listHousehold } from './household';
import { deleteHouse } from './houses-supplies';

const TODAY = { today: '2026-10-27' } as const;

async function setup() {
  const { db } = await createTestDb();
  const user = await createTestUser(db);
  const { houseId } = await createHouseWithSupply(db, user.id);
  return { db, userId: user.id, houseId };
}

describe('household', () => {
  it('lists the changes of a house oldest first', async () => {
    const { db, userId, houseId } = await setup();

    await addHouseholdSize(db, userId, { houseId, validFrom: '2025-02-07', people: 4 }, TODAY);
    await addHouseholdSize(db, userId, { houseId, validFrom: '2022-03-10', people: 2 }, TODAY);

    const rows = await listHousehold(db, userId, houseId);
    expect(rows.map((row) => [row.validFrom, row.people])).toEqual([
      ['2022-03-10', 2],
      ['2025-02-07', 4],
    ]);
  });

  it('refuses a number of people that is not a whole number from 1 to 20, and a bad date', async () => {
    const { db, userId, houseId } = await setup();

    for (const people of [0, 21, 2.5]) {
      await expectDomainError(
        addHouseholdSize(db, userId, { houseId, validFrom: '2026-01-01', people }, TODAY),
        'VALIDATION',
      );
    }
    for (const validFrom of ['2026-02-30', '', '2026-10-28']) {
      await expectDomainError(
        addHouseholdSize(db, userId, { houseId, validFrom, people: 2 }, TODAY),
        'VALIDATION',
      );
    }
    expect(await listHousehold(db, userId, houseId)).toEqual([]);
  });

  it('refuses a second change on the same day of the same house', async () => {
    const { db, userId, houseId } = await setup();
    await addHouseholdSize(db, userId, { houseId, validFrom: '2023-09-18', people: 3 }, TODAY);

    await expectDomainError(
      addHouseholdSize(db, userId, { houseId, validFrom: '2023-09-18', people: 4 }, TODAY),
      'VALIDATION',
    );
  });

  it("never reads, adds to or deletes from another user's house", async () => {
    const { db, userId, houseId } = await setup();
    const other = await createTestUser(db);
    const { householdSizeId } = await addHouseholdSize(
      db,
      userId,
      { houseId, validFrom: '2023-09-18', people: 3 },
      TODAY,
    );
    const before = await snapshotUserRows(db, userId);

    await expectDomainError(listHousehold(db, other.id, houseId), 'NOT_FOUND');
    await expectDomainError(
      addHouseholdSize(db, other.id, { houseId, validFrom: '2024-01-01', people: 1 }, TODAY),
      'NOT_FOUND',
    );
    await expectDomainError(deleteHouseholdSize(db, other.id, householdSizeId), 'NOT_FOUND');

    expect(await snapshotUserRows(db, userId)).toEqual(before);
  });

  it('deletes one change, and all of them with the house', async () => {
    const { db, userId, houseId } = await setup();
    const { householdSizeId } = await addHouseholdSize(
      db,
      userId,
      { houseId, validFrom: '2022-03-10', people: 2 },
      TODAY,
    );
    await addHouseholdSize(db, userId, { houseId, validFrom: '2023-09-18', people: 3 }, TODAY);

    await deleteHouseholdSize(db, userId, householdSizeId);
    expect((await listHousehold(db, userId, houseId)).map((row) => row.people)).toEqual([3]);

    await deleteHouse(db, userId, houseId);
    expect((await snapshotUserRows(db, userId)).householdSizes).toEqual([]);
  });
});
