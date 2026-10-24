# AGENTS.md — Operating manual for coding agents

> Read **WORKFLOW.md** first (session rules, guided verification). This file is the core of the
> repo-wide rules; domain narratives go to `doc/guide/<tema>.md` as they are born (a stub stays
> here). Written on 2026-10-24, before any code: every rule below holds from spec 01 on; a section
> marked *(from spec NN)* describes what that spec installs and is updated by it.

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
explicitly. `src/lib/db/repositories/*` is the only place that writes SQL (Drizzle).
`src/lib/domain/*` and `src/lib/engine/*` are pure: no Drizzle, no `next/*`, no `fetch`, no clock
(they take `today`/`now` as parameters). Gateways: `src/lib/extraction/anthropic-extractor.ts` is the
only file importing `@anthropic-ai/sdk`; `src/lib/blob/vercel-blob-store.ts` the only server file
importing `@vercel/blob`; `src/components/charts/recharts.ts` the only file importing `recharts`.
The app reaches external services through `src/lib/container.ts` (`getDb`, `getBlobStore`,
`getBillExtractor`; fakes under `E2E_FAKE_SERVICES=1`); CLI scripts in `scripts/` build their
clients directly and never import `server-only` modules (`env.ts`, `db/client.ts`, `auth/auth.ts`).
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
every variable with an empty value; `src/lib/env-schema.ts` is the zod schema, `src/lib/env.ts` the
server-only instance and the only reader of `process.env` in the app. Secret values never pass
through the chat: the owner types them. **Nothing of the owner's data in a tracked file, commit or
PR** (WORKFLOW § 1.6, public repo, no exception): no real bill, POD, PDR, invoice number, customer
code, address, supplier of the owner or amount. Bill fixtures are synthetic and generated
(`pnpm fixture:bills`); test numbers are invented and round. GME prices (PUN) never enter a tracked
file (licence: private use only).

### 2.4 Isolation per user (security invariant)

Every repository function has the signature `(db: Db, userId: string, …)` and `userId` is in every
`WHERE` and join, updates and deletes included. `userId` comes only from `requireUser()` /
`getSessionUser()`, never from client input. An id that belongs to another user behaves as
missing (`NOT_FOUND`, page 404), never 403. `src/lib/db/repositories/scope.test.ts` fails on any
exported repository function with another signature; the one declared exception is
`reference-prices.ts` (market data, no user rows). Every new read or write of user data ships the
pair of tests «own resource passes / someone else's is refused».

### 2.5 Money, units and dates

Money is **integer euro cents**, signed (`*_cents`); unit prices are **integer micro-euros** per unit
(`*_micros`, 0,099000 €/kWh = 99000); physical quantities are `real`. Arithmetic on money is integer
with one `Math.round` at the end; splitting an amount uses `allocateCentsByWeights` (exact sums).
Formatting and parsing of numbers and dates live only in `src/lib/format.ts`; components never
divide by 100 (the chart series in `src/lib/charts/series.ts` are the one other place that converts
to display units). Calendar days (billing periods, readings, due dates) are `YYYY-MM-DD` strings with
arithmetic at UTC midnight in `src/lib/domain/dates.ts`; instants (`created_at`) are epoch ms UTC;
"today" is `romeToday(Date.now())` computed by the caller. Tests run with `TZ=Europe/Rome`.

### 2.6 Foreign keys and deletes

SQLite/libSQL foreign keys are **off by default and per connection**, and a PRAGMA does not survive
between HTTP requests to remote Turso. So the app tables declare foreign keys **without ON DELETE
CASCADE**, services delete children explicitly in one `db.batch([...])` (child before parent), and
local databases (development, tests, Playwright) turn `PRAGMA foreign_keys = ON` so that a forgotten
child delete fails locally. Every table with `user_id` is also deleted in
`src/lib/services/user-data.ts` (`deleteAllUserData`, run by account deletion). Files on Blob are
deleted **after** their rows (an orphan file is recoverable with `pnpm documents:prune`; a row
without its file is not). Better Auth's own tables keep their cascade towards `users`.

### 2.7 Comments

Follow COMMENTS.md: a design comment at the top of a module that makes a non-obvious choice, a why
comment where the code looks wrong on purpose, checklist comments (`WARNING: … also update`) where
two places must change together, no TODO without an issue, no commented-out code.

## 3. Domain model *(from spec 02 — stub; the guide is `doc/guide/calcoli.md`)*

One set of tables for every utility: `houses` → `supplies` (kind `electricity|gas|water|telecom|waste`,
identifier = normalized POD/PDR/utility code) → `bills` (billing period, totals, gas C and PCS,
status `confirmed|replaced`) → `bill_lines` (category, component, **own competence period**,
quantity, unit price, amount, band, recalculation and estimate flags) and `meter_readings`
(register, value, source). The engine spreads each line evenly over the days of its own period, so
recalculations land in their month; consumption = commodity quantity; the two unit prices are
commodity (net of VAT) and total (VAT included) per unit. Vocabulary in `src/lib/domain/types.ts`.

## 4. Database *(from spec 01)*

