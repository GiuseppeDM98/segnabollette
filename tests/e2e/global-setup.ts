/**
 * Runs once the servers answer: seeds the two read-only users into e2e.db and saves a signed-in
 * storage state for each, so tests that only read start already authenticated.
 */
import { request } from '@playwright/test';
import { seedDatabase } from '../../scripts/seed';
import { SEED_USERS } from '../../scripts/seed-data';
import { createDb, prepareLocalDatabase } from '../../src/lib/db/create-db';

const OPEN = 'http://localhost:3100';
const E2E_DB_URL = 'file:e2e.db';

export default async function globalSetup(): Promise<void> {
  const { db, client } = createDb({ url: E2E_DB_URL });
  await prepareLocalDatabase(client, E2E_DB_URL);
  await seedDatabase(db);
  client.close();

  for (const seedUser of SEED_USERS) {
    // Better Auth checks the Origin of every POST: a Node request without it is refused.
    const context = await request.newContext({
      baseURL: OPEN,
      extraHTTPHeaders: { Origin: OPEN },
    });
    const response = await context.post('/api/auth/sign-in/email', {
      data: { email: seedUser.email, password: seedUser.password },
    });
    if (!response.ok()) {
      throw new Error(
        `global-setup: sign-in of ${seedUser.email} failed with ${response.status()}: ${await response.text()}`,
      );
    }
    await context.storageState({ path: `playwright/.auth/seed-${seedUser.key}.json` });
    await context.dispose();
  }
}
