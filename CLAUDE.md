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
- **Stack (decided 2026-10-24, nothing installed yet)**: Next.js 16 (App Router, `src/proxy.ts`,
  `next build --webpack`), React 19, TypeScript 7, pnpm 11, Turso + Drizzle (`@libsql/client`),
  Better Auth 1.7, zod 4, Biome, Vitest, Playwright, Recharts, Tailwind 4, Vercel Blob (private),
  `@anthropic-ai/sdk` with `claude-opus-5-5`, Serwist, Dexie. Vercel Hobby in `dub1`, Turso in
  `aws-eu-west-1`. Versions pinned in `doc/v1/00-INDICE.md` T-1.
- **Latest (2026-10-24)**: the retirement prompt of the v1 series written,
  `doc/v1/PROMPT-RITIRO.md` (from `claude-config/prompts/08_CREA_RITIRO_SPEC.md`, measured on the
  repo before any code; each retirement updates its precedents and measures in place).
  **Next**: spec 01, from the prompt at its end. Still open: none.

## Architecture Snapshot (as specified; nothing exists yet)
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
- **Access** (01): Better Auth email + password, `SIGNUP_ENABLED` closed by default, per-user
  isolation guarded by a test.
- **Data model and engine** (02): bills by competence (recalculations land in their month), bands
  from the bill's readings, two unit prices, readings after the last bill, photovoltaic
  self-consumption. → `doc/guide/calcoli.md`.
- **Manual entry** (03): houses and supplies, the bill form (`BillForm`, shared with the review),
  self-readings, settings with theme and account deletion; DESIGN.md and PRODUCT.md. →
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

## Testing (as specified)
Vitest for pure modules, repositories and services (temp-file libSQL with the real migrations,
foreign keys on), synthetic generated bill fixtures, never the real services; Playwright on a
production build with fake Blob and extractor, two seed users, axe. Commands: WORKFLOW.md § 3.

## Data & Integrations
Anthropic Messages API (`claude-opus-5-5`, key on the owner's personal Console organization) ·
Vercel Blob (private) · Turso · Vercel Hobby · ARERA open data (CC BY-SA 4.0) · GME PUN Index (private
use, never redistributed).

## Known Issues (Active)
None: no code yet.

## Not yet present (do not assume it exists)
- Any code, `package.json`, migrations: the repo is documentation and specs until spec 01.
- DESIGN.md and PRODUCT.md: born in spec 03 with the impeccable skill, never hand-written after.
- SETUP.md: born in spec 05. `Draft Release Temp.md`: born at the first session end.
- `doc/guide/*`: each guide is born with its spec (calcoli 02, app 03, deploy 05, estrazione 06,
  riferimenti 08, pwa 09).
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
Not yet: DESIGN.md and PRODUCT.md are written by the impeccable skill in spec 03. Until then: theme
follows the system (light and dark both designed), mobile-first (390 px), Italian UI, figures as
legible as a bank statement.
