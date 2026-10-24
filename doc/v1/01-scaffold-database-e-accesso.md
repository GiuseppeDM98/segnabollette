# 01 — Scaffold, database e accesso

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/01-scaffold-auth` da `main`. **Dipende da**: niente (è la prima).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-1, D-4, D-12, D-37, D-38, D-40; scelte T-1,
> T-3, T-4, T-5, T-6, T-8, T-14, T-15, T-16, T-17; contratti C-1, C-2 (parte auth), C-3, C-4, C-5,
> C-18 (`getDb`), C-21 (utenti) — li crea.

## 1. Il problema oggi (prove)

1. Il repo contiene solo documenti (CLAUDE.md, AGENTS.md, WORKFLOW.md, COMMENTS.md,
   DEVELOPMENT_GUIDELINES.md, README.md, LICENSE) e la serie `doc/v1/`. Non c'è `package.json`,
   non c'è codice.
2. L'app è multi-utente con registrazione chiudibile (D-4): Better Auth 1.7.12, email + password
   (`emailAndPassword.disableSignUp`, password 8–128, scrypt; https://www.better-auth.com/docs/reference/options,
   letta 2026-10-24). `BETTER_AUTH_SECRET` assente in produzione → eccezione; `BETTER_AUTH_URL` va
   impostato per ambiente. Il rate limit è attivo solo in produzione e, di default, **in memoria
   per istanza** (https://www.better-auth.com/docs/concepts/rate-limit, letta 2026-10-24): su
   Vercel Fluid ogni istanza ha il suo contatore → `storage: 'database'` (T-15).
3. La CLI che genera lo schema di Better Auth è rimasta indietro rispetto al core: segnaprezzi
   (AGENTS § 4.16, schema in `src/lib/db/schema/auth.ts`) ha dovuto aggiungere a mano la colonna
   `issuer` su `accounts`, senza la quale la registrazione fallisce a runtime («The field 'issuer'
   does not exist in the 'accounts' Drizzle schema»). Qui lo schema auth è **scritto nella spec**
   (§ 4.5), non generato.
4. `:memory:` di libSQL si svuota in silenzio dopo una transazione fallita; `file::memory:?cache=shared`
   condivide un solo DB fra tutti i client (segnaprezzi, `src/lib/db/testing/create-test-db.ts`,
   verificato lì con `@libsql/client` 0.17.4): i test usano un **file temporaneo per test** (T-3).
5. **Le foreign key di SQLite/libSQL sono spente di default e valgono per connessione**
   (https://docs.turso.tech/sql-reference/pragmas, letta 2026-10-24); su Turso remoto via HTTP una
   `PRAGMA` non sopravvive fra le richieste. Quindi questa serie **non si affida a `ON DELETE
   CASCADE`** per i dati dell'app: ogni cancellazione elimina esplicitamente le righe figlie, e i
   database locali (sviluppo, test, E2E) accendono le foreign key **senza cascade** sulle tabelle
   dell'app, così una cancellazione dimenticata fa fallire il test invece di passare in locale e
   lasciare orfani in produzione.
6. Next 16: `middleware.ts` → `src/proxy.ts` (solo Node); `cookies()`/`headers()` sono async;
   `getSessionCookie` di Better Auth controlla solo la presenza del cookie («NOT SECURE»,
   https://www.better-auth.com/docs/integrations/next, letta 2026-10-24) → la barriera vera è il
   layout dell'area protetta più `requireUser()` in ogni Server Action e route.
7. Next 16 `next dev` riscrive `AGENTS.md` con un blocco generato se `agentRules` non è `false`
   (segnaprezzi AGENTS § 4.13).

## 2. Obiettivo e criteri di accettazione

Un progetto Next 16 che compila, con database Turso/Drizzle, autenticazione Better Auth con
registrazione chiudibile, l'area protetta, l'harness dei test (unit su file temporaneo, Playwright
su build di produzione) e gli script di qualità che valgono per tutta la serie.

| # | Criterio | Prova |
|---|---|---|
| A1 | Da clone pulito: `pnpm install`, poi `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e` sono verdi. | Collaudo § 7 fase C, esito in CLAUDE.md → Latest. |
| A2 | `EnvSchema` (C-1) rifiuta l'avvio nominando la variabile mancante o sbagliata; `SIGNUP_ENABLED` vale `false` quando manca (D-37); `E2E_FAKE_SERVICES=1` con `VERCEL_ENV=production` è rifiutato. | `src/lib/env-schema.test.ts` (§ 6). |
| A3 | Registrazione, accesso e uscita funzionano con email e password; la sessione dura 180 giorni (T-15). | E2E `tests/e2e/auth.spec.ts`: registra un utente nuovo, esce, rientra. |
| A4 | Con iscrizioni chiuse il server rifiuta la registrazione (non solo la UI) e `/registrati` mostra «Le iscrizioni sono chiuse». | Unit `create-auth.test.ts` (`signUpEmail` → errore con `signupEnabled: false`); E2E `signup-closed.spec.ts` sul server :3101 avviato con `SIGNUP_ENABLED=false`. |
| A5 | Senza sessione, ogni pagina tranne `/accedi`, `/registrati`, `/offline` reindirizza a `/accedi?next=<percorso>`; dopo l'accesso si torna a `next` (solo percorsi interni). | E2E `auth.spec.ts`; unit `public-paths.test.ts` e `safe-next-path.test.ts`. |
| A6 | `createTestDb()` crea un DB nuovo per test con le migrazioni vere e le foreign key **accese**; due DB creati di seguito non si vedono. | `create-test-db.test.ts`. |
| A7 | La guardia dell'isolamento esiste prima dei repository: un test fallisce se un file in `src/lib/db/repositories/` esporta una funzione la cui firma non comincia con `(db: Db, userId: string` (l'unica eccezione dichiarata è `reference-prices.ts`, che nascerà nella 08). | `src/lib/db/repositories/scope.test.ts` con un repository di prova nel test stesso (§ 6). |
| A8 | `pnpm db:seed` crea i due utenti seed (C-21) in modo idempotente. | Collaudo § 7 fase C (due esecuzioni di fila, nessun errore, 2 utenti). |
| A9 | «Elimina account» lato server: `auth.api.deleteUser` con la password cancella l'utente; l'hook `beforeDelete` chiama `deleteAllUserData(db, userId)` (oggi nessuna tabella dell'app: la 02 la riempie). | Unit `create-auth.test.ts`: registra, cancella, `users` vuota. |

## 3. Decisioni

- **D-4** (multi-utente, registrazione chiudibile), **D-37** (chiuse di default), **D-38** (solo
  italiano), **D-40** (elimina account: qui il lato server, la UI nella 03), **D-12** (nome).
- **T-1** (versioni), **T-3** (Node entry, file temporaneo), **T-4** (`--webpack`, `proxy.ts`),
  **T-5** (layout), **T-6** (script), **T-8** (nanoid ovunque), **T-14** (rotte italiane), **T-15**
  (sessione e rate limit), **T-16** (Playwright dalla 01), **T-17** (container, guardia su
  `E2E_FAKE_SERVICES`).
- Adottate qui, ribaltabili: (a) **foreign key senza cascade sulle tabelle dell'app**, accese nei
  DB locali, cancellazioni esplicite nei servizi (§ 1.5); le tabelle di Better Auth tengono il loro
  `onDelete: 'cascade'` verso `users` (lo schema del core le dichiara così) e Better Auth cancella
  da sé sessioni e account; (b) la factory `createAuth` separata dall'istanza `auth`, così i test la
  costruiscono su un DB temporaneo; (c) `createDb` separato dal singleton, così gli script `tsx`
  non importano `server-only`; (d) la pagina `/` della 01 è un segnaposto («Ciao, <nome>» e
  «Esci»): la 03 la sostituisce; (e) nessuna verifica dell'email, nessun OAuth, nessun reset della
  password (non c'è posta in uscita: CLAUDE.md § Not yet present).

## 4. La soluzione

### 4.1 Scaffold

```bash
corepack enable && corepack prepare pnpm@11.22.0 --activate
pnpm dlx create-next-app@16.4.3 . --ts --tailwind --app --src-dir --import-alias "@/*" --use-pnpm --no-eslint --skip-install
```

(Il comando non tocca i documenti esistenti; se `create-next-app` rifiuta la cartella non vuota,
si genera in una cartella temporanea e si copiano `src/`, `public/`, `next.config.ts`,
`postcss.config.mjs`, `tsconfig.json`, `next-env.d.ts` — mai `README.md` né `.gitignore`.)

```bash
pnpm add next@16.4.3 react@19.3.1 react-dom@19.3.1 zod@4.6.7 better-auth@1.7.12 drizzle-orm@0.45.4 @libsql/client@0.18.0 nanoid@6.0.2 server-only@0.0.1
pnpm add -D typescript@7.0.2 @types/node@22 @types/react@19 @types/react-dom@19 @biomejs/biome@2.6.2 vitest@5.0.5 tsx@4.23.15 dotenv@18.0.9 drizzle-kit@0.31.11 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 @playwright/test@1.64.1
pnpm exec playwright install chromium
```

`package.json` (le parti che contano):

```json
{
  "name": "segnabollette",
  "private": true,
  "packageManager": "pnpm@11.22.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx --env-file-if-exists=.env.local scripts/seed.ts"
  }
}
```

`pnpm-workspace.yaml`: `allowBuilds: { '@parcel/watcher': true, esbuild: true, sharp: false, unrs-resolver: false }`
(lo stesso blocco di segnaprezzi; `sharp` diventa `true` nella 09).

### 4.2 File di configurazione

- `biome.json`: schema 2.6, `vcs: { enabled: true, clientKind: 'git', useIgnoreFile: true }`,
  `files.ignoreUnknown: true`, formatter con indentazione 2 spazi e `lineWidth: 100`, linter
  `recommended` più i domini `next`, `react`, `test`, `assist.actions.source.organizeImports: 'on'`,
  JavaScript `quoteStyle: 'single'`, `semicolons: 'always'`, `css.parser.tailwindDirectives: true`.
- `tsconfig.json`: quello generato, più `"strict": true`, `"noUncheckedIndexedAccess": true`,
  `"paths": { "@/*": ["./src/*"] }`.
- `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Why: `next dev` otherwise appends a generated block to AGENTS.md on every run; this repo's
  // AGENTS.md is a hand-maintained contract.
  agentRules: false,
};

