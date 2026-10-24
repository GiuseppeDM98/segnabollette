/**
 * `pnpm db:seed`: the two seed users on the local development database, with their invented
 * houses, supplies, bills and self readings, idempotently.
 *
 * Users are created through Better Auth itself (not by inserting rows) so that the password hash
 * and the credential account are exactly what a real signup writes; their data goes through the
 * same services the app uses, so a seed bill passes every check a typed bill passes. The data is
 * added only to a seed user without houses. The seed never touches a remote Turso database.
 */
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createAuth } from '@/lib/auth/create-auth';
import { createDb, type Db, prepareLocalDatabase } from '@/lib/db/create-db';
import { listHouses } from '@/lib/db/repositories/houses';
import { users } from '@/lib/db/schema/auth';
import type { BillInput } from '@/lib/domain/bill-input';
import {
  addDays,
  daysBetween,
  monthKeyOf,
  monthRange,
  romeToday,
  shiftMonth,
} from '@/lib/domain/dates';
import type { IsoDate, MonthKey } from '@/lib/domain/types';
import { EnvSchema } from '@/lib/env-schema';
import { confirmBill } from '@/lib/services/bills';
import { createHouse, createSupply, type SupplyInput } from '@/lib/services/houses-supplies';
import { createSelfReadings } from '@/lib/services/readings';
import { buildSeedBills, SEED_SUPPLIERS, SEED_USERS } from './seed-data';

// The secret only signs the signup cookie, which the seed throws away; the scrypt password hash
// does not depend on it.
const SEED_AUTH_SECRET = 'seed-secret-seed-secret-seed-secret-seed-00';
/** Daily growth of F1/F2/F3 in the self readings after the last seed bill. */
const SELF_READING_DAILY_KWH = { F1: 4, F2: 3, F3: 3 } as const;

interface SeedCounts {
  houses: number;
  supplies: number;
  bills: number;
  /** Counted by day: one day with F1, F2 and F3 is one self reading. */
  selfReadings: number;
}

export async function seedDatabase(
  db: Db,
): Promise<{ total: number; created: number } & SeedCounts> {
  const auth = createAuth({
    db,
    secret: SEED_AUTH_SECRET,
    baseURL: 'http://localhost:3000',
    signupEnabled: true,
    rateLimitEnabled: false,
  });
  // Scripts may read the clock; the pure modules take the day as a parameter.
  const today = romeToday(Date.now());
  const counts: SeedCounts = { houses: 0, supplies: 0, bills: 0, selfReadings: 0 };
  let created = 0;
  for (const seedUser of SEED_USERS) {
    let [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedUser.email));
    if (!existing) {
      await auth.api.signUpEmail({
        body: { name: seedUser.name, email: seedUser.email, password: seedUser.password },
      });
      created += 1;
      [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, seedUser.email));
    }
    if (!existing) throw new Error(`seed: ${seedUser.email} was not created`);
    if ((await listHouses(db, existing.id)).length > 0) continue;
    const added =
      seedUser.key === 'a'
        ? await seedUserA(db, existing.id, today)
        : await seedUserB(db, existing.id, today);
    counts.houses += added.houses;
    counts.supplies += added.supplies;
    counts.bills += added.bills;
    counts.selfReadings += added.selfReadings;
  }
  return { total: SEED_USERS.length, created, ...counts };
}

async function addSupplyWithBills(
  db: Db,
  userId: string,
  supply: Omit<SupplyInput, 'supplierName' | 'hasPhotovoltaic'> & {
    kind: keyof typeof SEED_SUPPLIERS;
  },
  months: MonthKey[],
): Promise<{ supplyId: string; bills: BillInput[] }> {
  const { supplyId } = await createSupply(db, userId, {
    ...supply,
    supplierName: SEED_SUPPLIERS[supply.kind],
    hasPhotovoltaic: false,
  });
  const bills = buildSeedBills(supply.kind, supplyId, months);
  for (const input of bills) await confirmBill(db, userId, input, { source: 'manual' });
  return { supplyId, bills };
}

/** «Casa Fenicottero»: electricity, gas and internet for 14 months, water for 15, two self readings. */
async function seedUserA(db: Db, userId: string, today: IsoDate): Promise<SeedCounts> {
  const currentMonth = monthKeyOf(today);
  const monthly = monthRange(shiftMonth(currentMonth, -14), shiftMonth(currentMonth, -1));
  const quarterly = monthRange(shiftMonth(currentMonth, -15), shiftMonth(currentMonth, -1));
  const { houseId } = await createHouse(db, userId, { name: 'Casa Fenicottero' });

  const electricity = await addSupplyWithBills(
    db,
    userId,
    { houseId, kind: 'electricity', label: 'Luce', identifier: 'IT001E00000001' },
    monthly,
  );
  const gas = await addSupplyWithBills(
    db,
    userId,
    { houseId, kind: 'gas', label: 'Gas', identifier: '00000000000001' },
    monthly,
  );
  const water = await addSupplyWithBills(
    db,
    userId,
    { houseId, kind: 'water', label: 'Acqua', identifier: null },
    quarterly,
  );
  const internet = await addSupplyWithBills(
    db,
    userId,
    { houseId, kind: 'telecom', label: 'Internet', identifier: null },
    monthly,
  );

  // Self readings after the last electricity bill: halfway to today, and today. Seeded on the
  // first of the month the two days coincide and only one is written.
  const lastBill = electricity.bills[electricity.bills.length - 1];
  if (!lastBill) throw new Error('seed: no electricity bills');
  const lastDay = lastBill.periodEnd;
  const halfway = addDays(lastDay, Math.max(1, Math.floor(daysBetween(lastDay, today) / 2)));
  const days = halfway === today ? [today] : [halfway, today];
  for (const readOn of days) {
    const elapsed = daysBetween(lastDay, readOn);
    const values = (['F1', 'F2', 'F3'] as const).map((register) => {
      const billed = lastBill.readings.find((r) => r.readOn === lastDay && r.register === register);
      if (!billed) throw new Error(`seed: the last electricity bill has no ${register} reading`);
      return { register, value: billed.value + elapsed * SELF_READING_DAILY_KWH[register] };
    });
    await createSelfReadings(
      db,
      userId,
      { supplyId: electricity.supplyId, readOn, values },
      { today },
    );
  }

  return {
    houses: 1,
    supplies: 4,
    bills: electricity.bills.length + gas.bills.length + water.bills.length + internet.bills.length,
    selfReadings: days.length,
  };
}

/** «Casa Ornitorinco»: one electricity supply, an estimated bill and the one that recalculates it. */
async function seedUserB(db: Db, userId: string, today: IsoDate): Promise<SeedCounts> {
  const currentMonth = monthKeyOf(today);
  const { houseId } = await createHouse(db, userId, { name: 'Casa Ornitorinco' });
  const electricity = await addSupplyWithBills(
    db,
    userId,
    { houseId, kind: 'electricity', label: 'Luce', identifier: 'IT001E00000002' },
    [shiftMonth(currentMonth, -2), shiftMonth(currentMonth, -1)],
  );
  return { houses: 1, supplies: 1, bills: electricity.bills.length, selfReadings: 0 };
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
  const result = await seedDatabase(db);
  console.log(
    `seed: ${result.total} utenti (${result.created} nuovi), ${result.houses} case nuove, ` +
      `${result.supplies} forniture nuove, ${result.bills} bollette nuove, ` +
      `${result.selfReadings} autoletture nuove`,
  );
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
