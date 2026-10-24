import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/lib/db/create-db';
import { meterReadings } from '@/lib/db/schema/app';
import type { EngineReading } from '@/lib/engine/types';

export type ReadingRow = typeof meterReadings.$inferSelect;
export type ReadingInsert = Omit<typeof meterReadings.$inferInsert, 'userId' | 'createdAt'>;

/** Latest reading day first, then the latest entered. */
export async function listReadings(
  db: Db,
  userId: string,
  options: { supplyId?: string; limit: number },
): Promise<ReadingRow[]> {
  return db
    .select()
    .from(meterReadings)
    .where(
      and(
        eq(meterReadings.userId, userId),
        options.supplyId === undefined ? undefined : eq(meterReadings.supplyId, options.supplyId),
      ),
    )
    .orderBy(desc(meterReadings.readOn), desc(meterReadings.createdAt))
    .limit(options.limit);
}

/** The readings printed on one bill, by day and then register. */
export async function listBillReadings(
  db: Db,
  userId: string,
  billId: string,
): Promise<ReadingRow[]> {
  return db
    .select()
    .from(meterReadings)
    .where(and(eq(meterReadings.userId, userId), eq(meterReadings.billId, billId)))
    .orderBy(asc(meterReadings.readOn), asc(meterReadings.register));
}

/** Every reading of the supply, of bills in any status and self readings: the engine filters. */
export async function listEngineReadings(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<EngineReading[]> {
  return db
    .select({
      readOn: meterReadings.readOn,
      register: meterReadings.register,
      value: meterReadings.value,
      source: meterReadings.source,
      billId: meterReadings.billId,
      createdAt: meterReadings.createdAt,
    })
    .from(meterReadings)
    .where(and(eq(meterReadings.userId, userId), eq(meterReadings.supplyId, supplyId)))
    .orderBy(asc(meterReadings.readOn));
}

export function insertReadingsQuery(db: Db, userId: string, rows: ReadingInsert[]) {
  return db.insert(meterReadings).values(rows.map((row) => ({ ...row, userId })));
}

export function deleteReadingsOfBillsQuery(db: Db, userId: string, billIds: string[]) {
  return db
    .delete(meterReadings)
    .where(and(eq(meterReadings.userId, userId), inArray(meterReadings.billId, billIds)));
}

export function deleteReadingsOfSuppliesQuery(db: Db, userId: string, supplyIds: string[]) {
  return db
    .delete(meterReadings)
    .where(and(eq(meterReadings.userId, userId), inArray(meterReadings.supplyId, supplyIds)));
}

export async function getReading(
  db: Db,
  userId: string,
  readingId: string,
): Promise<ReadingRow | null> {
  const [row] = await db
    .select()
    .from(meterReadings)
    .where(and(eq(meterReadings.userId, userId), eq(meterReadings.id, readingId)));
  return row ?? null;
}

export function deleteReadingQuery(db: Db, userId: string, readingId: string) {
  return db
    .delete(meterReadings)
    .where(and(eq(meterReadings.userId, userId), eq(meterReadings.id, readingId)));
}