export default nextConfig;
```

- `vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Placeholder values: no test may ever read .env.local or reach a real service.
    env: {
      TZ: 'Europe/Rome',
      TURSO_DATABASE_URL: 'file:vitest-unused.db',
      BETTER_AUTH_SECRET: 'vitest-secret-vitest-secret-vitest-secret-00',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

- `drizzle.config.ts`:

```ts
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// dotenv never overrides variables already set: exporting the production pair from
// .env.turso-prod into the shell is how a migration reaches the remote database.
config({ path: '.env.local' });

export default defineConfig({
  dialect: 'turso',
  schema: ['./src/lib/db/schema/auth.ts', './src/lib/db/schema/app.ts'],
  out: './drizzle',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
```

- `.env.example` (committato; `.env.local` mai):

```bash
# Copy to .env.local and fill in. Never commit .env.local (.gitignore).
# Database — a local SQLite file in development; libsql://… plus a token in production.
TURSO_DATABASE_URL="file:local.db"
TURSO_AUTH_TOKEN=""
# Better Auth — generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=""
BETTER_AUTH_URL="http://localhost:3000"
# Registration: "true" opens it; missing or "false" keeps it closed.
SIGNUP_ENABLED="true"
```

- `.gitignore`: quello del bootstrap più `.e2e-blob/` (06) e `.env.turso-prod` è già coperto da `.env.*`.

### 4.3 Ambiente — `src/lib/env-schema.ts` e `src/lib/env.ts` (C-1)

```ts
// src/lib/env-schema.ts
/**
 * The one schema of the process environment. `env.ts` is its server-only instance; CLI scripts
 * parse `process.env` with this schema directly, because importing `server-only` outside the
 * React Server environment throws.
 */
import { z } from 'zod';

const booleanFlag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback)
    .transform((value) => value === 'true' || value === '1');

export const EnvSchema = z
  .object({
    TURSO_DATABASE_URL: z.string().min(1, 'TURSO_DATABASE_URL is required'),
    // An empty line in .env.local arrives as '': treat it as absent.
    TURSO_AUTH_TOKEN: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.url('BETTER_AUTH_URL must be an absolute URL'),
    SIGNUP_ENABLED: booleanFlag('false'),
    E2E_FAKE_SERVICES: booleanFlag('false'),
    VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.TURSO_DATABASE_URL.startsWith('libsql://') && !env.TURSO_AUTH_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURSO_AUTH_TOKEN'],
        message: 'TURSO_AUTH_TOKEN is required for a remote libsql:// database',
      });
    }
    if (env.E2E_FAKE_SERVICES && env.VERCEL_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['E2E_FAKE_SERVICES'],
        message: 'E2E_FAKE_SERVICES must never be set in production',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;
```

```ts
// src/lib/env.ts
import 'server-only';
import { EnvSchema } from './env-schema';

/** The validated environment, parsed once per server process. */
export const env = EnvSchema.parse(process.env);
```

### 4.4 Database — `src/lib/db/create-db.ts`, `src/lib/db/client.ts` (C-2)

```ts
// src/lib/db/create-db.ts
/**
 * Drizzle over libSQL. Shared by the server singleton, the CLI scripts and the tests.
 *
 * Foreign keys: SQLite and libSQL ship with enforcement OFF, per connection, and a PRAGMA does not
 * survive between HTTP requests to remote Turso. The app therefore never relies on ON DELETE
 * CASCADE for its own tables (services delete children explicitly), and local file databases turn
 * enforcement ON so that a forgotten child delete fails in development and in tests instead of
 * leaving orphans in production.
 */
import { type Client, createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export function createDb(options: { url: string; authToken?: string }) {
  const client = createClient({ url: options.url, authToken: options.authToken });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>['db'];

/** Turn on foreign keys (and WAL with a busy timeout) on a local file database. */
export async function prepareLocalDatabase(client: Client, url: string): Promise<void> {
  if (!url.startsWith('file:')) return;
  await client.execute('PRAGMA foreign_keys = ON');
  // Why: the rollback journal serializes readers and writers so tightly that parallel Playwright
  // workers get SQLITE_BUSY; WAL plus a busy timeout queues them instead (segnaprezzi, 2026).
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA busy_timeout = 5000');
}
```

```ts
// src/lib/db/client.ts
/**
 * The server-side Drizzle singleton, cached on globalThis so that dev HMR does not leak a libSQL
 * connection per reload.
 */
import 'server-only';
import type { Client } from '@libsql/client';
import { env } from '@/lib/env';
import { createDb, type Db, prepareLocalDatabase } from './create-db';

const globalForDb = globalThis as unknown as { segnabolletteDb?: { db: Db; client: Client } };

function initDb() {
  const created = createDb({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  // Not awaited: the local libSQL driver executes synchronously under the hood, so the PRAGMAs
  // complete before any other statement on this client; top-level await would break tsx scripts.
  void prepareLocalDatabase(created.client, env.TURSO_DATABASE_URL);
  return created;
}

const instance = globalForDb.segnabolletteDb ?? initDb();
if (process.env.NODE_ENV !== 'production') globalForDb.segnabolletteDb = instance;

export const db = instance.db;
export type { Db } from './create-db';
```

`src/lib/container.ts` (C-18, la 06 lo estende):

```ts
import 'server-only';
import { db } from '@/lib/db/client';
import type { Db } from '@/lib/db/create-db';

/** The app reaches its services only through here; Playwright swaps the external ones for fakes. */
export function getDb(): Db {
  return db;
}
```

### 4.5 Schema auth — `src/lib/db/schema/auth.ts`, barile `index.ts`, `app.ts` vuoto

Lo schema del core di Better Auth 1.7 con nomi al plurale (`usePlural: true`), la colonna
`issuer` su `accounts` e la tabella del rate limit su database. Le date sono `timestamp_ms`.

```ts
// src/lib/db/schema/auth.ts
/**
 * Better Auth 1.7 core schema, written by hand: the published schema CLI lags the core (it does
 * not emit `accounts.issuer`, and signup then fails at runtime). Table names are plural because
 * the adapter runs with usePlural. These four tables keep ON DELETE CASCADE towards users
 * because Better Auth itself deletes sessions and accounts before the user.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(nowMs)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = sqliteTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(nowMs).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(nowMs)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const rateLimits = sqliteTable('rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
});
```

`src/lib/db/schema/app.ts` nasce con un solo commento di testa («App tables: houses, supplies,
bills… — added by the data-model work») e nessuna tabella; `src/lib/db/schema/index.ts`:
`export * from './auth'; export * from './app';`. Poi `pnpm db:generate` produce
`drizzle/0000_*.sql` (committato con `drizzle/meta/`). Se la registrazione in `create-auth.test.ts`
fallisce per un campo mancante di Better Auth, il messaggio di errore nomina il campo: si aggiunge
quel campo con il nome del messaggio, si rigenera la migrazione e lo si annota in AGENTS.md §
Gotchas con la data (è l'unico caso in cui la spec prevede un adeguamento).

### 4.6 Errori — `src/lib/errors.ts` (C-5)

```ts
/**
 * Domain errors and their Italian messages. Server Actions return ActionResult instead of
 * throwing across the client boundary; route handlers map codes to HTTP statuses.
 */
export type DomainErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'OVERLAP_DECISION_REQUIRED'
  | 'DUPLICATE_IDENTIFIER';

export const ERROR_MESSAGES: Record<DomainErrorCode, string> = {
  UNAUTHORIZED: 'Devi accedere per continuare.',
  NOT_FOUND: 'Non trovato.',
  VALIDATION: 'Alcuni dati non sono validi.',
  OVERLAP_DECISION_REQUIRED: 'Questa bolletta copre giorni già coperti: scegli se sommarla o se sostituisce quella vecchia.',
  DUPLICATE_IDENTIFIER: 'Hai già una fornitura con questo codice.',
};

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'DomainError';
  }
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: DomainErrorCode; message: string; details?: unknown };

/** Run a Server Action body and turn a DomainError into a result; anything else is rethrown. */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, code: error.code, message: error.message, details: error.details };
    }
    throw error;
  }
}
```

### 4.7 Autenticazione (C-3)

```ts
// src/lib/auth/create-auth.ts
/**
 * Better Auth factory. The server instance lives in auth.ts; tests build their own on a temp DB.
 *
 * Design: email + password only (no outbound email, so no verification and no reset). Signup is
 * closed by the server through disableSignUp, not only hidden in the UI. The rate limiter keeps
 * its counters in the database because on Vercel each Fluid instance would otherwise count alone.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { nanoid } from 'nanoid';
import type { Db } from '@/lib/db/create-db';
import * as schema from '@/lib/db/schema';
import { deleteAllUserData } from '@/lib/services/user-data';

export interface CreateAuthOptions {
  db: Db;
  secret: string;
  baseURL: string;
  signupEnabled: boolean;
  rateLimitEnabled: boolean;
  /** Runs after the user row is gone; the Blob cleanup plugs in here. */
  afterUserDeleted?: (userId: string) => Promise<void>;
}

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: drizzleAdapter(options.db, { provider: 'sqlite', usePlural: true, schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.signupEnabled,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: {
      deleteUser: {
        enabled: true,
        // App tables have no cascade (foreign keys are off on remote Turso): remove the user's rows
        // explicitly before Better Auth deletes the user.
        beforeDelete: async (user: { id: string }) => {
          await deleteAllUserData(options.db, user.id);
        },
        afterDelete: async (user: { id: string }) => {
          await options.afterUserDeleted?.(user.id);
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 180,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: { enabled: options.rateLimitEnabled, storage: 'database' },
    advanced: { database: { generateId: () => nanoid() } },
    plugins: [nextCookies()], // must stay the last plugin
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

```ts
// src/lib/auth/auth.ts
import 'server-only';
import { db } from '@/lib/db/client';
import { env } from '@/lib/env';
import { createAuth } from './create-auth';

export const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  signupEnabled: env.SIGNUP_ENABLED,
  // Off outside production and under Playwright, whose global setup signs in back to back.
  rateLimitEnabled: process.env.NODE_ENV === 'production' && !env.E2E_FAKE_SERVICES,
});
```

`src/lib/services/user-data.ts`:

```ts
import type { Db } from '@/lib/db/create-db';

