/**
 * The server-side Drizzle singleton, cached on globalThis so that dev HMR does not leak a libSQL
 * connection per reload.
 */
import 'server-only';
import type { Client } from '@libsql/client';
import { env } from '@/lib/env';
import { createDb, type Db, prepareLocalDatabase } from './create-db';

const globalForDb = globalThis as unknown as { segnabolletteDb?: { db: Db; client: Client } };

function initDb() {
  const created = createDb({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  // Not awaited, and nothing depends on it finishing first: the busy timeout and foreign keys hold
  // on every pooled connection from the start (create-db.ts), and WAL only changes how concurrent
  // writers share the file. Top-level await would break tsx scripts.
  void prepareLocalDatabase(created.client, env.TURSO_DATABASE_URL);
  return created;
}

const instance = globalForDb.segnabolletteDb ?? initDb();
if (process.env.NODE_ENV !== 'production') globalForDb.segnabolletteDb = instance;

export const db = instance.db;
export type { Db } from './create-db';
