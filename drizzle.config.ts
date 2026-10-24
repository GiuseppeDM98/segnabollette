import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// dotenv never overrides variables already set; production migrations do not go through drizzle-kit
// but through `pnpm db:migrate:prod` (it reads .env.turso-prod).
config({ path: '.env.local' });

export default defineConfig({
  dialect: 'turso',
  schema: ['./src/lib/db/schema/auth.ts', './src/lib/db/schema/app.ts'],
  out: './drizzle',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
    // An empty line in .env.local arrives as '': libSQL wants the token absent, not empty.
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  },
});