/**
 * Delete every row the app owns for a user, children before parents, in one batch.
 *
 * WARNING: every app table with a user_id joins this function in the same change that creates it
 * (the account-deletion test fails otherwise: local foreign keys are on and have no cascade).
 */
export async function deleteAllUserData(db: Db, userId: string): Promise<void> {
  void db;
  void userId; // No app tables yet: houses, supplies, bills and readings arrive with the data model.
}
```

(La 02 sostituisce il corpo con il `db.batch` delle sue tabelle.)

`src/app/api/auth/[...all]/route.ts`: `export const { GET, POST } = toNextJsHandler(auth);` (da
`better-auth/next-js`).

`src/lib/auth/auth-client.ts`: `export const authClient = createAuthClient();` (da
`better-auth/react`, stessa origine: niente `baseURL`).

`src/lib/auth/public-paths.ts`:

```ts
/** The only list of pages reachable without a session (the proxy and the tests read it). */
export const PUBLIC_PATHS = ['/accedi', '/registrati', '/offline'] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Accept only internal absolute paths as a post-login destination (no open redirect). */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}
```

`src/lib/auth/session.ts`:

```ts
import 'server-only';
import { headers } from 'next/headers';
import { DomainError } from '@/lib/errors';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** Every Server Action and route handler starts here; userId never comes from the client. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new DomainError('UNAUTHORIZED');
  return user;
}
```

`src/proxy.ts` (barriera ottimistica, non l'unica):

```ts
import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import { isPublicPath } from '@/lib/auth/public-paths';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || getSessionCookie(request)) return NextResponse.next();
  const login = new URL('/accedi', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // API routes check the session themselves; static files, the manifest and the service worker
  // stay public.
  matcher: ['/((?!api|_next|favicon.ico|manifest.webmanifest|sw.js|icons|brand|.*\\.[a-z0-9]+$).*)'],
};
```

### 4.8 Pagine

Struttura (gruppi di route):

- `src/app/layout.tsx`: `<html lang="it">`, metadata `title: 'Segnabollette'`, body senza
  componenti di design (la 03 li porta).
- `src/app/(auth)/accedi/page.tsx` (Server Component) + `src/components/auth/sign-in-form.tsx`
  (client): campi «Email» e «Password», pulsante «Accedi»; chiama
  `authClient.signIn.email({ email, password })`; in caso di errore mostra «Email o password non
  corretti.» (stesso testo per utente inesistente e password sbagliata); in caso di successo
  `router.replace(safeNextPath(searchParams.next))`. Se `env.SIGNUP_ENABLED`, sotto il form il
  link «Non hai un account? Registrati»; la pagina passa il booleano al form come prop.
- `src/app/(auth)/registrati/page.tsx`: se `!env.SIGNUP_ENABLED` mostra il titolo «Le iscrizioni
  sono chiuse» e il testo «Questa installazione di Segnabollette non accetta nuovi account.» con il
  link «Accedi»; altrimenti `sign-up-form.tsx` con «Nome», «Email», «Password» (min 8, il campo
  dice «almeno 8 caratteri»), pulsante «Crea account»; `authClient.signUp.email` → `router.replace('/')`.
- `src/app/(app)/layout.tsx`: `const user = await getSessionUser(); if (!user) redirect('/accedi');`
  e rende i figli.
- `src/app/(app)/page.tsx`: «Ciao, {user.name}» e il pulsante «Esci» (`sign-out-button.tsx`,
  client: `authClient.signOut()` → `router.replace('/accedi')`).

Testi italiani dentro i componenti (D-38). Nessun colore letterale oltre le classi Tailwind di
base: la 03 restilizza tutto con DESIGN.md.

### 4.9 Harness dei test (C-4)

`src/lib/db/testing/create-test-db.ts`:

```ts
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

