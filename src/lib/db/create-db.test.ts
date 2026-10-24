import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb, prepareLocalDatabase } from './create-db';

const root = mkdtempSync(join(tmpdir(), 'segnabollette-create-db-'));
const openClients: Client[] = [];
// More statements in flight than one connection serves, so the pool opens several.
const PARALLEL_READS = 4;

afterAll(() => {
  for (const client of openClients) client.close();
  try {
    rmSync(root, { recursive: true, force: true });
  } catch (error) {
    // Why not a failure: on Windows the native libSQL handle keeps the file locked (EBUSY) until
    // the worker exits, close() notwithstanding; the folder is a temp folder the OS reclaims.
    console.warn(`create-db.test: temp folder left behind (${String(error)})`);
  }
});

/** One PRAGMA read on several pooled connections at once, as numbers or strings. */
async function readOnEveryConnection(client: Client, pragma: string): Promise<unknown[]> {
  const results = await Promise.all(
    Array.from({ length: PARALLEL_READS }, () => client.execute(`PRAGMA ${pragma}`)),
  );
  return results.map((result) => {
    const value = result.rows[0]?.[0];
    return typeof value === 'bigint' ? Number(value) : value;
  });
}

describe('createDb and prepareLocalDatabase', () => {
  it('give every local connection foreign keys, the busy timeout and WAL', async () => {
    // Arrange
    const url = `file:${join(root, 'local.db')}`;
    const { client } = createDb({ url });
    openClients.push(client);

    // Act
    await prepareLocalDatabase(client, url);

    // Assert
    expect(await readOnEveryConnection(client, 'foreign_keys')).toEqual([1, 1, 1, 1]);
    expect(await readOnEveryConnection(client, 'busy_timeout')).toEqual([5000, 5000, 5000, 5000]);
    expect(await readOnEveryConnection(client, 'journal_mode')).toEqual([
      'wal',
      'wal',
      'wal',
      'wal',
    ]);
  });

  it('runs nothing on a remote database', async () => {
    const executed: string[] = [];
    const recordingClient = {
      execute: async (statement: string) => {
        executed.push(statement);
      },
    } as unknown as Client;

    await prepareLocalDatabase(recordingClient, 'libsql://x');

    expect(executed).toEqual([]);
  });
});
