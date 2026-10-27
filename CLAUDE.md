# CLAUDE.md — segnabollette

> **Read [WORKFLOW.md](WORKFLOW.md) before starting**: standing session rules (one branch and one
> commit per session, never commit without approval, answer in Italian) and the guided-verification
> protocol. A new rule stated in a session is added there, in that session's commit.

## Project Overview
A tracker of household utility bills and prices — electricity, gas, water, and flat-fee utilities
(internet/phone, TARI) — grouped by house. Bills are entered by hand or uploaded as a PDF or photos:
Claude extracts every line (period, consumption per band, readings, unit prices, fixed shares,
system charges, taxes, recalculations, estimated vs actual) and the owner confirms them in a review
screen before anything is stored; the file is kept on private Vercel Blob. Meter self-readings fill
the days between bills. The dashboard shows, per supply and per house, consumption, the commodity and
total unit price, costs by category and year over year, against market references (PUN Index GME,
PSV/CMEM, ARERA prices for vulnerable customers). Multi-user with closable registration;
installable PWA with an offline queue. Open source, AGPL-3.0.

**This file is the INDEX**: "what it is + where it lives", under 20,000 characters (ceiling 40,000;
it is injected into every turn). Repo-wide conventions live in **AGENTS.md**; per-area rules in
**`doc/guide/<tema>.md`** (born with the specs); the session rules in **WORKFLOW.md**; what the user
sees in **README.md**; the v1 plan in **`doc/v1/`** (index `00-INDICE.md`).

> **Language**: this file, AGENTS.md, WORKFLOW.md, README.md and SETUP.md are in English; the specs,
> the chat and the UI are in Italian; code and comments in English.

## Current Status
- **Stack (decided 2026-10-24)**: Next.js 16 (App Router, `src/proxy.ts`,
  `next build --webpack`), React 19, TypeScript 7, pnpm 11, Turso + Drizzle (`@libsql/client`),
  Better Auth 1.7, zod 4, Biome, Vitest, Playwright, Recharts, Tailwind 4, Vercel Blob (private),
  `@anthropic-ai/sdk` with `claude-opus-5-5`, Serwist, Dexie. Production on Vercel Hobby in `dub1`
  (`main` only, other builds skipped by `vercel.json`), Turso in `aws-eu-west-1`, migrated from the
  owner's machine (`pnpm db:migrate:prod`, `scripts/production-target.ts`) → `doc/guide/deploy.md`,
  SETUP.md. Versions pinned in `doc/v1/00-INDICE.md` T-1.
