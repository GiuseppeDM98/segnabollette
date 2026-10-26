import { eq } from 'drizzle-orm';
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

/**
 * Delete every row the app owns for a user, children before parents, in one batch.
 *
 * WARNING: every app table with a user_id joins this function in the same change that creates it
 * (the account-deletion test fails otherwise: local foreign keys are on and have no cascade).
 */
export async function deleteAllUserData(db: Db, userId: string): Promise<void> {
  await db.batch([
    // Documents point at extractions and bills, extractions at bills and supplies: they go first.
    db.delete(documents).where(eq(documents.userId, userId)),
    db.delete(extractions).where(eq(extractions.userId, userId)),
    db.delete(meterReadings).where(eq(meterReadings.userId, userId)),
    db.delete(billLines).where(eq(billLines.userId, userId)),
    // A replaced bill points at its replacement: clear the links before deleting the bills.
    db.update(bills).set({ replacedByBillId: null }).where(eq(bills.userId, userId)),
    db.delete(bills).where(eq(bills.userId, userId)),
    db.delete(supplies).where(eq(supplies.userId, userId)),
    db.delete(houses).where(eq(houses.userId, userId)),
  ]);
}
