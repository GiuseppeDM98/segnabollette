/**
 * Drizzle over libSQL. Shared by the server singleton, the CLI scripts and the tests.
 *
 * Foreign keys: enforcement is per connection, it is OFF on remote Turso, and a PRAGMA does not
 * survive between HTTP requests to it. The app therefore never relies on ON DELETE CASCADE for its
 * own tables (services delete children explicitly), and local file databases keep enforcement ON
 * so that a forgotten child delete fails in development and in tests instead of leaving orphans in
 * production.
 *
 * Connections: since @libsql/client 0.18 the local driver keeps a pool of up to 20 connections per
 * client and `execute` waits for one, so a per-connection PRAGMA reaches only the connection that
 * happened to run it. The busy timeout therefore goes through the driver's `timeout` option, which
 * it applies to every connection it opens; every new local connection already starts with foreign
 * keys ON (measured on 0.18.0); journal_mode = WAL is stored in the database file itself.
 */
import { type Client, createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

/** Parallel Playwright workers and the two E2E servers wait this long instead of SQLITE_BUSY. */
const LOCAL_BUSY_TIMEOUT_MS = 5000;

export function createDb(options: { url: string; authToken?: string }) {
  const client = createClient({
    url: options.url,
    authToken: options.authToken,
    timeout: options.url.startsWith('file:') ? LOCAL_BUSY_TIMEOUT_MS : undefined,
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>['db'];

/** Switch a local file database to WAL and make sure foreign keys are on. */
export async function prepareLocalDatabase(client: Client, url: string): Promise<void> {
  if (!url.startsWith('file:')) return;
  // Why: the rollback journal serializes readers and writers so tightly that parallel Playwright
  // workers get SQLITE_BUSY; WAL lets readers and a writer proceed together. It is a property of
  // the file, so one connection is enough.
  await client.execute('PRAGMA journal_mode = WAL');
  // Pooled connections already open with foreign keys on (the driver's default since 0.18.0); this
  // PRAGMA reaches only the one connection that runs it, so it is not what keeps the others on.
  // The guard is create-db.test.ts, which reads the setting on several connections at once and
  // goes red if a driver upgrade ever opens them with foreign keys off.
  await client.execute('PRAGMA foreign_keys = ON');
}