export async function createTestUser(db: Db, overrides?: Partial<typeof users.$inferInsert>): Promise<{ id: string }> {
  const id = overrides?.id ?? nanoid();
  const [row] = await db
    .insert(users)
    .values({ id, name: 'Utente di prova', email: `${id}@example.test`, ...overrides })
    .returning({ id: users.id });
  if (!row) throw new Error('createTestUser: insert returned no row');
  return row;
}
```

### 4.10 Seed — `scripts/seed-data.ts`, `scripts/seed.ts` (C-21)

```ts
// scripts/seed-data.ts
/** The two seed identities shared by `pnpm db:seed`, Playwright and the guided verifications. */
export const SEED_USERS = [
  { key: 'a', name: 'Seed Fenicottero', email: 'seed-a@example.test', password: 'seed-password-1' },
  { key: 'b', name: 'Seed Ornitorinco', email: 'seed-b@example.test', password: 'seed-password-1' },
] as const;
```

`scripts/seed.ts`: legge `process.env` con `EnvSchema`, crea il DB con `createDb` +
`prepareLocalDatabase` + `migrate`, costruisce `createAuth({ …, signupEnabled: true,
rateLimitEnabled: false })` e per ogni seed user: se l'email esiste già in `users` lo salta,
altrimenti `auth.api.signUpEmail({ body: { name, email, password } })`. Esporta `seedDatabase(db,
auth)` per Playwright e stampa «seed: 2 utenti (0 nuovi)» o «seed: 2 utenti (2 nuovi)». Rifiuta
di girare se `TURSO_DATABASE_URL` non comincia con `file:` (il seed non tocca mai Turso remoto).

### 4.11 Playwright

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const OPEN = 'http://localhost:3100';
const CLOSED = 'http://localhost:3101';
const serverEnv = {
  TURSO_DATABASE_URL: 'file:e2e.db',
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret-00',
  E2E_FAKE_SERVICES: '1',
};

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 2,
  use: { locale: 'it-IT', trace: 'retain-on-failure' },
  webServer: {
    // One command, two servers on the same build: e2e-servers.mjs starts the closed-signup server
    // on 3101, waits until it answers, then starts the open one on 3100 — so when Playwright sees
    // 3100 up, both are ready.
    command: 'node scripts/e2e-reset-db.mjs && pnpm build && node scripts/e2e-servers.mjs',
    url: OPEN,
    reuseExistingServer: false,
    timeout: 300_000,
    env: serverEnv,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, baseURL: OPEN }, testIgnore: /signup-closed/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], baseURL: OPEN }, testIgnore: /signup-closed/ },
    { name: 'closed', use: { ...devices['Desktop Chrome'], baseURL: CLOSED }, testMatch: /signup-closed/ },
  ],
});
```

