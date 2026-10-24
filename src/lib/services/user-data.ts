import type { Db } from '@/lib/db/create-db';

/**
 * Delete every row the app owns for a user, children before parents, in one batch.
 *
 * WARNING: every app table with a user_id joins this function in the same change that creates it
 * (the account-deletion test fails otherwise: local foreign keys are on and have no cascade).
 */
export async function deleteAllUserData(db: Db, userId: string): Promise<void> {
  void db;
  void userId; // No app tables yet: houses, supplies, bills and readings arrive with the data model.
}
