import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/create-db';
import { billLines, bills, meterReadings } from '@/lib/db/schema/app';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import {
  billInput,
  commodityLine,
  createHouseWithSupply,
  expectDomainError,
  snapshotUserRows,
} from '@/lib/db/testing/fixtures';
import { confirmBill, deleteBill, getBillDetail, listBills } from './bills';

const MANUAL = { source: 'manual' } as const;
const SEPTEMBER = { periodStart: '2026-09-01', periodEnd: '2026-09-30' };
const OCTOBER = { periodStart: '2026-10-01', periodEnd: '2026-10-31' };
const SEPTEMBER_TO_OCTOBER = { periodStart: '2026-09-01', periodEnd: '2026-10-31' };

async function setup() {
  const { db } = await createTestDb();
  const user = await createTestUser(db);
  const { supplyId } = await createHouseWithSupply(db, user.id);
  return { db, userId: user.id, supplyId };
}

async function billRow(db: Db, billId: string) {
  const [row] = await db.select().from(bills).where(eq(bills.id, billId));
  return row;
}

describe('confirmBill', () => {
  it('saves the bill with its lines and readings', async () => {
    // Arrange
    const { db, userId, supplyId } = await setup();
    const input = billInput(supplyId, {
      readings: [
        { readOn: '2026-08-31', register: 'single', value: 1000, source: 'bill_actual' },
        { readOn: '2026-09-30', register: 'single', value: 1200, source: 'bill_actual' },
      ],
    });

    // Act
    const { billId, replacedBillIds } = await confirmBill(db, userId, input, MANUAL);

    // Assert
    expect(replacedBillIds).toEqual([]);
    expect(await billRow(db, billId)).toMatchObject({ status: 'confirmed', source: 'manual' });
    expect(await db.select().from(billLines).where(eq(billLines.billId, billId))).toHaveLength(1);
    expect(
      await db.select().from(meterReadings).where(eq(meterReadings.billId, billId)),
    ).toHaveLength(2);
  });

  it('refuses an invalid input with only sentences in the details', async () => {
    const { db, userId, supplyId } = await setup();

    const error = await expectDomainError(
      confirmBill(
        db,
        userId,
        { ...billInput(supplyId), periodEnd: '2026-08-31', lines: [] },
        MANUAL,
      ),
      'VALIDATION',
    );

    expect(Array.isArray(error.details)).toBe(true);
    expect((error.details as unknown[]).length).toBeGreaterThan(0);
    expect((error.details as unknown[]).every((detail) => typeof detail === 'string')).toBe(true);
  });

  it('asks for a decision when the period overlaps a confirmed bill', async () => {
    const { db, userId, supplyId } = await setup();
    const { billId: oldId } = await confirmBill(db, userId, billInput(supplyId), MANUAL);

    const error = await expectDomainError(
      confirmBill(db, userId, billInput(supplyId), MANUAL),
      'OVERLAP_DECISION_REQUIRED',
    );

    expect(error.details).toEqual([{ id: oldId, ...SEPTEMBER }]);
  });

  it('marks the overlapping bill as replaced, and deleting the new one brings it back', async () => {
    // Arrange
    const { db, userId, supplyId } = await setup();
    const { billId: oldId } = await confirmBill(db, userId, billInput(supplyId), MANUAL);

    // Act
    const { billId: newId, replacedBillIds } = await confirmBill(
      db,
      userId,
      billInput(supplyId, { overlapDecision: 'replace' }),
      MANUAL,
    );

    // Assert
    expect(replacedBillIds).toEqual([oldId]);
    expect(await billRow(db, oldId)).toMatchObject({ status: 'replaced', replacedByBillId: newId });

    await deleteBill(db, userId, newId);
    expect(await billRow(db, oldId)).toMatchObject({ status: 'confirmed', replacedByBillId: null });
    expect(await billRow(db, newId)).toBeUndefined();
  });

  it('replaces the lines and readings of an edited bill', async () => {
    // Arrange
    const { db, userId, supplyId } = await setup();
    const { billId } = await confirmBill(
      db,
      userId,
      billInput(supplyId, {
        readings: [
          { readOn: '2026-09-30', register: 'single', value: 1200, source: 'bill_actual' },
        ],
      }),
      MANUAL,
    );
    const edited = billInput(supplyId, {
      totalCents: 3000,
      lines: [
        commodityLine({ quantity: 250, amountCents: 2500 }),
        commodityLine({
          description: 'Commercializzazione',
          category: 'sale',
          quantity: null,
          quantityUnit: null,
          unitPriceMicros: null,
          amountCents: 500,
        }),
      ],
      readings: [{ readOn: '2026-09-30', register: 'single', value: 1250, source: 'bill_actual' }],
    });

    // Act
    await confirmBill(db, userId, edited, { source: 'manual', billId });

    // Assert
    const detail = await getBillDetail(db, userId, billId);
    expect(detail.bill.totalCents).toBe(3000);
    expect(detail.lines.map((line) => [line.position, line.amountCents])).toEqual([
      [0, 2500],
      [1, 500],
    ]);
    expect(detail.readings.map((reading) => reading.value)).toEqual([1250]);
  });

  it('refuses on gas a register that only electricity has', async () => {
    const { db, userId } = await setup();
    const { supplyId } = await createHouseWithSupply(db, userId, { kind: 'gas', label: 'Gas' });
    const input = billInput(supplyId, {
      lines: [commodityLine({ quantityUnit: 'Smc' })],
      readings: [{ readOn: '2026-09-30', register: 'F1', value: 1000, source: 'bill_actual' }],
    });

    await expectDomainError(confirmBill(db, userId, input, MANUAL), 'VALIDATION');
  });

  it('refuses a band on a gas line', async () => {
    const { db, userId } = await setup();
    const { supplyId } = await createHouseWithSupply(db, userId, { kind: 'gas', label: 'Gas' });
    const input = billInput(supplyId, {
      lines: [commodityLine({ quantityUnit: 'Smc', band: 'F1' })],
    });

    const error = await expectDomainError(confirmBill(db, userId, input, MANUAL), 'VALIDATION');

    expect(error.details).toEqual(['La fascia vale solo per la luce.']);
  });

  it('refuses a consumption unit on a flat-fee supply', async () => {
    const { db, userId } = await setup();
    const { supplyId } = await createHouseWithSupply(db, userId, {
      kind: 'telecom',
      label: 'Internet',
    });

    await expectDomainError(confirmBill(db, userId, billInput(supplyId), MANUAL), 'VALIDATION');
  });
});

