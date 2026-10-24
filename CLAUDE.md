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
  `@anthropic-ai/sdk` with `claude-opus-5-5`, Serwist, Dexie. Vercel Hobby in `dub1`, Turso in
  `aws-eu-west-1`. Versions pinned in `doc/v1/00-INDICE.md` T-1.
- **Latest (2026-10-24)**: spec 03 (design, houses and supplies, manual entry, self-readings,
  settings) implemented on `feature/03-design-manual-entry`; guided verification A–G passed, tour
  closed with no findings. Documented in `doc/guide/app.md`, DESIGN.md and PRODUCT.md. **Next**:
  the PR of this branch, then spec 04 (its session records spec 03's PR in the status lines).
  Still open: none.

## Architecture Snapshot (database, access, test harness, data model, engine and the manual-entry UI exist; the rest as specified)
- **Exists**: `src/lib/env-schema.ts` + `env.ts` (the only reader of `process.env`);
  `src/lib/db/create-db.ts` (`createDb`, `prepareLocalDatabase`) + `client.ts` (server singleton),
  `schema/auth.ts` (Better Auth tables) and `schema/app.ts` (app tables), migrations in `drizzle/`;
  `src/lib/auth/*` (`createAuth` factory, `auth`, `getSessionUser`/`requireUser`, `PUBLIC_PATHS`,
  `safeNextPath`); `src/proxy.ts` (optimistic redirect on cookie presence); pages `/accedi`,
  `/registrati` and the placeholder `/` behind the `(app)` layout guard; `src/lib/container.ts`
  (`getDb`); `src/lib/errors.ts`; `src/lib/services/user-data.ts` (`deleteAllUserData`).
- **Model** (exists): repositories `houses`, `supplies`, `bills`, `readings` and services
  `houses-supplies.ts`, `bills.ts` (`confirmBill` with overlaps and replaced bills), `readings.ts`;
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
- `src/app` (pages, Server Actions, route handlers: thin) → `src/lib/services` (use cases) →
  `src/lib/db/repositories` (Drizzle only, `(db, userId, …)`); pure `src/lib/domain` (types, dates,
  money, bill input and checks) and `src/lib/engine` (monthly series). Gateways:
  `src/lib/extraction/anthropic-extractor.ts`, `src/lib/blob/vercel-blob-store.ts`; services reach
  them through `src/lib/container.ts` (fakes under `E2E_FAKE_SERVICES=1`).
- Data: one schema for every utility — `houses`, `supplies`, `bills`, `bill_lines` (each line with
  its own competence period), `meter_readings`; `documents` and `extractions` (06);
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
- **Dashboard** (04): consumption per month, unit price over time, costs by category, year over
  year (Recharts).
- **Production** (05): Vercel, Turso, two private Blob stores, SETUP.md. → `doc/guide/deploy.md`.
- **Extraction** (06): PDF or up to 10 photos to private Blob, Claude Opus 5.5, review and confirm,
  files reopened from the bill, cost recorded. → `doc/guide/estrazione.md`.
- **Bulk import** (07): browser-driven queue with a cost estimate before starting.
- **Market references** (08): ARERA files committed (CC BY-SA), PUN from a hand-downloaded GME zip
  into the database only. → `doc/guide/riferimenti.md`.
- **PWA** (09): manifest, service worker, offline queue for bills and self-readings. →
  `doc/guide/pwa.md`.

## Testing (harness exists; the suites grow with each spec)
Vitest for pure modules, repositories and services (`createTestDb()`: temp-file libSQL with the
real migrations, foreign keys on); `scope.test.ts` guards the `(db, userId, …)` signature of every
repository. Playwright on a production build, :3100 open signup and :3101 closed, `file:e2e.db`,
two read-only seed users with invented houses, supplies and bills (`pnpm db:seed`); writing tests
sign up their own user (`tests/e2e/helpers.ts`); axe on every page, light and dark. Later:
synthetic bill fixtures, fake Blob and extractor. Never the real services. Commands:
WORKFLOW.md § 3.

## Data & Integrations
Anthropic Messages API (`claude-opus-5-5`, key on the owner's personal Console organization) ·
Vercel Blob (private) · Turso · Vercel Hobby · ARERA open data (CC BY-SA 4.0) · GME PUN Index (private
use, never redistributed).

## Known Issues (Active)
None.

## Not yet present (do not assume it exists)
- SETUP.md: born in spec 05.
- `doc/guide/*` beyond `calcoli.md` and `app.md`: each guide is born with its spec (deploy 05,
  estrazione 06, riferimenti 08, pwa 09).
- Password reset and email verification: no outbound email.
- Water bills: never tried on a real bill (the owner's water is in the condominium fees); the first
  real one comes with the new house.
- Bills covering more than one supply in one document ("dual"): only the first supply is extracted.
- Prompt caching for the extraction; Message Batches API for the bulk import.
- Seasonal withdrawal profiles for gas (consumption is spread evenly per day).
- 4 October in the band calendar: unverified until the October 2027 GME PDF.
- Automatic PUN download (forbidden by GME terms without written permission); STG prices; ARERA
  "cliente tipo"; per-month calorific value; any water reference (no national series).
- Push notifications, dashboard offline, Web Share Target, app badge.
- Data export, duplicating a bill as next month's template, drag-and-drop line ordering.
- Daily charts, zoom, forecasts of the next bill.
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
