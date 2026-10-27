import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema/auth';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import { billInput, createHouseWithSupply, snapshotUserRows } from '@/lib/db/testing/fixtures';
import { confirmBill } from './bills';
import { addHouseholdSize } from './household';
import { createSelfReadings } from './readings';
import { deleteAllUserData } from './user-data';

describe('deleteAllUserData', () => {
  it('deletes every app row of the user so the user can go, and leaves the other user alone', async () => {
    // Arrange: a user with a house, a supply, a replaced and a confirmed bill, and readings
    const { db } = await createTestDb();
    const user = await createTestUser(db);
    const other = await createTestUser(db);
    for (const { id } of [user, other]) {
      const { houseId, supplyId } = await createHouseWithSupply(db, id);
      await addHouseholdSize(
        db,
        id,
        { houseId, validFrom: '2026-01-10', people: 3 },
        { today: '2026-10-24' },
      );
      const readings = [
        {
          readOn: '2026-09-30',
          register: 'single' as const,
          value: 1000,
          source: 'bill_actual' as const,
        },
      ];
      await confirmBill(db, id, billInput(supplyId, { readings }), { source: 'manual' });
      await confirmBill(db, id, billInput(supplyId, { readings, overlapDecision: 'replace' }), {
        source: 'manual',
      });
      await createSelfReadings(
        db,
        id,
        { supplyId, readOn: '2026-10-10', values: [{ register: 'single', value: 1100 }] },
        { today: '2026-10-24' },
      );
    }
    const otherBefore = await snapshotUserRows(db, other.id);

    // Act
    await deleteAllUserData(db, user.id);
    await db.delete(users).where(eq(users.id, user.id));

    // Assert
    expect(await snapshotUserRows(db, user.id)).toEqual({
      houses: [],
      supplies: [],
      bills: [],
      billLines: [],
      meterReadings: [],
      extractions: [],
      documents: [],
      householdSizes: [],
    });
    expect(await snapshotUserRows(db, other.id)).toEqual(otherBefore);
  });
});
