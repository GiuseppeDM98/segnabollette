import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/create-db';
import { supplies } from '@/lib/db/schema/app';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import {
  billInput,
  createHouseWithSupply,
  expectDomainError,
  snapshotUserRows,
} from '@/lib/db/testing/fixtures';
import { confirmBill } from './bills';
import {
  archiveSupply,
  createHouse,
  createSupply,
  deleteHouse,
  deleteSupply,
  getDeletionSummary,
  getSupplyDetail,
  listHousesWithSupplies,
  renameHouse,
  updateSupply,
} from './houses-supplies';
import { createSelfReadings } from './readings';

const MANUAL = { source: 'manual' } as const;
const TODAY = '2026-10-24';

async function setup() {
  const { db } = await createTestDb();
  const user = await createTestUser(db);
  return { db, userId: user.id };
}

/** Two bills on the supply, the first replaced by the second, plus one self reading. */
async function addBillsAndReadings(db: Db, userId: string, supplyId: string): Promise<void> {
  const readings = [
    {
      readOn: '2026-09-30',
      register: 'single' as const,
      value: 1000,
      source: 'bill_actual' as const,
    },
  ];
  await confirmBill(db, userId, billInput(supplyId, { readings }), MANUAL);
  await confirmBill(
    db,
    userId,
    billInput(supplyId, { readings, overlapDecision: 'replace' }),
    MANUAL,
  );
  await createSelfReadings(
    db,
    userId,
    { supplyId, readOn: '2026-10-10', values: [{ register: 'single', value: 1100 }] },
    { today: TODAY },
  );
}

function supplyInput(houseId: string) {
  return {
    houseId,
    kind: 'electricity' as const,
    label: 'Luce',
    supplierName: 'Fenicottero Energia',
    identifier: null,
    hasPhotovoltaic: false,
  };
}

describe('supplies', () => {
  it('stores the identifier normalized', async () => {
    const { db, userId } = await setup();
    const { houseId } = await createHouse(db, userId, { name: 'Casa Pellicano' });

    const { supplyId } = await createSupply(db, userId, {
      ...supplyInput(houseId),
      identifier: 'it 001 e 0000-0001',
    });

    const [row] = await db.select().from(supplies).where(eq(supplies.id, supplyId));
    expect(row?.identifier).toBe('IT001E00000001');
  });

  it('refuses a second supply with the same identifier', async () => {
    const { db, userId } = await setup();
    const { houseId } = await createHouse(db, userId, { name: 'Casa Pellicano' });
    await createSupply(db, userId, { ...supplyInput(houseId), identifier: 'IT001E00000001' });

    await expectDomainError(
      createSupply(db, userId, { ...supplyInput(houseId), identifier: 'IT001E 0000 0001' }),
      'DUPLICATE_IDENTIFIER',
    );
  });

  it('refuses photovoltaic on gas', async () => {
    const { db, userId } = await setup();
    const { houseId } = await createHouse(db, userId, { name: 'Casa Pellicano' });

    const error = await expectDomainError(
      createSupply(db, userId, { ...supplyInput(houseId), kind: 'gas', hasPhotovoltaic: true }),
      'VALIDATION',
    );

    expect(error.details).toEqual(['Il fotovoltaico vale solo per la luce.']);
  });
});

