/**
 * Builders and probes for the repository and service tests. Figures are invented and round.
 */
import { asc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import type { Db } from '@/lib/db/create-db';
import {
  billLines,
  bills,
  documents,
  extractions,
  houses,
  meterReadings,
  supplies,
} from '@/lib/db/schema/app';
import type { BillInput, BillLineInput } from '@/lib/domain/bill-input';
import type { IsoDate } from '@/lib/domain/types';
import { DomainError, type DomainErrorCode } from '@/lib/errors';
import { createHouse, createSupply, type SupplyInput } from '@/lib/services/houses-supplies';

export function commodityLine(overrides: Partial<BillLineInput> = {}): BillLineInput {
  return {
    description: 'Energia',
    category: 'commodity',
    component: 'variable',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    quantity: 200,
    quantityUnit: 'kWh',
    unitPriceMicros: 100_000,
    amountCents: 2000,
    band: null,
    isRecalculation: false,
    isEstimated: false,
    vatRateBp: null,
    ...overrides,
  };
}

/** A one-line electricity bill for September 2026, or for `period`. */
export function billInput(
  supplyId: string,
  overrides: Partial<BillInput> = {},
  period: { periodStart: IsoDate; periodEnd: IsoDate } = {
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
  },
): BillInput {
  return {
    supplyId,
    ...period,
    issueDate: null,
    dueDate: null,
    supplierName: 'Fenicottero Energia',
    offerName: null,
    totalCents: 2000,
    amountDueCents: 2000,
    conversionFactor: null,
    calorificValueGj: null,
    isEstimated: false,
    lines: [commodityLine(period)],
    readings: [],
    overlapDecision: null,
    ...overrides,
  };
}

/** A house with one supply (electricity unless `supply` says otherwise). */
export async function createHouseWithSupply(
  db: Db,
  userId: string,
  supply: Partial<Omit<SupplyInput, 'houseId'>> = {},
): Promise<{ houseId: string; supplyId: string }> {
  const { houseId } = await createHouse(db, userId, { name: 'Casa Pellicano' });
  const { supplyId } = await createSupply(db, userId, {
    houseId,
    kind: 'electricity',
    label: 'Luce',
    supplierName: null,
    identifier: null,
    hasPhotovoltaic: false,
    ...supply,
  });
  return { houseId, supplyId };
}

/** Every app row of a user, in a stable order: compared before and after an intrusion attempt. */
export async function snapshotUserRows(db: Db, userId: string) {
  return {
    houses: await db.select().from(houses).where(eq(houses.userId, userId)).orderBy(asc(houses.id)),
    supplies: await db
      .select()
      .from(supplies)
      .where(eq(supplies.userId, userId))
      .orderBy(asc(supplies.id)),
    bills: await db.select().from(bills).where(eq(bills.userId, userId)).orderBy(asc(bills.id)),
    billLines: await db
      .select()
      .from(billLines)
      .where(eq(billLines.userId, userId))
      .orderBy(asc(billLines.id)),
    meterReadings: await db
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.userId, userId))
      .orderBy(asc(meterReadings.id)),
    extractions: await db
      .select()
      .from(extractions)
      .where(eq(extractions.userId, userId))
      .orderBy(asc(extractions.id)),
    documents: await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(asc(documents.id)),
  };
}

/** Await a rejection and check it is a DomainError with that code; returns it for more checks. */
export async function expectDomainError(
  promise: Promise<unknown>,
  code: DomainErrorCode,
): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}
