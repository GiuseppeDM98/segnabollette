/**
 * `pnpm db:seed`: the two seed users on the local development database, idempotently.
 *
 * Users are created through Better Auth itself (not by inserting rows) so that the password hash
 * and the credential account are exactly what a real signup writes. The seed never touches a
 * remote Turso database.
 */
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createAuth } from '@/lib/auth/create-auth';
import { createDb, type Db, prepareLocalDatabase } from '@/lib/db/create-db';
import { users } from '@/lib/db/schema/auth';
import { EnvSchema } from '@/lib/env-schema';
import { SEED_USERS } from './seed-data';

// The secret only signs the signup cookie, which the seed throws away; the scrypt password hash
// does not depend on it.
const SEED_AUTH_SECRET = 'seed-secret-seed-secret-seed-secret-seed-00';

export async function seedDatabase(db: Db): Promise<{ total: number; created: number }> {
  const auth = createAuth({
    db,
    secret: SEED_AUTH_SECRET,
    baseURL: 'http://localhost:3000',
    signupEnabled: true,
    rateLimitEnabled: false,
  });
  let created = 0;
  for (const seedUser of SEED_USERS) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedUser.email));
    if (existing) continue;
    await auth.api.signUpEmail({
      body: { name: seedUser.name, email: seedUser.email, password: seedUser.password },
    });
    created += 1;
  }
  return { total: SEED_USERS.length, created };
}

async function main(): Promise<void> {
  const env = EnvSchema.parse(process.env);
  if (!env.TURSO_DATABASE_URL.startsWith('file:')) {
    throw new Error(
      `seed: refusing ${env.TURSO_DATABASE_URL}: the seed writes only to a local file: database`,
    );
  }
  const { db, client } = createDb({ url: env.TURSO_DATABASE_URL });
  await prepareLocalDatabase(client, env.TURSO_DATABASE_URL);
  await migrate(db, { migrationsFolder: 'drizzle' });
  const { total, created } = await seedDatabase(db);
  console.log(`seed: ${total} utenti (${created} nuovi)`);
  client.close();
}

// Only when run directly: the Playwright global setup imports seedDatabase without running main.
// Why not `import.meta.url`: the project is CommonJS, Playwright transpiles to CommonJS but leaves
// `import.meta` in place, and Node 22 then loads the file as ESM ("exports is not defined").
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
