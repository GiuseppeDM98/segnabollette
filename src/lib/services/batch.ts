import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '@/lib/db/create-db';

/**
 * Run the queries as one db.batch (an implicit transaction: all or nothing). Services build the
 * list conditionally and omit queries on empty id lists, so the list itself may end up empty:
 * then nothing runs, because db.batch([]) is not a valid call.
 */
export async function runBatch(db: Db, queries: BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = queries;
  if (!first) return;
  await db.batch([first, ...rest]);
}
