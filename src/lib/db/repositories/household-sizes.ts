import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/create-db';
import { householdSizes } from '@/lib/db/schema/app';
import type { IsoDate } from '@/lib/domain/types';

export type HouseholdSizeRow = typeof householdSizes.$inferSelect;

/** The household of a house, oldest change first. */
export async function listHouseholdSizes(
  db: Db,
  userId: string,
  houseId: string,
): Promise<HouseholdSizeRow[]> {
  return db
    .select()
    .from(householdSizes)
    .where(and(eq(householdSizes.userId, userId), eq(householdSizes.houseId, houseId)))
    .orderBy(asc(householdSizes.validFrom));
}

export async function getHouseholdSize(
  db: Db,
  userId: string,
  householdSizeId: string,
): Promise<HouseholdSizeRow | null> {
  const [row] = await db
    .select()
    .from(householdSizes)
    .where(and(eq(householdSizes.userId, userId), eq(householdSizes.id, householdSizeId)));
  return row ?? null;
}

export function insertHouseholdSizeQuery(
  db: Db,
  userId: string,
  values: { id: string; houseId: string; validFrom: IsoDate; people: number },
) {
  return db.insert(householdSizes).values({ ...values, userId });
}

export function deleteHouseholdSizeQuery(db: Db, userId: string, householdSizeId: string) {
  return db
    .delete(householdSizes)
    .where(and(eq(householdSizes.userId, userId), eq(householdSizes.id, householdSizeId)));
}

export function deleteHouseholdSizesOfHouseQuery(db: Db, userId: string, houseId: string) {
  return db
    .delete(householdSizes)
    .where(and(eq(householdSizes.userId, userId), eq(householdSizes.houseId, houseId)));
}
