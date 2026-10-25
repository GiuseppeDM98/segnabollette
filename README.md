# segnabollette

Track your household utility bills and prices — electricity, gas, water, internet/phone and the
waste tax — and see whether your offer is a good one. Multi-user with closable registration,
self-hosted on Vercel + Turso, installable on your phone as a PWA.

> **Status (2026-10-25)**: access (sign-up, sign-in, closable registration), houses and supplies,
> bills typed by hand, self readings, settings and the charts per supply and per house run in
> production on Vercel + Turso, on the data model and the calculation engine; extraction and the
> rest of the v1 are specified in [`doc/v1/`](doc/v1/) and are being implemented one spec at a
> time. Not affiliated with any utility, ARERA or GME.

## What it does

- **Every bill, line by line.** Type a bill in, or upload its PDF or a few photos: Claude
  (`claude-opus-5-5`) extracts the billing period, consumption per time band, meter readings, unit
  prices, fixed shares, network and system charges, taxes, VAT, recalculations and estimates, and
  you confirm everything in a review screen before it is stored. The file stays in your private
  storage and reopens from the bill.
- **Houses, supplies and self readings.** Group your supplies by house (electricity, gas, water,
  internet and phone, TARI). A bill typed by hand starts from the lines of its utility, with the
  amounts left empty for you to fill; between two bills you note the meter yourself (F1, F2 and F3
  when the meter is banded), and a value lower than the last one asks you to confirm.
- **Recalculations where they belong.** Italian bills re-bill past months; each line keeps its own
  period, so an adjustment printed in September corrects August.
- **Charts per supply and per house.** Consumption per month (kWh per band, Smc, m³), the price of
  the commodity alone and the total cost per unit, costs by category, year over year — with
  photovoltaic self-consumption when you have panels. Over 12 months, 24 months or everything,
  each chart with its figures as a table.
- **Against the market.** Your commodity price next to the PUN Index GME, the PSV (ARERA's CMEM) and
  ARERA's prices for vulnerable customers. Water has no national reference, and the app says so.
- **Bulk import and offline.** Queue dozens of past bills with a cost estimate before starting;
  photograph a bill or read a meter without signal, and it uploads when you are back online.

The user interface is in Italian (the bills, the regulator and the market are Italian). The
documentation for contributors and agents is in English; the specs in `doc/v1/` are in Italian.

## Privacy

Bills contain personal data. They are stored in a **private** Vercel Blob store of your own
deployment and sent to the Anthropic API only for extraction, with your own API key. The database
keeps only what the charts need — never your address or customer codes beyond the supply
identifier (POD/PDR).

## Stack

Next.js 16 · React 19 · TypeScript · pnpm · Turso (libSQL) + Drizzle · Better Auth · zod · Biome ·
Vitest · Playwright · Recharts · Tailwind 4 · Vercel Blob · `@anthropic-ai/sdk` · Serwist · Dexie ·
Vercel (Hobby).

## Self-hosting

Each household runs its own copy: a Vercel Hobby project in `dub1`, a Turso database and two private
Blob stores, with registration closed after the first account. [`SETUP.md`](SETUP.md) walks from
the clone to the deployment, the environment variables and the limits of the free plans.

## Local development

Node ≥ 22 and pnpm 11 (`corepack enable`; on Windows, if that fails with EPERM, `corepack enable
--install-directory <a folder on your PATH> pnpm`).

```bash
pnpm install
cp .env.example .env.local   # then fill BETTER_AUTH_SECRET with: openssl rand -base64 32
pnpm db:migrate              # creates local.db with the committed migrations
pnpm db:seed                 # two invented users (seed-a@example.test / seed-b@example.test) with their bills
pnpm dev                     # http://localhost:3000
```

Before a commit: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then `pnpm test:e2e`
(Playwright builds and starts its own servers on :3100 and :3101; stop `pnpm dev` first). The first
E2E run needs `pnpm exec playwright install chromium`.

## Documentation

| File | Scope |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | Index — what each piece is and where it lives; what does not exist yet |
| [`AGENTS.md`](AGENTS.md) | Repo-wide conventions, isolation, money and dates, testing, gotchas |
| [`doc/guide/calcoli.md`](doc/guide/calcoli.md) | The data model and the calculation engine: competence, bands, estimates, unit prices |
| [`doc/guide/app.md`](doc/guide/app.md) | Pages, Server Actions, the bill form, self-readings, theme, end-to-end test rules |
| [`doc/guide/deploy.md`](doc/guide/deploy.md) | Vercel, Turso and Blob choices, the production scripts, limits, rotating the secrets |
| [`SETUP.md`](SETUP.md) | From clone to your own deployment on Vercel + Turso + Blob |
| [`DESIGN.md`](DESIGN.md), [`PRODUCT.md`](PRODUCT.md) | The visual system (tokens, type, components) and the product voice |
| [`WORKFLOW.md`](WORKFLOW.md) | Session rules and the guided-verification protocol |
| [`doc/v1/00-INDICE.md`](doc/v1/00-INDICE.md) | The v1 series: decisions, order, shared contracts, one spec per session |
| [`COMMENTS.md`](COMMENTS.md), [`DEVELOPMENT_GUIDELINES.md`](DEVELOPMENT_GUIDELINES.md) | Binding code and comment guidelines |

## Data sources and licences

ARERA data in `data/riferimenti/` (from spec 08) is licensed CC BY-SA 4.0 — source: ARERA. PUN Index
GME values are for private use under the GME terms: each deployment imports them into its own
database from a file downloaded by hand, and they are never stored in this repository.

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service, you must publish its source.
