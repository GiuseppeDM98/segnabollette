# AGENTS.md — Operating manual for coding agents

> Read **WORKFLOW.md** first (session rules, guided verification). This file is the core of the
> repo-wide rules; domain narratives go to `doc/guide/<tema>.md` as they are born (a stub stays
> here). Every rule below holds for all the code; a section marked *(from spec NN)* describes what
> that spec installs and is updated by it, and a name tagged *(from spec NN)* inside a rule does
> not exist until that spec is implemented.

## 1. What this repo is

A multi-user tracker of household utility bills (electricity, gas, water, flat-fee utilities) with
closable registration, built on Next.js, Turso, Vercel Blob and the Anthropic API (CLAUDE.md §
Project Overview). The v1 is built one spec at a time from `doc/v1/` (index `00-INDICE.md`): a spec
is the only instruction of a session; what it does not say is asked to the owner, never decided
alone.

## 2. Repo-wide conventions

### 2.1 Layers and imports

`src/app` (pages, route handlers, Server Actions) is thin: zod → `requireUser()` → a service →
map the result (`toActionResult`, `toErrorResponse`). `src/lib/services/*` holds the use cases;
every service takes `db: Db` first and its other dependencies (`blob`, `extractor`, `now`, `clock`)
explicitly. `src/lib/db/repositories/*` is the only place that writes SQL (Drizzle), with one
exception: `src/lib/db/maintenance/prune.ts`, the queries of `pnpm documents:prune`, which no app
module imports.
`src/lib/domain/*` and `src/lib/engine/*` are pure: no Drizzle, no `next/*`, no `fetch`, no clock
(they take `today`/`now` as parameters). Services import each repository as a namespace
(`import * as billsRepository from '@/lib/db/repositories/bills'`, likewise `housesRepository`,
`suppliesRepository`, `readingsRepository`): a service and its repository share function names
(`listBills`, `listReadings`) with different signatures. Gateways:
`src/lib/extraction/anthropic-extractor.ts` is the only file importing `@anthropic-ai/sdk`;
`src/lib/blob/vercel-blob-store.ts` the only server file importing `@vercel/blob` and
`src/lib/blob/upload-client.ts` the only client one; `src/components/charts/recharts.ts` the only file importing `recharts` (it re-exports what the
charts use, Recharts' `ReferenceLine` as `RechartsReferenceLine`).
The app reaches external services through `src/lib/container.ts` (`getDb`; `getBlobStore`,
`getBillExtractor` and their fakes under `E2E_FAKE_SERVICES=1`); CLI scripts in `scripts/` build their
clients directly and never import `server-only` modules (`env.ts`, `db/client.ts`, `auth/auth.ts`,
`container.ts`); a module a script needs takes its secrets as arguments (`createVercelBlobStore(token)`).
Route handlers exist only where a non-form client calls HTTP (auth, Blob upload, extraction steps,
document download, the offline queue); everything else is a colocated Server Action.

### 2.2 Naming

Files kebab-case; functions verb + noun; reads are `get*` (one row or `null`) and `list*`, writes
`create*`/`update*`/`delete*`, never `find*`; batch-ready query builders end in `Query`. Booleans
`is/has/can`. DB tables and columns snake_case, TypeScript camelCase (Drizzle maps them). Routes
and UI text in Italian; code, identifiers and comments in English. The series labels (`D-12`,
`T-3`, `C-7`, «spec 04») never appear in code, comments or commit messages: write the why in full.

### 2.3 Secrets and the owner's data

Secrets only in `.env.local`, `.env.turso-prod` (both gitignored) and Vercel; `.env.example` lists
every variable a developer or a deployment sets (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIGNUP_ENABLED`; `ANTHROPIC_API_KEY`,
`BLOB_READ_WRITE_TOKEN`), with development defaults and empty secrets; the test-only switches
(`E2E_FAKE_SERVICES`, `NEXT_PUBLIC_E2E_FAKE_SERVICES`, `E2E_BLOB_DIR`, `E2E_EXTRACTOR_DELAY_MS`) are
set only by `playwright.config.ts` (and, for a local verification with the fakes, on the command
line of that run, never in `.env.local`), and `VERCEL_ENV` only by Vercel. `src/lib/env-schema.ts` is the
zod schema, `src/lib/env.ts` the server-only instance and the only reader of `process.env` in the
app, except `process.env.NODE_ENV` and the `NEXT_PUBLIC_*` variables read literally in client code
(Next inlines both at build time). Secret values never pass
through the chat: the owner types them. **Nothing of the owner's data in a tracked file, commit or
PR** (WORKFLOW § 1.6, public repo, no exception): no real bill, POD, PDR, invoice number, customer
code, address, supplier of the owner or amount. Bill fixtures are synthetic and generated
(`pnpm fixture:bills`, `scripts/make-bill-fixtures.ts`); test numbers are invented and round. GME prices (PUN) never enter a tracked
file (licence: private use only).

### 2.4 Isolation per user (security invariant)

Every repository function has the signature `(db: Db, userId: string, …)` and `userId` is in every
`WHERE` and join, updates and deletes included. `userId` comes only from `requireUser()` /
`getSessionUser()`, never from client input. An id that belongs to another user behaves as
missing (`NOT_FOUND`, page 404), never 403. `src/lib/db/repositories/scope.test.ts` fails on any
exported repository function with another signature and on any exported `const`/`let`/`var` (a
repository exports only `function` declarations and types); the one declared exception is
`reference-prices.ts` *(from spec 08)* (market data, no user rows). The only queries across users
are in `src/lib/db/maintenance/prune.ts` (used only by `pnpm documents:prune`, which matches the
file store against every user's documents) and, from spec 08, `reference-prices.ts`. Every new read or write of
user data ships the pair of tests «own resource passes / someone else's is refused».

### 2.5 Money, units and dates

Money is **integer euro cents**, signed (`*_cents`); unit prices are **integer micro-euros** per unit
(`*_micros`, 0,099000 €/kWh = 99000); physical quantities are `real`. Arithmetic on money is integer
with one `Math.round` at the end; splitting an amount uses `allocateCentsByWeights` (exact sums),
which lives with `unitPriceMicros`, `centsFromEuro` and `microsFromEuro` in `src/lib/domain/money.ts`.
Formatting and parsing of numbers and dates live only in `src/lib/format.ts`; components never
divide by 100 (the chart series in `src/lib/charts/series.ts` are the one other
place that converts to display units). Calendar days (billing periods, readings, due dates) are
`YYYY-MM-DD` strings with arithmetic at UTC midnight in `src/lib/domain/dates.ts`; instants
(`created_at`) are epoch ms UTC; "today" is `romeToday(Date.now())` computed by the caller. Tests run with `TZ=Europe/Rome`.

### 2.6 Foreign keys and deletes

SQLite/libSQL foreign keys are **off by default and per connection**, and a PRAGMA does not survive
between HTTP requests to remote Turso. So the app tables declare foreign keys **without ON DELETE
CASCADE**, services delete children explicitly in one `db.batch([...])` (child before parent), and
local databases (development, tests, Playwright) keep foreign keys ON so that a forgotten child
delete fails locally. What keeps them on is the local driver, which opens every connection with
them on (`@libsql/client` 0.18.0); the PRAGMA in `prepareLocalDatabase` reaches only the connection
that runs it, and `create-db.test.ts` reads the setting on several connections at once, so a driver
upgrade that turns them off goes red. Every table with `user_id` is also deleted in
`src/lib/services/user-data.ts` (`deleteAllUserData`, run by account deletion). Files on Blob are
deleted **after** their rows (an orphan file is recoverable with `pnpm documents:prune` *(from spec
06)*; a row without its file is not). Better Auth's own tables keep their cascade towards `users`.

### 2.7 Comments

Follow COMMENTS.md: a design comment at the top of a module that makes a non-obvious choice, a why
comment where the code looks wrong on purpose, checklist comments (`WARNING: … also update`) where
two places must change together, no TODO without an issue, no commented-out code.

## 3. Domain model *(stub; the guide is `doc/guide/calcoli.md`)*

One set of tables for every utility (`src/lib/db/schema/app.ts`): `houses` → `supplies` (kind
`electricity|gas|water|telecom|waste`, normalized identifier) → `bills` (status
`confirmed|replaced`) → `bill_lines` (each with **its own competence period**) and
`meter_readings`. The pure engine (`src/lib/engine/`, `buildSupplyMonths`) spreads each line
evenly over the days of its period, so recalculations land in their month; consumption = commodity
quantity; two unit prices (commodity net of VAT, total with VAT); the month total is net of the
fed-in credit. Vocabulary in `src/lib/domain/types.ts`; overlaps, replaced bills, bands, estimated
months, readings and photovoltaic in the guide.

## 4. Database

Turso/libSQL through `@libsql/client` (Node entry; `file:local.db` in development) and Drizzle.
`createDb({ url, authToken? })` in `src/lib/db/create-db.ts` builds a client (scripts and tests use
it; it is not `server-only`); `src/lib/db/client.ts` is the server singleton on `globalThis`;
`prepareLocalDatabase(client, url)` switches a `file:` database to WAL (and turns foreign keys on
for the connection that runs it, § 2.6) and does nothing on a remote one. The local driver keeps a **pool of connections** per client: a per-connection PRAGMA reaches
only the connection that ran it, so per-connection settings go through `createClient` options (the
busy timeout is `timeout: 5000` for `file:` URLs). Schema: `src/lib/db/schema/auth.ts` (Better Auth,
written by hand), `app.ts` (app tables), barrel `index.ts`.
Schema changes only through `pnpm db:generate` + a committed migration in `drizzle/`; never
`drizzle-kit push`. Production migrations run from the owner's machine **before** the merge that
needs them (`pnpm db:migrate:prod`, reads `.env.turso-prod`; `doc/guide/deploy.md` § 2). Multi-statement writes use
`db.batch([...])` (an implicit transaction), never interactive transactions (5 s lock on Turso).
Tests use a fresh temp **file** per test with the real migrations (`createTestDb()`), never
`:memory:` (it silently empties after a failed transaction).

## 5. Auth

Better Auth (email + password, no email verification, no OAuth). `createAuth` in
`src/lib/auth/create-auth.ts` is the factory (tests and the seed build one on their own DB; it never
reads `process.env`); `auth.ts` is the server instance; `/api/auth/[...all]` its route. Account
deletion: `beforeDelete` runs `deleteAllUserData`, `afterDelete` runs `afterUserDeleted` (its error
is logged, never fatal). Sign-up errors all show «Registrazione non riuscita. Riprova.» (no hint of
which emails exist); sign-in shows «Email o password non corretti.», or «Troppi tentativi. Riprova fra
qualche minuto.» on a 429. A page that reads `env.SIGNUP_ENABLED` calls `connection()` first, or Next
prerenders it with the build-time value. `SIGNUP_ENABLED` (closed when missing) feeds `disableSignUp`: the server refuses,
not only the UI. Sessions last 180 days; the rate limiter stores its counters in the database and
runs in production only. `src/proxy.ts` is an optimistic redirect (cookie presence), not a guard:
the `(app)` layout calls `getSessionUser()` and every Server Action and route handler starts with
`requireUser()`. The only list of public pages is `PUBLIC_PATHS` in `src/lib/auth/public-paths.ts`.
Next 16 (2026-10-24): the redirect lives in `src/proxy.ts` (not `middleware.ts`) and runs on Node;
`cookies()` and `headers()` are async; `cacheComponents` stays off.

## 6. Claude *(stub; guide `doc/guide/estrazione.md`)*

One extraction = one streamed call to `claude-opus-5-5` through `client.beta.messages.stream`, with
`fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`), `output_config: { effort: 'high',
format }` where `format` is `betaZodOutputFormat(ExtractionSchema)` without its `parse` (the
extractor checks `stop_reason` first, then validates with `ExtractionSchema.safeParse`),
`max_tokens: 32000`, `timeout` and `signal: AbortSignal.timeout(…)` from the 280 s deadline (the SDK
timeout covers only the wait for the headers) and `maxRetries: 0`. No `temperature` (400 since API
version 2026-10-21), no prefill, no forced `tool_choice`, no reasoning requested inside the schema.
The schema has no nullable fields (sentinels). An extraction starts only when the owner clicks
«Estrai», after seeing the estimate. No automatic retry: failures show «Riprova». Tokens and cost are
recorded (and summed across retries) on every call that returned usage. Nothing reaches the bill
tables without the owner's confirmation in the review. Files: one PDF (≤ 10 MB, ≤ 40 pages, not
encrypted) or up to 10 photos converted to JPEG in the browser (≤ 5 MB each, ≤ 20 MB together),
checked again on the stored bytes (size, magic bytes, SHA-256) before any use.

## 7. UI *(stub; guide `doc/guide/app.md`, visual system DESIGN.md, voice PRODUCT.md)*

Italian only, no i18n library. Tokens from DESIGN.md in `src/app/globals.css`; no literal colours in
components (the manifest is the one documented exception). `@theme` opens with `--color-*: initial`:
the default Tailwind palette does not exist and the `dark:` variant is never used (a dark value is a
token). Theme from the `theme` cookie (`system|light|dark`). Pages turn a foreign id into a 404
(`orNotFound`); Server Actions follow one shape (`doc/guide/app.md` § 3); deletions confirm in
`ConfirmDialog`, never `window.confirm`. Recharts only through `src/components/charts/recharts.ts`
(no other file imports `recharts`); every chart has a data-table alternative (`ChartFrame`'s «Vedi i
dati»), colours only as `var(--color-…)` tokens in `fill`/`stroke`, stacked charts with
`stackOffset="sign"`, no Recharts animation (guide `doc/guide/app.md` § 9). `data-testid` on what Playwright drives.

## 8. Deploy, Blob and PWA *(stubs; guides `doc/guide/deploy.md`, `doc/guide/pwa.md` from spec 09)*

Vercel Hobby in `dub1`, production = `main`, the build of every other branch skipped by the
`ignoreCommand` of `vercel.json` (exit 0 only for a known branch other than `main`: no preview
deployments; `VERCEL_ENV` is not set during that step, 2026-10-25); production open, Deployment Protection «Standard» (previews
only); Turso in `aws-eu-west-1`. Production migrations run from the owner's machine before the
merge (`pnpm db:migrate:prod`); every script that touches production goes through
`scripts/production-target.ts` (`loadProductionTarget()`, `.env.turso-prod`). Two **private** Blob
stores in `dub1`: `segnabollette-files` (Production) and `segnabollette-files-dev` (Development);
never `vercel blob create-store --yes`. Files go from the browser straight to Blob (`upload()` +
`handleUpload()`; function bodies stop at 4.5 MB); nothing depends on `onUploadCompleted` (it never
fires on localhost): the server verifies each file before using it. Rows are deleted before their
files; `pnpm documents:prune` finds what a failure left behind. *(From spec 09)* Serwist needs `next build --webpack`; `/api/*` is never cached; the offline page is
precached by hand; the offline queue is drained by the pages.

## 9. Testing

- Unit tests next to the module (`*.test.ts`), AAA, names as sentences. Every pure module has one.
- Repositories and services against `createTestDb()` (temp file, real migrations, foreign keys on)
  and `createTestUser(db, overrides?)`, both in `src/lib/db/testing/create-test-db.ts`; builders and
  probes for service tests (`billInput`, `commodityLine`, `createHouseWithSupply`,
  `snapshotUserRows` for the «someone else's rows stay identical» half of an isolation pair,
  `expectDomainError`) in `src/lib/db/testing/fixtures.ts`.
- `src/lib/db/repositories/scope.test.ts` reads the source of every repository and fails on an
  exported function whose parameters do not start with `(db: Db, userId: string` (whitespace
  ignored) or on any exported `const`/`let`/`var` (a typed or wrapped arrow hides its parameters);
  the only exempt file is `reference-prices.ts` *(from spec 08)*.
- Anthropic and Blob are never called in tests: fake client for the extractor, disk store and
  fixture extractions for Playwright (`E2E_FAKE_SERVICES=1`, `tests/fixtures/extractions/`); the
  service tests drive the same fakes through `src/lib/extraction/testing/` (`tempBlobStore`,
  `uploadFixture`, `runFixture`, `scriptedExtractor`, the fixture bytes and their SHA-256).
- Every test in a spec names the mutation that proves it load-bearing; a test that cannot go red is
  not a test. A mutation must still type-check: under Playwright the `webServer` build fails on a
  type error, and the red then proves nothing (2026-10-24, `{x && false && (…)}` in a page).
- Quantities are `real` (`0.1 + 0.2` is not `0.3`): assertions on a computed quantity use
  `toBeCloseTo`, assertions on money (integer cents and micro-euros) use `toBe` (2026-10-24).
- Playwright on a production build (:3100 open signup, :3101 closed), seed users
  `seed-a@example.test` / `seed-b@example.test`, login through `POST /api/auth/sign-in/email` with
  an `Origin` header; projects `mobile` (390×844) and `desktop`, `closed`, and `pwa` (from spec 09);
  axe (`tests/e2e/a11y.spec.ts`, WCAG 2.1 A/AA) on every page, light and dark; decoy words differ per
  test file (the list is in `doc/guide/app.md` § 8). The `webServer` command rebuilds
  `e2e.db` (`scripts/e2e-reset-db.mjs`), builds, and starts both servers on the same build
  (`scripts/e2e-servers.mjs`: 3101 first, then 3100); `tests/e2e/global-setup.ts` seeds the two users
  and saves their sessions in `playwright/.auth/seed-<a|b>.json`.
- Seed users A and B are read-only for Playwright: they serve the tests that only read (dashboard,
  isolation reads, a11y) and are never modified, signed out or deleted by a test. Every test that
  writes data (bills, readings, extractions, batches, offline queue, sign-out, account deletion)
  signs up its own user with `signUpTestUser(page, prefix)` from `tests/e2e/helpers.ts` and creates
  its house and supplies through the UI, so that the `mobile` and `desktop` runs and
  the order of the files never matter. In an isolation pair every write is made by users signed up
  in the test; a seed user may only read (as the intruder, or as the owner of a resource that is
  only read).

## 10. Commands *(see WORKFLOW.md § 3 for the table and the gate order)*

`pnpm typecheck`, `pnpm lint` (`lint:fix` writes), `pnpm test`, `pnpm build`, then `pnpm test:e2e`.
Database: `db:generate`, `db:migrate`, `db:studio`, `db:seed`, `db:migrate:prod`. Files:
`fixture:bills`, `documents:prune` (`-- --prod`, `-- --delete`). Later: `riferimenti:update`,
`riferimenti:pun` (08), `icons` (09).

## 11. Gotchas (measured; add the date to every new one)

- 2026-10-24 — libSQL `:memory:` is recreated empty after a failed transaction, and
  `file::memory:?cache=shared` shares one DB across clients: tests use a temp file (segnaprezzi).
- 2026-10-24 — Foreign keys are per connection and off on remote Turso: no cascade for app data
  (§ 2.6). The local driver of `@libsql/client` 0.18.0 opens every connection with them ON (0.17
  opened them OFF).
- 2026-10-24 — `@libsql/client` 0.18.0: a local client is a pool of up to 20 connections and
  `execute` awaits one, so it is no longer synchronous and a PRAGMA lands on one connection only
  (parallel reads of `foreign_keys` after an OFF gave `[1,1,0,1]`); new connections have
  `busy_timeout` 0. Per-connection settings go through `createClient` options (`timeout`).
- 2026-10-24 — Better Auth 1.7.12 compares the Drizzle schema with its own at startup and throws on a
  required column it never writes: the `accounts.issuer` that 1.7.0–1.7.2 needed must **not** exist.
  After a Better Auth upgrade, run `create-auth.test.ts`: if the error names a column, fix
  `src/lib/db/schema/auth.ts` to it, `pnpm db:generate`, commit the migration, date the change here.
- 2026-10-24 — `biome migrate` 2.6.2 rewrites `"rules": { "recommended": true }` as `"preset":
  "none"`, which silently turns the recommended rules off: `biome.json` says `"preset":
  "recommended"` (a `useOptionalChain` warning disappears under `none`).
- 2026-10-24 — Biome 2.6 formats and lints Markdown: `biome.json` turns it off
  (`markdown.formatter/linter.enabled: false`), or `lint:fix` rewrites every document.
- 2026-10-24 — `create-next-app@16.4.3` no longer writes `postcss.config.mjs` (it wires
  `@tailwindcss/turbopack` into turbopack rules, which `next build --webpack` ignores): the PostCSS
  config is hand-written and serves both dev and build.
- 2026-10-24 — pnpm 11 refuses packages younger than its minimum release age: on `pnpm add` it
  writes `minimumReleaseAgeExclude` into `pnpm-workspace.yaml`; keep those lines, a clean install
  from the lockfile needs them.
- 2026-10-24 — The project is CommonJS (no `"type": "module"`): no `import.meta` and no top-level
  await in a `.ts` that Playwright or `tsx` loads (Node 22 then treats the transpiled file as ESM:
  «exports is not defined»). A script's main guard is `require.main === module`.
- 2026-10-24 — Next renders an empty `role="alert"` (its route announcer) on every page: Playwright
  filters `getByRole('alert')` by text.
- 2026-10-24 — Windows: `corepack enable` fails with EPERM under `C:\Program Files\nodejs`; use
  `corepack enable --install-directory <a folder on PATH> pnpm`. libSQL keeps a test database file
  locked until the worker exits, so temp test folders may stay in `%TEMP%`.
- 2026-10-24 — Better Auth's in-memory rate limiter counts per Vercel instance: `storage: 'database'`.
- 2026-10-24 — Vercel Blob: access and region of a store cannot be changed after creation; the CLI
  defaults to `iad1`; `handleUpload` needs `BLOB_READ_WRITE_TOKEN`; `onUploadCompleted` does not fire
  on localhost.
- 2026-10-24 — Anthropic SDK 1.x (API 2026-10-21): `temperature` → 400; non-streaming requests with
  `max_tokens` above ~21,333 throw "Streaming is required".
- 2026-10-24 — `@serwist/next` is a webpack plugin: with Turbopack no `sw.js` is emitted and the
  build stays green.
- 2026-10-24 — Next 16 `next dev` rewrites AGENTS.md unless `agentRules: false`.
- 2026-10-24 — Windows checkouts: keep LF (`.gitattributes`), or Biome goes red on files nobody
  touched; `tsx --env-file-if-exists` (not `--env-file`, which crashes when the file is missing).
- 2026-10-24 — A throwaway `tsx` script outside the repo (the agent's scratchpad) resolves `@/…`
  with `--tsconfig tsconfig.json` but not bare packages: it may import only `@/lib/…` modules (and
  use `client.execute` for raw SQL), never `drizzle-orm` directly. A throwaway Playwright script
  there is a `.cjs` that loads it with `createRequire('<repo>/package.json')('@playwright/test')`
  (2026-10-25).
- 2026-10-24 — `src/lib/domain/bill-input.ts` sets zod's Italian locale globally
  (`z.config(z.locales.it())`) so that `VALIDATION` details are Italian; a schema whose messages
  must stay English writes them explicitly, as `src/lib/env-schema.ts` does.
- 2026-10-24 — Drizzle `db.batch` takes a non-empty tuple: services build their query list and
  run it through `runBatch` (`src/lib/services/batch.ts`), which skips an empty list. Likewise
  `insert().values([])` throws «values() must be called with at least one value» (drizzle-orm
  0.45.4): a service that may have nothing to insert skips the insert query.
- 2026-10-24 — zod 4: `.pick()` / `.omit()` throw on an object schema with a `refine`
  (`BillInputSchema`), and the build fails: an action schema that needs a few of its fields is a
  plain `z.object` of its own (`src/app/(app)/bollette/schemas.ts`).
- 2026-10-24 — Biome formats `pnpm-lock.yaml` and the committed lock is in its format: after
  `pnpm add`, run `pnpm exec biome format --write pnpm-lock.yaml` or `pnpm lint` is red.
- 2026-10-24 — Playwright: the body of a Server Action's response is gone once the page has
  reacted to it («No data found for resource»); a test reads it inside `page.route` with
  `route.fetch` + `route.fulfill` (`tests/e2e/isolamento.spec.ts`).
- 2026-10-24 — Next: a Server Component cannot call a function exported by a `'use client'` file
  («Attempted to call … from the server»), so a builder both sides need lives in a pure module
  (`src/components/bills/line-templates.ts`); a Client Component receives as a function only a
  Server Action (also `.bind`), never a closure written in the page; a `'use server'` file
  exports only async functions, so action schemas live in `schemas.ts` beside it.
- 2026-10-24 — Windows, Git Bash: an argument `/` given to `node` arrives as
  `C:/Program Files/Git/` (set `MSYS_NO_PATHCONV=1`; it breaks the pnpm shim, so `pnpm dlx vercel
  api` takes `MSYS2_ARG_CONV_EXCL` instead, 2026-10-25); stopping the agent's background task of
  `pnpm start` leaves the `node` child listening, so the port stays busy until that process is killed.
- 2026-10-24 — Recharts 3.10.1 with React 19 needs `react-is` 19.3.1 installed beside it (a peer
  dependency nothing in `src` imports): do not remove it as unused.
- 2026-10-24 — Each Playwright run builds for production: four in a row beside `next dev` and Chrome
  exhausted 16 GB, and Claude Code reaped the background `pnpm dev`. Its orphan `next dev` kept
  answering on :3000 with its workers dead (`POST /api/auth/sign-in/email` → 500, «Jest worker
  encountered 2 child process exceptions»): kill the project's `node` processes and restart
  `pnpm dev`; a tour script stops when the sign-in is not 200 instead of opening `/accedi`.
- 2026-10-25 — Vercel CLI 65.2.0: `vercel link --yes --project` also connects the GitHub repository
  (no `git connect` needed) and writes `VERCEL_OIDC_TOKEN` into `.env.local`; `blob create-store
  --environment development` rewrites `.env.local` with the Development variables (the development
  store's `BLOB_READ_WRITE_TOKEN`, local values kept). Both append `.vercel` and `.env*` to
  `.gitignore` (CRLF): `.env*` cancels the `!.env.example` exception, so `git checkout --
  .gitignore` after every such command. Linking a Blob store adds only `BLOB_READ_WRITE_TOKEN`.
- 2026-10-25 — `<project>.vercel.app` is assigned only by the first production deploy, but
  `src/lib/env.ts` validates `BETTER_AUTH_URL` at build: set it to the expected
  `https://<project>.vercel.app` before the first deploy and check the assigned domain after it.
- 2026-10-25 — Windows without WSL has no Turso CLI: the dashboard (app.turso.tech) creates the
  database and a token (read and write, no expiration); PowerShell has no `openssl`, the auth
  secret comes from `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- 2026-10-25 — Vercel after the first deploy: the first Git deployment of a new project goes to
  production whatever its branch; the Ignored Build Step of a Git deployment does not see
  `VERCEL_ENV`; the dashboard's «Sensitive» switch is off by default; CLI 65.2.0 deprecates the
  positional environment of `env rm` and `redeploy --target`. Details in `doc/guide/deploy.md` § 3–4.
- 2026-10-25 — `server-only` throws when `tsx` loads it: a module a CLI script imports
  (`src/lib/blob/vercel-blob-store.ts`, used by `documents:prune`) does not import it and takes its
  token as an argument; only the container, which is server-only, reads the environment.
- 2026-10-25 — unpdf 1.9.1: `PDFDocumentProxy` has no `destroy()` (`pdf.loadingTask.destroy()`
  frees it), and pdf.js may detach the buffer it is given: pass a copy.
- 2026-10-25 — Better Auth stores the email in lower case: an E2E that reads `e2e.db` by the email
  `signUpTestUser` returned (a nanoid, with capitals) lowercases it first.
- 2026-10-25 — axe `scrollable-region-focusable`: a box with `overflow-y-auto` whose content
  scrolls needs `tabIndex={0}` and a name (the review's photo column on desktop).
- 2026-10-25 — TypeScript 7 lib: `new Response(bytes)` refuses a `Uint8Array<ArrayBufferLike>`;
  `new Response(new Uint8Array(bytes))` (a copy on an `ArrayBuffer`) type-checks.
- 2026-10-25 — `pnpm dev` does not migrate `local.db`: after a spec with a migration the first
  page fails with «no such table» until `pnpm db:migrate` runs. In a guided verification's
  change of context, migrate first and read the dev server's log: an RSC payload can hold the
  expected text while the server logs the error.
- 2026-10-25 — A component placed both in a page and in a column (`BillForm` in the review) lays
  itself out with container queries (`@container`, `@md:`, `@3xl:`), not `md:`: the window's
  width says nothing about the column's.

## 12. Definition of done (per session)

Gates green (§ 10), the spec's § 7 verification done with the expected outcome stated first and the
outcome written in CLAUDE.md → Latest, the spec's `Stato` line and `doc/v1/00-INDICE.md § 5`
updated, § 9 documentation written, SESSION_NOTES.md folded and deleted, one commit after the
owner's OK (specs 05–09: the implementation commit before the merge, then the production
verification and a closing commit on `docs/<NN>-in-esercizio`, WORKFLOW.md § 3).
