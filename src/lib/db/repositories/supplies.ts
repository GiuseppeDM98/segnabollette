import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/lib/db/create-db';
import { supplies } from '@/lib/db/schema/app';

export type SupplyRow = typeof supplies.$inferSelect;
export type SupplyInsert = Omit<typeof supplies.$inferInsert, 'userId' | 'createdAt' | 'updatedAt'>;
export type SupplyPatch = Partial<
  Pick<
    SupplyRow,
    'houseId' | 'label' | 'supplierName' | 'identifier' | 'hasPhotovoltaic' | 'archivedAt'
  >
>;

/** The user's supplies, oldest first; archived ones only with includeArchived. */
export async function listSupplies(
  db: Db,
  userId: string,
  options: { houseId?: string; includeArchived?: boolean },
): Promise<SupplyRow[]> {
  return db
    .select()
    .from(supplies)
    .where(
      and(
        eq(supplies.userId, userId),
        options.houseId === undefined ? undefined : eq(supplies.houseId, options.houseId),
        options.includeArchived ? undefined : isNull(supplies.archivedAt),
      ),
    )
    .orderBy(asc(supplies.createdAt));
}

export async function getSupply(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<SupplyRow | null> {
  const [row] = await db
    .select()
    .from(supplies)
    .where(and(eq(supplies.userId, userId), eq(supplies.id, supplyId)));
  return row ?? null;
}

/** `identifier` is already normalized by the caller. */
export async function getSupplyByIdentifier(
  db: Db,
  userId: string,
  identifier: string,
): Promise<SupplyRow | null> {
  const [row] = await db
    .select()
    .from(supplies)
    .where(and(eq(supplies.userId, userId), eq(supplies.identifier, identifier)));
  return row ?? null;
}

export function insertSupplyQuery(db: Db, userId: string, values: SupplyInsert) {
  return db.insert(supplies).values({ ...values, userId });
}

export function updateSupplyQuery(db: Db, userId: string, supplyId: string, patch: SupplyPatch) {
  return db
    .update(supplies)
    .set(patch)
    .where(and(eq(supplies.userId, userId), eq(supplies.id, supplyId)));
}

export function deleteSuppliesQuery(db: Db, userId: string, supplyIds: string[]) {
  return db
    .delete(supplies)
    .where(and(eq(supplies.userId, userId), inArray(supplies.id, supplyIds)));
}