- `scripts/e2e-reset-db.mjs`: cancella `e2e.db`, `e2e.db-wal`, `e2e.db-shm` e applica le
  migrazioni con `drizzle-orm/libsql/migrator` (JavaScript puro: niente alias `@/`).
- `scripts/e2e-servers.mjs`: avvia con `spawn('pnpm', ['start', '--port', '3101'], { shell: true,
  env: { ...process.env, BETTER_AUTH_URL: 'http://localhost:3101', SIGNUP_ENABLED: 'false' } })`,
  interroga `http://localhost:3101/accedi` ogni 500 ms fino a una risposta 200 (al massimo 60 s,
  poi esce con codice 1), poi avvia allo stesso modo la porta 3100 con
  `BETTER_AUTH_URL: 'http://localhost:3100'` e `SIGNUP_ENABLED: 'true'`; su `SIGINT`/`SIGTERM` e
  sull'uscita di uno dei due figli termina l'altro ed esce.
- `tests/e2e/global-setup.ts` (gira dopo che il server risponde): chiama `seedDatabase` su
  `e2e.db`, poi per ogni seed user fa `POST http://localhost:3100/api/auth/sign-in/email` con
  `{ email, password }` e l'header `Origin: http://localhost:3100`, e salva lo `storageState` in
  `playwright/.auth/seed-<key>.json` (gitignored) costruendolo dai cookie `Set-Cookie` della risposta.

