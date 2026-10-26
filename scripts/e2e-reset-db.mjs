/**
 * Rebuild the Playwright database from scratch with the committed migrations. Plain JavaScript
 * (no `@/` alias, no tsx) because it runs before the build, from the webServer command.
 */
import { rmSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

for (const file of ['e2e.db', 'e2e.db-wal', 'e2e.db-shm']) rmSync(file, { force: true });
// The fake Blob store goes too: no file outlives the rows that pointed at it.
rmSync('.e2e-blob', { recursive: true, force: true });

const client = createClient({ url: 'file:e2e.db' });
await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
client.close();
console.log('e2e-reset-db: e2e.db rebuilt, .e2e-blob emptied');
