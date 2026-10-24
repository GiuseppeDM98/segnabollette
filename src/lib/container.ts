import 'server-only';
import { db } from '@/lib/db/client';
import type { Db } from '@/lib/db/create-db';

/** The app reaches its services only through here; Playwright swaps the external ones for fakes. */
export function getDb(): Db {
  return db;
}