### 4.12 Pagina della 01 sotto test

- `tests/e2e/auth.spec.ts`: (1) senza sessione `/` → `/accedi?next=%2F`; (2) registra
  `nuovo-<timestamp>@example.test`, arriva su `/` con «Ciao, …»; (3) «Esci» → `/accedi`; (4)
  accede con le stesse credenziali e `next=/` → `/`; (5) password sbagliata → «Email o password
  non corretti.»; (6) `next=//evil.example` → dopo l'accesso resta su `/`; (7) con un cookie
  `better-auth.session_token=fake` impostato a mano, `/` → `/accedi` (il proxy lo lascia passare,
  il layout no).
- `tests/e2e/signup-closed.spec.ts` (progetto `closed`): `/registrati` mostra «Le iscrizioni sono
  chiuse»; `POST /api/auth/sign-up/email` con `Origin` → status ≥ 400 e nessuna riga nuova in
  `users` (letta da `e2e.db` con `createDb`).

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che le pagine non importano `db` né lo schema;
  `createAuth` non legge `process.env`; `requireUser()` è l'unica fonte di `userId`.
- **AGENTS.md § 2.3 Secrets** — `.env.local` mai committato; i test usano i segnaposto di
  `vitest.config.ts` e non leggono `.env.local`; il seed rifiuta un database remoto.