describe('bills — isolation between users', () => {
  async function twoUsers() {
    const owner = await setup();
    const intruder = await createTestUser(owner.db);
    const { supplyId: intruderSupplyId } = await createHouseWithSupply(owner.db, intruder.id);
    const { billId } = await confirmBill(owner.db, owner.userId, billInput(owner.supplyId), MANUAL);
    return { ...owner, billId, intruderId: intruder.id, intruderSupplyId };
  }

  it('confirms on the own supply and refuses the supply of someone else', async () => {
    const { db, userId, supplyId, intruderId } = await twoUsers();

    await expect(
      confirmBill(db, userId, billInput(supplyId, { overlapDecision: 'sum' }), MANUAL),
    ).resolves.toMatchObject({ replacedBillIds: [] });
    const before = await snapshotUserRows(db, userId);
    await expectDomainError(confirmBill(db, intruderId, billInput(supplyId), MANUAL), 'NOT_FOUND');

    expect(await snapshotUserRows(db, userId)).toEqual(before);
    expect(await snapshotUserRows(db, intruderId)).toMatchObject({ bills: [] });
  });

  it('edits the own bill and refuses to edit the bill of someone else', async () => {
    const { db, userId, supplyId, billId, intruderId, intruderSupplyId } = await twoUsers();

    await expect(
      confirmBill(db, userId, billInput(supplyId, { totalCents: 2100 }), { ...MANUAL, billId }),
    ).resolves.toMatchObject({ billId });
    const before = await snapshotUserRows(db, userId);
    await expectDomainError(
      confirmBill(db, intruderId, billInput(intruderSupplyId), { ...MANUAL, billId }),
      'NOT_FOUND',
    );

    expect(await snapshotUserRows(db, userId)).toEqual(before);
  });

  it('reads the own bill and refuses the bill of someone else', async () => {
    const { db, userId, billId, intruderId } = await twoUsers();

    await expect(getBillDetail(db, userId, billId)).resolves.toMatchObject({
      bill: { id: billId },
    });
    await expectDomainError(getBillDetail(db, intruderId, billId), 'NOT_FOUND');
  });

  it('refuses to delete the bill of someone else and deletes the own one', async () => {
    const { db, userId, billId, intruderId } = await twoUsers();
    const before = await snapshotUserRows(db, userId);

    await expectDomainError(deleteBill(db, intruderId, billId), 'NOT_FOUND');
    expect(await snapshotUserRows(db, userId)).toEqual(before);

    await expect(deleteBill(db, userId, billId)).resolves.toEqual({ documentPathnames: [] });
    expect(await billRow(db, billId)).toBeUndefined();
  });

  it('lists nothing for the supply of someone else', async () => {
    const { db, userId, supplyId, intruderId } = await twoUsers();

    expect((await listBills(db, userId, { supplyId, page: 1 })).bills).toHaveLength(1);
    expect(await listBills(db, intruderId, { supplyId, page: 1 })).toEqual({
      bills: [],
      hasNextPage: false,
    });
  });
});

