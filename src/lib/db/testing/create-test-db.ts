/**
 * A fresh, isolated database per call with the committed migrations applied.
 *
 * Why a temp file and not ':memory:': an anonymous libSQL memory database is silently recreated
 * empty after a transaction callback throws, and 'file::memory:?cache=shared' shares one database
 * across all clients (both verified in segnaprezzi with @libsql/client 0.17). Foreign keys are on,
 * without cascade on the app tables, so a forgotten child delete fails here.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { nanoid } from 'nanoid';
import { createDb, type Db, prepareLocalDatabase } from '@/lib/db/create-db';
import { users } from '@/lib/db/schema/auth';

let root: string | undefined;

function testDbRoot(): string {
  if (!root) {
    root = mkdtempSync(join(tmpdir(), 'segnabollette-test-db-'));
    process.on('exit', () => {
      if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
    });
  }
  return root;
}

export async function createTestDb(): Promise<{ db: Db; client: Client }> {
  const url = `file:${join(testDbRoot(), `${randomUUID()}.db`)}`;
  const { db, client } = createDb({ url });
  await prepareLocalDatabase(client, url);
  await migrate(db, { migrationsFolder: 'drizzle' });
  return { db, client };
}

export async function createTestUser(
  db: Db,
  overrides?: Partial<typeof users.$inferInsert>,
): Promise<{ id: string }> {
  const id = overrides?.id ?? nanoid();
  const [row] = await db
    .insert(users)
    .values({ id, name: 'Utente di prova', email: `${id}@example.test`, ...overrides })
    .returning({ id: users.id });
  if (!row) throw new Error('createTestUser: insert returned no row');
  return row;
}
