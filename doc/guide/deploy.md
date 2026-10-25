# Deploy — Vercel, Turso, Blob and the production scripts

> Domain guide (born 2026-10-25 with the first production deploy). AGENTS.md § 8 keeps a stub that
> points here; the step-by-step for someone deploying their own copy is SETUP.md. Every rule names
> the file that implements it; when the code and this page disagree, the code is right and this
> page is fixed in the same change. No real domain, host or account appears here: production is
> `<project>.vercel.app`, the database `<database>-<organization>.turso.io`.

## 1. The choices

| Choice | Where | Why |
|---|---|---|
| Vercel Hobby, region **`dub1`** (Dublin) | `vercel.json` `regions` | Hobby has one region; new projects default to `iad1`, far from the database and the users |
| Turso in **`aws-eu-west-1`** (Ireland) | the owner's Turso group | Turso has no Frankfurt; Ireland is the location closest to `dub1`. The free plan has one group, so the database lives wherever that group is |
| **Production = `main`**, every other build skipped | `vercel.json` `ignoreCommand` | No preview deployments: they would fail without preview variables, and verification runs locally and in production after the merge |
| Production **open**, Deployment Protection «Standard» (previews only) | Vercel dashboard | Vercel's login in front of the PWA would stand between the phone and the app; the app has its own login |
| **Two private Blob stores**: `segnabollette-files` (Production), `segnabollette-files-dev` (Development), both in `dub1` | Vercel Blob | No local emulator: without a store of its own, development would write into production. Access and region are fixed at creation |
| **Migrations from the owner's machine, before the merge** | `pnpm db:migrate:prod` | A deploy that starts on an unmigrated schema fails at its first query; the Vercel build never migrates |
| Registration closed after the owner's account | `SIGNUP_ENABLED` (closed when missing) | The switch feeds Better Auth's `disableSignUp`: the server refuses, not only the page |

### `ignoreCommand`

```json
"ignoreCommand": "[ -n \"$VERCEL_GIT_COMMIT_REF\" ] && [ \"$VERCEL_GIT_COMMIT_REF\" != main ]"
```

Vercel's «Ignored Build Step»: exit 0 skips the build and the deployment shows «Canceled»; exit 1
builds. It skips only a branch that is known and is not `main` (`feature/*`, `docs/*`, Dependabot);
when `VERCEL_GIT_COMMIT_REF` is missing it builds, so production is never skipped by mistake. Not
`VERCEL_ENV`: it is not set while the step runs on a Git deployment, and the first version of this
command, `[ "$VERCEL_ENV" != production ]`, skipped every merge into `main` (2026-10-25). There is no `git.deploymentEnabled`: the branch
still produces a (cancelled) deployment, which is the visible proof that nothing was built.

## 2. The production scripts

`scripts/production-target.ts` is the only door to the production database from the owner's
machine:

- `readProductionTarget(env)` returns `{ url, authToken }` and throws on a URL that does not start
  with `libsql://` or on a missing token (`scripts/production-target.test.ts`: the two refusals and
  the happy path).
- `loadProductionTarget()` loads `.env.turso-prod` (gitignored) with `override: true`, so a
  `TURSO_DATABASE_URL` left in the shell never wins over the file, and throws when the file is
  missing.

The file holds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; a later `BLOB_READ_WRITE_TOKEN` line
for the Blob housekeeping is ignored by `readProductionTarget`. Never variables exported into the
shell: the same command must work from PowerShell and bash, and the scripts must not be able to
run against a local file by mistake.

| Command | What it does |
|---|---|
| `pnpm db:migrate:prod` | `scripts/migrate-prod.ts`: prints the host, applies `drizzle/` with Drizzle's libSQL migrator, prints «Done.». Idempotent: a second run changes nothing |
| `pnpm documents:prune -- --prod` *(arrives with the Blob upload)* | Orphan files of the production store |
| `pnpm riferimenti:pun -- <zip> --prod` *(arrives with the market references)* | The PUN into the production database |

A script that can write to production does so only behind `--prod` (through
`loadProductionTarget()`); without it, it reads `.env.local` and refuses a URL that does not start
with `file:`.

### Reading production during a verification

A throwaway `tsx` script outside the repo (the agent's scratchpad, `--tsconfig tsconfig.json` so
that `@/…` resolves) builds the client with `loadProductionTarget()` and `createDb`, runs `SELECT`
only through `client.execute`, and prints counts and ids — never the owner's email or name. It
imports the loader as `@/../scripts/production-target` and runs from the repository root, where
`.env.turso-prod` lives (2026-10-25); dotenv 18 prints «injected env (2) from .env.turso-prod», a
count, never the values. The Turso CLI serves only to create the database and its tokens:
`turso db shell` has no read-only mode.

## 3. Commands