- **Latest (2026-10-27)**: spec 07 in service (PR #18): the bulk import (`/bollette/importa`,
  `doc/guide/estrazione.md` § 13). Verified locally (A, C, D, G; the tour skipped by the owner) and
  in production on a batch of 12 real bills: 12 extracted and confirmed from the batch review, 2,00 $
  against a 3,74 $ estimate. The owner's other past bills were read by hand and written with
  `confirmBill` after the owner confirmed them in chat (the owner's choice; no files attached).
  The zod override in `pnpm-workspace.yaml` (`doc/guide/dipendenze.md`) held in production.
  In the same closing session, at the owner's request: the unit price hides the total of a month
  of low consumption, year over year follows the range (lines per calendar year over 24 months
  and everything), the people in each house over time (migration 0003, marks on the cost charts,
  per-person tiles), and gas reviews no longer carry a band. **Still open**: a re-billed month and the «IVA inclusa» warning still await a real extraction
  (`doc/guide/estrazione.md` § 11). **Next**: retire spec 07, then spec 08.

## Architecture Snapshot (database, access, test harness, data model, engine, the manual-entry UI, the dashboard, the extraction and the bulk import exist; the rest as specified)
- **Exists**: `src/lib/env-schema.ts` + `env.ts` (the only reader of `process.env`);
  `src/lib/db/create-db.ts` (`createDb`, `prepareLocalDatabase`) + `client.ts` (server singleton),
  `schema/auth.ts` (Better Auth tables) and `schema/app.ts` (app tables), migrations in `drizzle/`;
  `src/lib/auth/*` (`createAuth` factory, `auth`, `getSessionUser`/`requireUser`, `PUBLIC_PATHS`,
  `safeNextPath`); `src/proxy.ts` (optimistic redirect on cookie presence); pages `/accedi` and
  `/registrati`, and the `(app)` layout guard; `src/lib/container.ts`
  (`getDb`); `src/lib/errors.ts`; `src/lib/services/user-data.ts` (`deleteAllUserData`).
- **Model** (exists): repositories `houses`, `supplies`, `bills`, `readings`, `household-sizes`
  and services `houses-supplies.ts`, `bills.ts` (`confirmBill` with overlaps and replaced bills),
  `readings.ts`, `household.ts` (the people in a house over time);
  `src/lib/domain/*` (types, dates, money, `BillInputSchema`, checks), `src/lib/format.ts`.
- **Engine** (exists): `src/lib/engine/*` — `buildSupplyMonths`, `buildHouseMonths`, `rolling12`,
  `yearOverYear`, pure; seed data in `scripts/seed-data.ts` (`buildSeedBills`).
- **UI** (exists): `src/components/shell/app-shell.tsx` (client, bottom bar on phones, side bar on
  desktops); pages `/`, `/forniture`, `/forniture/[id]`, `/bollette`, `/bollette/nuova`,
  `/bollette/[id]`, `/bollette/[id]/modifica`, `/letture`, `/impostazioni` with colocated
  `actions.ts` + `schemas.ts`; `src/app/(app)/page-helpers.ts` (`orNotFound` → 404);
  `src/components/bills/bill-form.tsx` (`BillForm`, the one form of manual entry and review, over the
  string draft of `bill-draft.ts` and the templates of `line-templates.ts`);
  `src/components/readings/self-reading-form.tsx`; primitives in `src/components/ui/*`; icons in
  `src/components/icons/*`; tokens in `src/app/globals.css`; logo `public/brand/logo.svg`.
- **Dashboard** (exists): `src/lib/services/dashboard.ts` (`getSupplyDashboard`,
  `getHouseDashboard`), pure chart points in `src/lib/charts/series.ts` (euros and €/unit, the
  `ReferenceLine` type), charts in `src/components/charts/*` (`recharts.ts` the only Recharts
  import, `ChartFrame` with its «Vedi i dati» table, `ConsumptionChart`, `UnitPriceChart`,
  `CostsChart`, `YearOverYearChart`, `KpiTile`, `PeriodSelector`) on `/` and `/forniture/[id]`;
  the household per month and its day-weighted average in `src/lib/engine/household.ts`, edited
  by `src/components/houses/household-editor.tsx` on `/forniture`.
- **Extraction** (exists): `src/lib/blob/*` (`BlobStore`, Vercel and disk stores, `upload-client.ts`),
  `src/lib/extraction/*` (schema with sentinels, prompt, pricing, Anthropic and fake extractors,
  `verify-document`, `validate`, `to-bill-input`, `testing/`), repositories `documents` and
  `extractions`, service `extractions.ts`, routes under `src/app/api/{extractions,bills,documents,e2e}`
  (`toErrorResponse` in `src/lib/http/error-status.ts`), pages `/bollette/carica`,
  `/bollette/da-rivedere`, `/bollette/revisione/[id]`, components in `src/components/upload/*`;
  `scripts/make-bill-fixtures.ts`, `scripts/prune-documents.ts` + `src/lib/db/maintenance/prune.ts`.
- **Bulk import** (exists): page `/bollette/importa`, `src/components/import/*` (`BulkImporter`,
  `useWakeLock`), the pure queue `src/lib/import/queue-runner.ts` (`runQueue`,
  `toQueueItemResult`); batch services in `src/lib/services/extractions.ts` (`listBatches`,
  `listBatchExtractions`, `nextExtractionToReview`, `listImportSupplies`).
- `src/app` (pages, Server Actions, route handlers: thin) → `src/lib/services` (use cases) →
  `src/lib/db/repositories` (Drizzle only, `(db, userId, …)`); pure `src/lib/domain` (types, dates,
  money, bill input and checks) and `src/lib/engine` (monthly series). Gateways:
  `src/lib/extraction/anthropic-extractor.ts`, `src/lib/blob/vercel-blob-store.ts`; services reach
  them through `src/lib/container.ts` (fakes under `E2E_FAKE_SERVICES=1`).
- Data: one schema for every utility — `houses`, `supplies`, `bills`, `bill_lines` (each line with
  its own competence period), `meter_readings`, `household_sizes`; `documents` and `extractions`;
  `reference_prices` (08, PUN only). No ON DELETE CASCADE on app tables (Turso does not enforce
  foreign keys): explicit deletes. Money in integer cents, unit prices in integer micro-euros,
  calendar days as `YYYY-MM-DD`.

## Key Features (planned; each line becomes real with its spec)
- **Access** (exists since 2026-10-24): Better Auth email + password, `SIGNUP_ENABLED` closed by default,
  per-user isolation guarded by a test.
- **Data model and engine** (exists since 2026-10-24): bills by competence (recalculations land in their month), bands
  from the bill's readings, two unit prices, readings after the last bill, photovoltaic
  self-consumption. → `doc/guide/calcoli.md`.
- **Manual entry** (exists since 2026-10-24): houses and supplies, the bill form (`BillForm`, shared
  with the review; new bills start with empty amounts), overlaps that add or replace, self-readings
  with banded registers and a warning on a lower value, settings with theme and account deletion. →
  `doc/guide/app.md`.
- **Dashboard** (exists since 2026-10-24): four Recharts charts per supply — consumption per month
  (bands, estimated months, readings not yet billed, photovoltaic), unit price (commodity and
  total), costs by category (fed-in credit below zero), year over year with the 12-month tiles —
  and on «Casa» the house costs, two tiles and the last billed month on each card; 12 / 24 months /
  everything, a data table under every chart. → `doc/guide/app.md` § 9, `doc/guide/calcoli.md`
  § 8, § 13.
- **People in the house** (exists since 2026-10-27): a timeline per house typed on «Forniture»
  («dal <data> N persone»), a mark on the cost charts where it changes, and per-person tiles over
  the 12 months when the people are known on every day. → `doc/guide/calcoli.md` § 14.
- **Production** (exists since 2026-10-25): Vercel, Turso, two private Blob stores, SETUP.md. → `doc/guide/deploy.md`.
- **Extraction** (exists since 2026-10-25): PDF or up to 10 photos to private Blob, Claude Opus 5.5
  only at the click on «Estrai» after the estimate, review and confirm, files reopened from the bill,
  cost recorded. → `doc/guide/estrazione.md`.
- **Bulk import** (exists since 2026-10-27): up to 50 bills at once, duplicates skipped in the
  browser, the estimate before «Avvia estrazione», a queue of two run by the browser with the
  screen kept on, a pause when Anthropic does not answer, batches resumed from «Lotti in sospeso»,
  the review from the oldest bill with «Conferma e passa alla prossima». →
  `doc/guide/estrazione.md` § 13.
- **Market references** (08): ARERA files committed (CC BY-SA), PUN from a hand-downloaded GME zip
  into the database only. → `doc/guide/riferimenti.md`.
- **PWA** (09): manifest, service worker, offline queue for bills and self-readings. →
  `doc/guide/pwa.md`.

## Testing (harness exists; the suites grow with each spec)
Vitest for pure modules, repositories and services (`createTestDb()`: temp-file libSQL with the
real migrations, foreign keys on); `scope.test.ts` guards the `(db, userId, …)` signature of every
repository. Playwright on a production build, :3100 open signup and :3101 closed, `file:e2e.db`,
two read-only seed users with invented houses, supplies and bills (`pnpm db:seed`); writing tests
sign up their own user (`tests/e2e/helpers.ts`); axe on every page, light and dark. Synthetic bill
fixtures (`pnpm fixture:bills`), fake Blob and extractor (`E2E_FAKE_SERVICES=1`). Never the real
services. Commands:
WORKFLOW.md § 3.

## Data & Integrations
Anthropic Messages API (`claude-opus-5-5`, key on the owner's personal Console organization) ·
Vercel Blob (private) · Turso · Vercel Hobby · ARERA open data (CC BY-SA 4.0) · GME PUN Index (private
use, never redistributed).

## Known Issues (Active)
None.

## Not yet present (do not assume it exists)
- `doc/guide/*` beyond `calcoli.md`, `app.md`, `deploy.md` and `estrazione.md`: each guide is born
  with its spec (riferimenti 08, pwa 09).
- Password reset and email verification: no outbound email.
- Water bills: never tried on a real bill (the owner's water is in the condominium fees); the first
  real one comes with the new house.
- Bills covering more than one supply in one document ("dual"): only the first supply is extracted.
- Bulk import from a folder or a mailbox; multi-page photographed bills inside a bulk import (one by
  one from /bollette/carica).
- Prompt caching for the extraction; Message Batches API for the bulk import.
- Self-readings from a photo of the meter: self-readings are typed by hand.
- Seasonal withdrawal profiles for gas (consumption is spread evenly per day).
- 4 October in the band calendar: unverified until the October 2027 GME PDF.
- Automatic PUN download (forbidden by GME terms without written permission); STG prices; ARERA
  "cliente tipo"; per-month calorific value; any water reference (no national series).
- Push notifications, dashboard offline, Web Share Target, app badge.
- Data export, duplicating a bill as next month's template, drag-and-drop line ordering.
- Daily charts, zoom, comparisons between supplies of different houses, forecasts of the next bill.
- Custom domain, backups beyond Turso's free 1-day restore, alerting.
- Out of scope for v1 (owner's decision): guided supplier switching or offer comparison, home
  automation and automatic smart-meter readings, sharing between users, paying bills, any change to
  the database without confirmation.

## Key Files
- `doc/v1/00-INDICE.md` — the series index: theme, decisions D-N, choices T-N, order, shared
  contracts C-N, series rules. `doc/v1/NN-*.md` — one spec per implementation session.
  `doc/v1/PROMPT-RITIRO.md` — the prompt that retires a spec once it is in service.
- `COMMENTS.md`, `DEVELOPMENT_GUIDELINES.md` — binding for every line of code.

## Design Context
**PRODUCT.md** (who, voice, what to avoid) and **DESIGN.md** (the «Libretto di risparmio» world:
pale paper ground, bottle-green cloth, violet stamps for states; tokens light and dark, chart
tokens, type, components) are the visual authority, written and kept by the impeccable skill —
never hand-edited. Theme follows the system (light and dark both designed), mobile-first (390 px),
Italian UI, figures as legible as a bank statement.