- **AGENTS.md § 2.6 Foreign keys** — qui vuol dire che `deleteAllUserData` esiste dalla prima ora e
  che ogni tabella dell'app con `user_id` vi entra nella stessa spec che la crea.
- Better Auth: `nextCookies()` ultimo plugin; una `fetch` Node verso `/api/auth/*` deve mandare
  `Origin` (controllo di origine, segnaprezzi § 4.19); `BETTER_AUTH_URL` deve avere la porta giusta
  (3100 e 3101 nei due server E2E).
- `tsx --env-file-if-exists=.env.local` (non `--env-file`: crasha se il file manca).
- Windows: LF (`.gitattributes`), Biome rosso altrimenti; `pnpm` può non essere nel PATH di una
  shell nuova (`corepack enable`).
- Next 16: `cookies()`/`headers()` async; `proxy.ts` gira su Node; niente `cacheComponents`.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `env-schema.test.ts`: `{}` → errore che nomina `TURSO_DATABASE_URL`; valori minimi validi → `SIGNUP_ENABLED === false`; `SIGNUP_ENABLED: 'true'` → `true`; `TURSO_DATABASE_URL: 'libsql://x'` senza token → errore su `TURSO_AUTH_TOKEN`; `TURSO_AUTH_TOKEN: ''` → `undefined`; `E2E_FAKE_SERVICES: '1', VERCEL_ENV: 'production'` → errore. | Default di `SIGNUP_ENABLED` a `'true'` → il secondo caso fallisce. |
| Unit | `public-paths.test.ts`: `/accedi`, `/registrati/x`, `/offline` pubblici; `/`, `/bollette`, `/accedi-x` no. `safe-next-path.test.ts`: `/bollette?x=1` passa; `//evil`, `https://evil`, `/\\evil`, `null` → `/`. | Togliere il controllo `//` → il caso `//evil` fallisce. |
| Integrazione | `create-test-db.test.ts`: due DB, una riga in `users` nel primo, il secondo ne ha 0; `PRAGMA foreign_keys` restituisce 1. | Usare `:memory:` condiviso o togliere `prepareLocalDatabase` → un'asserzione fallisce. |
| Integrazione | `create-auth.test.ts`: con `signupEnabled: true` `auth.api.signUpEmail` crea l'utente e `auth.api.signInEmail` restituisce un token; con `false` `signUpEmail` lancia; `auth.api.deleteUser({ body: { password }, headers })` con la sessione appena creata → `users` vuota. | `disableSignUp: false` fisso → il caso chiuso non lancia; togliere `issuer` dallo schema → la registrazione fallisce. |
| Statico | `src/lib/db/repositories/scope.test.ts`: legge ogni `*.ts` (non test) della cartella, estrae le `export (async )?function` e verifica che la firma cominci con `(db: Db, userId: string` (eccezione per nome file: `reference-prices.ts`); un secondo caso applica lo stesso controllo a una stringa di prova con `export async function listAll(db: Db)` e si aspetta il fallimento. | Il caso di prova con firma sbagliata deve risultare «non conforme»; se l'espressione regolare accettasse tutto, il secondo caso fallisce. |
| E2E | `auth.spec.ts` (mobile, desktop), `signup-closed.spec.ts` (closed) come in § 4.12. | Togliere il controllo `getSessionUser` dal layout `(app)` → il caso (7) apre `/` con il cookie falso e fallisce. |

