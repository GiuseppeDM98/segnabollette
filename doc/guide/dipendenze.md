# Dependencies — open advisories

Audit of 2026-10-26 with `pnpm audit` · pnpm 11.22.0 · Next.js 16.4.3.

Every session starts with `pnpm audit --json` compared with this table (WORKFLOW.md rule 8): a new
advisory gets a row with the owner's decision, a fixed one leaves. Upgrades happen in a session of
their own, the version chosen and installed by hand.

| Package | Version | Direct or transitive | Dev only | Severity | First fixed | Decision | Date |
|---|---|---|---|---|---|---|---|
| esbuild | 0.18.20 | transitive (`drizzle-kit`, also under `better-auth`, → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils`) | yes: only its dev server is affected, which nothing here starts | moderate | 0.24.3 | accepted because dev-only; the row leaves when `drizzle-kit` drops `@esbuild-kit` | 2026-10-26 |

## Overrides in force

| Override | Why | Remove when | Date |
|---|---|---|---|
| `@vercel/cli-config>zod`: 4.6.7 (`pnpm-workspace.yaml`) | zod < 4.6.6, high (GHSA-mrhx-c7xc-m3w5): every `@vercel/cli-config`, under `@vercel/blob` → `@vercel/oidc`, pins 4.1.11; 4.6.7 is the zod the app already uses. Added inside a feature session by the owner's choice, an exception to rule 8; the production import of the owner's past bills is its check of Blob in production. | a `@vercel/cli-config` ships zod ≥ 4.6.6 | 2026-10-26 |
