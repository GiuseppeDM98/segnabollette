import { describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema/auth';
import { createTestDb, createTestUser } from './create-test-db';

describe('createTestDb', () => {
  it('gives every call its own database', async () => {
    // Arrange
    const first = await createTestDb();
    const second = await createTestDb();

    // Act
    await createTestUser(first.db);

    // Assert
    expect(await first.db.select().from(users)).toHaveLength(1);
    expect(await second.db.select().from(users)).toHaveLength(0);
  });

  it('turns foreign keys on', async () => {
    const { client } = await createTestDb();

    const result = await client.execute('PRAGMA foreign_keys');

    expect(result.rows[0]?.[0]).toBe(1);
  });
});