## 7. Collaudo guidato (WORKFLOW.md § 2; fasi che hanno senso qui)

- **A — Invarianza**: niente da preservare (repo nuovo). Si dichiara.
- **C — Comportamento nuovo**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`
  verdi. Esito atteso: cinque comandi verdi; il numero di test lo scrive chi implementa nel commit.
  Poi `pnpm db:seed` due volte su `local.db`: «2 nuovi», poi «0 nuovi».
- **D — Sotto la UI**: con `pnpm dev`, `curl -i -X POST localhost:3000/api/auth/sign-up/email`
  con `Origin: http://localhost:3000` e `SIGNUP_ENABLED="false"` in `.env.local` → errore e
  nessuna riga nuova (`pnpm db:studio`). Poi `SIGNUP_ENABLED="true"` ripristinato.
- **E — Casi negativi**: cookie di sessione inventato → `/accedi` (già nell'E2E: si cita, non si
  rifà a mano).
- **F — Giro guidato**: l'owner apre `http://localhost:3000/registrati`, crea un account con un
  nome inventato, esce, rientra. Da guardare: (1) la pagina di accesso dice che cosa sbaglia con
  una password errata; (2) il nome appare nel saluto; (3) con `SIGNUP_ENABLED="false"` e il server
  riavviato `/registrati` dice che le iscrizioni sono chiuse. Non copre l'aspetto (la 03).
- **G — Ripristino**: `.env.local` con `SIGNUP_ENABLED="true"`; l'account del giro resta in
  `local.db` (è il DB di sviluppo dell'owner), nessun file da cancellare.

Che cosa NON copre: il deploy (05), l'eliminazione dell'account dalla UI (03), i dati dell'app (02).

## 8. Messa in esercizio

- Variabili: `.env.local` (Development) con le cinque di `.env.example`. Nessun Vercel, nessun
  Turso remoto (05).
- DDL: `drizzle/0000_*.sql` (tabelle auth), applicato in locale da `pnpm db:migrate`.
- Misura di chiusura: `pnpm test:e2e` verde. In esercizio = PR mergiata su `main` + collaudo
  annotato in CLAUDE.md (regola 5 dell'indice); la 05 rifà in produzione la registrazione e il
  rifiuto con le iscrizioni chiuse.

## 9. Documentazione

- `CLAUDE.md`: § Current Status → Latest (una riga: scaffold e accesso, dove, cosa viene dopo);
  § Current Status → Stack: via «nothing installed yet»; § Architecture Snapshot: la riga dell'auth
  e del DB; § Not yet present: la riga «Any code, `package.json`, migrations» diventa «App tables:
  born in spec 02»; resta «Password reset and email verification: no outbound email».
- `AGENTS.md`: § 2.6 (foreign keys senza cascade, cancellazioni esplicite) si conferma; § 4 Database
  e § 5 Auth tolgono «from spec 01» e descrivono ciò che esiste; § 9 Testing (`createTestDb`,
  Playwright, seed); § 10 Commands reali; § 11 Gotchas con le trappole incontrate e la loro data.
- `README.md`: § Local development (pnpm, `.env.local`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`).
- `WORKFLOW.md` § 3: la nota «State on 2026-10-24 … There is no code yet» si toglie; le righe 01
  della tabella sono vere.
- Limiti: CLAUDE.md sotto 20.000 caratteri; AGENTS.md sotto 400 righe dopo questa spec.

## 10. Fuori ambito, dichiarato

- Tabelle dell'app, case, forniture, bollette → **02**.
- Design, shell, Impostazioni con «Elimina account» → **03**.
- Deploy, Turso remoto, `BETTER_AUTH_URL` di produzione → **05**.
- Reset della password, verifica dell'email, OAuth: non c'è posta in uscita → CLAUDE.md § Not yet
  present.
- File su Blob e la loro cancellazione con l'account → **06** (si aggancia ad `afterUserDeleted`).

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **M** (scaffold + auth + harness + E2E).

```
Ciao, in questa sessione implemento la spec doc/v1/01-scaffold-database-e-accesso.md.

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue
- Leggi doc/v1/00-INDICE.md per intero (decisioni, scelte T-N, contratti C-1, C-2, C-3, C-4, C-5,
  C-18, C-21, regole della serie) e poi la spec 01 INTERA

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/01-scaffold-auth. Crea SESSION_NOTES.md.

Implementa la spec 01 esattamente come scritta: § 4 è il codice, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima), § 9 la
documentazione. Non decidere nulla che la spec ha già deciso; se trovi un punto che la spec non
copre, fermati e chiedimelo con AskUserQuestion. Le etichette della serie (D-N, T-N, C-N,
«spec 01») non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