describe('deleting houses and supplies', () => {
  it('deletes a house with an active and an archived supply, bills and readings', async () => {
    // Arrange
    const { db, userId } = await setup();
    const { houseId, supplyId: active } = await createHouseWithSupply(db, userId);
    const { supplyId: archived } = await createSupply(db, userId, {
      ...supplyInput(houseId),
      label: 'Luce vecchia',
    });
    await addBillsAndReadings(db, userId, active);
    await addBillsAndReadings(db, userId, archived);
    await archiveSupply(db, userId, archived, { archived: true, now: 1000 });
    const other = await createHouseWithSupply(db, userId);
    await addBillsAndReadings(db, userId, other.supplyId);
    const otherRowsBefore = await snapshotUserRows(db, userId);

    // Act
    await expect(deleteHouse(db, userId, houseId)).resolves.toEqual({ documentPathnames: [] });

    // Assert: only the other house and what is under it are left
    const after = await snapshotUserRows(db, userId);
    expect(after.houses.map((house) => house.id)).toEqual([other.houseId]);
    expect(after.supplies.map((supply) => supply.id)).toEqual([other.supplyId]);
    expect(after.bills).toEqual(otherRowsBefore.bills.filter((b) => b.supplyId === other.supplyId));
    expect(after.meterReadings).toEqual(
      otherRowsBefore.meterReadings.filter((r) => r.supplyId === other.supplyId),
    );
    expect(after.billLines).toHaveLength(2);
  });

  it('deletes a supply with its bills, bill readings and self readings', async () => {
    // Arrange
    const { db, userId } = await setup();
    const { houseId, supplyId } = await createHouseWithSupply(db, userId);
    const { supplyId: sibling } = await createSupply(db, userId, {
      ...supplyInput(houseId),
      label: 'Luce garage',
    });
    await addBillsAndReadings(db, userId, supplyId);
    await addBillsAndReadings(db, userId, sibling);
    const before = await snapshotUserRows(db, userId);

    // Act
    await expect(deleteSupply(db, userId, supplyId)).resolves.toEqual({ documentPathnames: [] });

    // Assert
    const after = await snapshotUserRows(db, userId);
    expect(after.supplies.map((supply) => supply.id)).toEqual([sibling]);
    expect(after.bills).toEqual(before.bills.filter((bill) => bill.supplyId === sibling));
    expect(after.meterReadings).toEqual(
      before.meterReadings.filter((reading) => reading.supplyId === sibling),
    );
    expect(after.houses).toEqual(before.houses);
  });
});

describe('houses and supplies — isolation between users', () => {
  async function twoUsers() {
    const { db, userId } = await setup();
    const own = await createHouseWithSupply(db, userId);
    await addBillsAndReadings(db, userId, own.supplyId);
    const intruder = await createTestUser(db);
    const intruderHouse = await createHouseWithSupply(db, intruder.id);
    return { db, userId, own, intruderId: intruder.id, intruderHouse };
  }

  it('renames the own house and refuses the house of someone else', async () => {
    const { db, userId, own, intruderId } = await twoUsers();

    await renameHouse(db, userId, own.houseId, 'Casa Gabbiano');
    const before = await snapshotUserRows(db, userId);
    await expectDomainError(renameHouse(db, intruderId, own.houseId, 'Casa Intrusa'), 'NOT_FOUND');

    expect(before.houses[0]?.name).toBe('Casa Gabbiano');
    expect(await snapshotUserRows(db, userId)).toEqual(before);
  });

  it('refuses to delete the house of someone else and deletes the own one', async () => {
    const { db, userId, own, intruderId, intruderHouse } = await twoUsers();
    const before = await snapshotUserRows(db, userId);

    await expectDomainError(deleteHouse(db, intruderId, own.houseId), 'NOT_FOUND');
    expect(await snapshotUserRows(db, userId)).toEqual(before);

    await deleteHouse(db, intruderId, intruderHouse.houseId);
    expect((await snapshotUserRows(db, intruderId)).houses).toEqual([]);
  });

  it('adds a supply to the own house and refuses the house of someone else', async () => {
    const { db, userId, own, intruderId, intruderHouse } = await twoUsers();
    const before = await snapshotUserRows(db, userId);

    await createSupply(db, intruderId, { ...supplyInput(intruderHouse.houseId), label: 'Gas' });
    await expectDomainError(createSupply(db, intruderId, supplyInput(own.houseId)), 'NOT_FOUND');

    expect(await snapshotUserRows(db, userId)).toEqual(before);
    expect((await snapshotUserRows(db, intruderId)).supplies).toHaveLength(2);
  });

  it('updates the own supply and refuses the supply or the house of someone else', async () => {
    const { db, userId, own, intruderId, intruderHouse } = await twoUsers();

    await updateSupply(db, intruderId, intruderHouse.supplyId, { label: 'Luce nuova' });
    const before = await snapshotUserRows(db, userId);
    await expectDomainError(
      updateSupply(db, intruderId, own.supplyId, { label: 'Intrusa' }),
      'NOT_FOUND',
    );
    await expectDomainError(
      updateSupply(db, intruderId, intruderHouse.supplyId, { houseId: own.houseId }),
      'NOT_FOUND',
    );

    expect(await snapshotUserRows(db, userId)).toEqual(before);
    expect((await snapshotUserRows(db, intruderId)).supplies[0]).toMatchObject({
      label: 'Luce nuova',
      houseId: intruderHouse.houseId,
    });
  });

  it('archives the own supply and refuses the supply of someone else', async () => {
    const { db, userId, own, intruderId, intruderHouse } = await twoUsers();
    const before = await snapshotUserRows(db, userId);

    await archiveSupply(db, intruderId, intruderHouse.supplyId, { archived: true, now: 1000 });
    await expectDomainError(
      archiveSupply(db, intruderId, own.supplyId, { archived: true, now: 1000 }),
      'NOT_FOUND',
    );

    expect(await snapshotUserRows(db, userId)).toEqual(before);
    expect((await snapshotUserRows(db, intruderId)).supplies[0]?.archivedAt).toBe(1000);
  });

  it('refuses to delete the supply of someone else and deletes the own one', async () => {
    const { db, userId, own, intruderId, intruderHouse } = await twoUsers();
    const before = await snapshotUserRows(db, userId);

    await expectDomainError(deleteSupply(db, intruderId, own.supplyId), 'NOT_FOUND');
    expect(await snapshotUserRows(db, userId)).toEqual(before);

    await deleteSupply(db, intruderId, intruderHouse.supplyId);
    expect((await snapshotUserRows(db, intruderId)).supplies).toEqual([]);
  });
});

