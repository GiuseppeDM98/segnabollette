import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db/create-db';
import { houses } from '@/lib/db/schema/app';

export type HouseRow = typeof houses.$inferSelect;

export async function listHouses(db: Db, userId: string): Promise<HouseRow[]> {
  return db.select().from(houses).where(eq(houses.userId, userId)).orderBy(asc(houses.createdAt));
}

export async function getHouse(db: Db, userId: string, houseId: string): Promise<HouseRow | null> {
  const [row] = await db
    .select()
    .from(houses)
    .where(and(eq(houses.userId, userId), eq(houses.id, houseId)));
  return row ?? null;
}

export function insertHouseQuery(db: Db, userId: string, values: { id: string; name: string }) {
  return db.insert(houses).values({ ...values, userId });
}

export function renameHouseQuery(db: Db, userId: string, houseId: string, name: string) {
  return db
    .update(houses)
    .set({ name })
    .where(and(eq(houses.userId, userId), eq(houses.id, houseId)));
}

export function deleteHouseQuery(db: Db, userId: string, houseId: string) {
  return db.delete(houses).where(and(eq(houses.userId, userId), eq(houses.id, houseId)));
}
