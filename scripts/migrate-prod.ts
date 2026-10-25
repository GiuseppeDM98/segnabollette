/**
 * Apply the committed migrations to the production database named in .env.turso-prod.
 *
 * Why not `pnpm db:migrate`: drizzle-kit reads .env.local, and the production pair is never
 * exported into the shell.
 */
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDb } from '@/lib/db/create-db';
import { loadProductionTarget } from './production-target';

async function main(): Promise<void> {
  const target = loadProductionTarget();
  console.log(`Migrating ${new URL(target.url).host} …`);
  const { db, client } = createDb(target);
  await migrate(db, { migrationsFolder: 'drizzle' });
  client.close();
  console.log('Done.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