describe('bills — replaced bills', () => {
  it('refuses to edit a replaced bill and leaves both bills as they were', async () => {
    // Arrange
    const { db, userId, supplyId } = await setup();
    const { billId: y } = await confirmBill(db, userId, billInput(supplyId), MANUAL);
    const { billId: x } = await confirmBill(
      db,
      userId,
      billInput(supplyId, { overlapDecision: 'replace' }),
      MANUAL,
    );

    // Act
    const error = await expectDomainError(
      confirmBill(db, userId, billInput(supplyId, { overlapDecision: 'replace' }), {
        ...MANUAL,
        billId: y,
      }),
      'VALIDATION',
    );

    // Assert
    expect(error.details).toEqual([
      'Una bolletta sostituita non si modifica: elimina quella che la sostituisce, oppure eliminala.',
    ]);
    expect(await billRow(db, x)).toMatchObject({ status: 'confirmed' });
    expect(await billRow(db, y)).toMatchObject({ status: 'replaced', replacedByBillId: x });
  });

  it('hands the bills a deleted replaced bill had replaced over to its replacement', async () => {
    // Arrange: A replaced by B, B replaced by C
    const { db, userId, supplyId } = await setup();
    const replace = billInput(supplyId, { overlapDecision: 'replace' });
    const { billId: a } = await confirmBill(db, userId, billInput(supplyId), MANUAL);
    const { billId: b } = await confirmBill(db, userId, replace, MANUAL);
    const { billId: c } = await confirmBill(db, userId, replace, MANUAL);

    // Act
    await deleteBill(db, userId, b);

    // Assert
    expect(await billRow(db, a)).toMatchObject({ status: 'replaced', replacedByBillId: c });
    expect(await billRow(db, c)).toMatchObject({ status: 'confirmed' });
  });

  it('brings back the replaced bills an edited bill no longer overlaps', async () => {
    // Arrange: X over September and October replaces A (September) and B (October)
    const { db, userId, supplyId } = await setup();
    const { billId: a } = await confirmBill(db, userId, billInput(supplyId, {}, SEPTEMBER), MANUAL);
    const { billId: b } = await confirmBill(db, userId, billInput(supplyId, {}, OCTOBER), MANUAL);
    const { billId: x } = await confirmBill(
      db,
      userId,
      billInput(supplyId, { overlapDecision: 'replace' }, SEPTEMBER_TO_OCTOBER),
      MANUAL,
    );

    // Act: X shrinks to October
    await confirmBill(db, userId, billInput(supplyId, {}, OCTOBER), { ...MANUAL, billId: x });

    // Assert
    expect(await billRow(db, a)).toMatchObject({ status: 'confirmed', replacedByBillId: null });
    expect(await billRow(db, b)).toMatchObject({ status: 'replaced', replacedByBillId: x });
  });

  it('keeps the source a bill was born with when it is edited', async () => {
    const { db, userId, supplyId } = await setup();
    const { billId } = await confirmBill(db, userId, billInput(supplyId), { source: 'extraction' });

    await confirmBill(db, userId, billInput(supplyId), { source: 'manual', billId });

    expect(await billRow(db, billId)).toMatchObject({ source: 'extraction' });
  });
});