```bash
# Turso (owner's terminal; on Windows inside WSL, or the same steps on app.turso.tech)
turso group list
turso db create segnabollette
turso db show segnabollette --url
turso db tokens create segnabollette

# Vercel project (repository root)
pnpm dlx vercel@latest link --yes --project segnabollette
pnpm dlx vercel@latest git connect

# Blob: always --access private --region dub1 and one environment; never --yes
pnpm dlx vercel@latest blob create-store segnabollette-files --access private --region dub1 --environment production
pnpm dlx vercel@latest blob create-store segnabollette-files-dev --access private --region dub1 --environment development

# Variables: the owner types the values; the agent reads only the names
pnpm dlx vercel@latest env add <NAME> production
pnpm dlx vercel@latest env ls production

# Redeploy after a variable changes
pnpm dlx vercel@latest redeploy <url of the production deployment> --target production
```

Production variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET` (new, never the
local one), `BETTER_AUTH_URL` (exactly the production origin, no trailing `/`, or the origin check
refuses the sign-in), `SIGNUP_ENABLED`; linking a store adds `BLOB_READ_WRITE_TOKEN` to its environment by itself
(Vercel CLI 65.2.0, 2026-10-25: only that one, not `BLOB_STORE_ID` nor `BLOB_WEBHOOK_PUBLIC_KEY`). A Sensitive
variable cannot be read back; the dashboard form has a «Sensitive» switch to tick for secrets
(2026-10-25: two variables created there without it show as «Config» in `env ls`, the others as
«Secret»; making one Sensitive means creating it again and redeploying).

CLI 65.2.0 (2026-10-25) warns that the positional environment of `env rm` and the `--target` of
`redeploy` are deprecated in favour of `--environment`; both still work. From Git Bash, `vercel api
/v13/…` needs `MSYS2_ARG_CONV_EXCL="/v13"` (the shell turns the path into a Windows one;
`MSYS_NO_PATHCONV=1` breaks the pnpm shim instead).

## 4. Traps

- Foreign keys are off on remote Turso, so Better Auth's cascade from `users` to `sessions` and
  `accounts` does not fire there (locally it does and hides a missing delete): after an account
  deletion in production, check `sessions` and `accounts` one by one (AGENTS.md § 2.6).
- Better Auth's rate limit runs in production only (3 sign-ins every 10 s per IP): a verification
  script waits 10 s between two sign-in or sign-up calls.
- A store created without `--region` lands in `iad1` and cannot be moved: delete it and create it
  again.
- `<project>.vercel.app` does not exist until the first production deploy, yet the build validates
  `BETTER_AUTH_URL` (`src/lib/env.ts`): set it to the expected origin first, then compare it with
  the domain Vercel assigned and fix it (with a redeploy) if they differ.
- The first Git deployment of a new project goes to **production** whatever its branch, and was
  not skipped (`feature/05-deploy`, 2026-10-25): push `main` first. The Production Branch lives in
  Settings → **Environments** → Production («Branch Tracking»), no longer in Settings → Git.
- A Git deployment does not see `VERCEL_ENV` in the Ignored Build Step, while `vercel redeploy …
  --target production` does (2026-10-25): with the first `ignoreCommand` two merges into `main`
  were «Canceled» (`buildSkipped: true`) and only the redeploys built. Test the branch
  (`VERCEL_GIT_COMMIT_REF`), and after changing the command check that the next merge builds.
- The Vercel CLI appends `.vercel` and `.env*` to `.gitignore` whenever it links a project or a
  store or pulls variables: discard that change, since `.env*` cancels the `!.env.example`
  exception. Creating the development store also rewrites `.env.local` with the Development
  variables, which is how the local copy gets the development store's token.

## 5. Hobby limits

Vercel Hobby: personal, non-commercial use; one region; functions up to 300 s and 2 GB; request
bodies up to 4.5 MB (413 beyond), Server Actions 1 MB by default; one cron a day; runtime logs for
one hour. Blob Hobby: 1 GB, 10,000 simple and 2,000 advanced operations a month, then the store is
blocked for 30 days. Turso free: 100 databases, 5 GB, one location, one day of point-in-time
restore and no other backup.

## 6. Rotating the secrets

- **`TURSO_AUTH_TOKEN`**: `turso db tokens invalidate segnabollette` (it invalidates every token:
  production has no database until the redeploy), `turso db tokens create segnabollette`, the new
  value in `.env.turso-prod` and in production (`vercel env rm TURSO_AUTH_TOKEN production`,
  `vercel env add TURSO_AUTH_TOKEN production`), then `vercel redeploy <url of the production
  deployment> --target production`.
- **`BETTER_AUTH_SECRET`**: a new value (`openssl rand -base64 32`) through `vercel env rm` and
  `vercel env add`, then the redeploy; every session expires and everyone signs in again.
- **`BLOB_READ_WRITE_TOKEN`**: regenerated from the store's panel, where Vercel updates the
  variable; then the redeploy, and the `BLOB_READ_WRITE_TOKEN` line of `.env.turso-prod`, when it
  exists, takes the new value.