describe('reading houses and supplies for the pages', () => {
  it('lists houses by name with supplies by kind and label, archived last or left out', async () => {
    const { db, userId } = await setup();
    const { houseId: zebra } = await createHouse(db, userId, { name: 'Casa Zebra' });
    await createHouse(db, userId, { name: 'Casa Airone' });
    await createSupply(db, userId, { ...supplyInput(zebra), kind: 'gas', label: 'Gas' });
    const { supplyId: waterId } = await createSupply(db, userId, {
      ...supplyInput(zebra),
      kind: 'water',
      label: 'Acqua',
    });
    await createSupply(db, userId, supplyInput(zebra));
    await archiveSupply(db, userId, waterId, { archived: true, now: 1000 });
    const intruder = await createTestUser(db);
    await createHouseWithSupply(db, intruder.id);

    const all = await listHousesWithSupplies(db, userId, { includeArchived: true });
    const active = await listHousesWithSupplies(db, userId, { includeArchived: false });

    expect(all.map(({ house }) => house.name)).toEqual(['Casa Airone', 'Casa Zebra']);
    expect(all[1]?.supplies.map((supply) => supply.label)).toEqual(['Luce', 'Gas', 'Acqua']);
    expect(active[1]?.supplies.map((supply) => supply.label)).toEqual(['Luce', 'Gas']);
  });

  it('gives the own supply with its house and refuses the supply of someone else', async () => {
    const { db, userId } = await setup();
    const own = await createHouseWithSupply(db, userId);
    const intruder = await createTestUser(db);

    const detail = await getSupplyDetail(db, userId, own.supplyId);

    expect(detail.supply.id).toBe(own.supplyId);
    expect(detail.house.id).toBe(own.houseId);
    await expectDomainError(getSupplyDetail(db, intruder.id, own.supplyId), 'NOT_FOUND');
  });

  it('counts what deleting a house removes and refuses the house of someone else', async () => {
    const { db, userId } = await setup();
    const { houseId, supplyId } = await createHouseWithSupply(db, userId);
    await addBillsAndReadings(db, userId, supplyId);
    const { supplyId: cellarId } = await createSupply(db, userId, {
      ...supplyInput(houseId),
      label: 'Luce cantina',
    });
    await confirmBill(
      db,
      userId,
      billInput(cellarId, {
        readings: [{ readOn: '2026-09-30', register: 'single', value: 500, source: 'bill_actual' }],
      }),
      MANUAL,
    );
    const intruder = await createTestUser(db);

    expect(await getDeletionSummary(db, userId, { houseId })).toEqual({
      supplies: 2,
      bills: 3,
      readings: 4,
    });
    expect(await getDeletionSummary(db, userId, { supplyId: cellarId })).toEqual({
      supplies: 1,
      bills: 1,
      readings: 1,
    });
    await expectDomainError(getDeletionSummary(db, intruder.id, { houseId }), 'NOT_FOUND');
    await expectDomainError(
      getDeletionSummary(db, intruder.id, { supplyId: cellarId }),
      'NOT_FOUND',
    );
  });
});