Turso/libSQL through `@libsql/client` (Node entry; `file:local.db` in development) and Drizzle.
Schema changes only through `pnpm db:generate` + a committed migration in `drizzle/`; never
`drizzle-kit push`. Production migrations run from the owner's machine **before** the merge that
needs them (`pnpm db:migrate:prod`, reads `.env.turso-prod`). Multi-statement writes use
`db.batch([...])` (an implicit transaction), never interactive transactions (5 s lock on Turso).
Tests use a fresh temp **file** per test with the real migrations (`createTestDb()`), never
`:memory:` (it silently empties after a failed transaction).

## 5. Auth *(from spec 01)*

Better Auth (email + password, no email verification, no OAuth). `createAuth` in
`src/lib/auth/create-auth.ts` is the factory (tests build one on a temp DB); `auth.ts` is the
server instance. `SIGNUP_ENABLED` (closed when missing) feeds `disableSignUp`: the server refuses,
not only the UI. Sessions last 180 days; the rate limiter stores its counters in the database and
runs in production only. `src/proxy.ts` is an optimistic redirect (cookie presence), not a guard:
the `(app)` layout calls `getSessionUser()` and every Server Action and route handler starts with
`requireUser()`. The only list of public pages is `PUBLIC_PATHS` in `src/lib/auth/public-paths.ts`.

## 6. Claude *(from spec 06 — stub; guide `doc/guide/estrazione.md`)*

One extraction = one streamed call to `claude-opus-5-5` through `client.beta.messages.stream`, with
`fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`), `output_config: { effort: 'high',
format: betaZodOutputFormat(ExtractionSchema) }`, `max_tokens: 32000`, a timeout from the 280 s
deadline and `maxRetries: 0`. No `temperature` (400 since API version 2026-10-21), no prefill, no
forced `tool_choice`, no reasoning requested inside the schema. The schema has no nullable fields
(sentinels). No automatic retry: failures show «Riprova». Tokens and cost are recorded on every
call that returned usage. Nothing reaches the bill tables without the owner's confirmation in the
review.

## 7. UI *(from spec 03 — stub; guide `doc/guide/app.md`, visual system DESIGN.md)*

Italian only, no i18n library. Tokens from DESIGN.md in `src/app/globals.css`; no literal colours in
components (the manifest is the one documented exception). Theme from the `theme` cookie
(`system|light|dark`). Recharts only through `src/components/charts/recharts.ts`; every chart has a
data-table alternative. `data-testid` on what Playwright drives.

## 8. Deploy, Blob and PWA *(from specs 05, 06, 09 — stubs; guides `doc/guide/deploy.md`, `doc/guide/pwa.md`)*

Vercel Hobby in `dub1`, production = `main`, `feature/*` branches not deployed; Turso in
`aws-eu-west-1`. Two **private** Blob stores: `segnabollette-files` (Production) and
`segnabollette-files-dev` (Development); never `vercel blob create-store --yes`. Files go from the
browser straight to Blob (`upload()` + `handleUpload()`; function bodies stop at 4.5 MB); nothing
depends on `onUploadCompleted` (it never fires on localhost): the server verifies each file before
using it. Serwist needs `next build --webpack`; `/api/*` is never cached; the offline page is
precached by hand; the offline queue is drained by the pages.

## 9. Testing

- Unit tests next to the module (`*.test.ts`), AAA, names as sentences. Every pure module has one.
- Repositories and services against `createTestDb()` (temp file, real migrations, foreign keys on).
- Anthropic and Blob are never called in tests: fake client for the extractor, disk store and
  fixture extractions for Playwright (`E2E_FAKE_SERVICES=1`, `tests/fixtures/extractions/`).
- Every test in a spec names the mutation that proves it load-bearing; a test that cannot go red is
  not a test.
- Playwright on a production build (:3100 open signup, :3101 closed), seed users
  `seed-a@example.test` / `seed-b@example.test`, login through `POST /api/auth/sign-in/email` with
  an `Origin` header; projects `mobile` (390×844) and `desktop`, `closed`, and `pwa` (from spec 09);
  axe on every page from spec 03; decoy words differ per test file.

## 10. Commands *(installed by spec 01; see WORKFLOW.md § 3 for the table and the gate order)*

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, then `pnpm test:e2e`. Database:
`db:generate`, `db:migrate`, `db:migrate:prod`, `db:studio`, `db:seed`. Later: `fixture:bills`,
`documents:prune`, `riferimenti:update`, `riferimenti:pun`, `icons`.

## 11. Gotchas (measured; add the date to every new one)

- 2026-10-24 — libSQL `:memory:` is recreated empty after a failed transaction, and
  `file::memory:?cache=shared` shares one DB across clients: tests use a temp file (segnaprezzi).
- 2026-10-24 — Foreign keys are off by default on Turso/libSQL and per connection: no cascade for
  app data (§ 2.6).
- 2026-10-24 — The Better Auth schema CLI lags the core: `accounts.issuer` must exist or signup
  fails at runtime; the schema is written by hand.
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

## 12. Definition of done (per session)

Gates green (§ 10), the spec's § 7 verification done with the expected outcome stated first and the
outcome written in CLAUDE.md → Latest, the spec's `Stato` line and `doc/v1/00-INDICE.md § 5`
updated, § 9 documentation written, SESSION_NOTES.md folded and deleted, one commit after the
owner's OK.
