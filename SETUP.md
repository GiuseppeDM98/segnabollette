# SETUP — from clone to your own deployment

How to run segnabollette on your machine and then on your own Vercel + Turso + Blob, for your
household only. Every value below in angle brackets (`<project>`, `<database>`) is yours to
choose or read from the tools; no secret ever goes into a tracked file.

## Prerequisites

- **Node ≥ 22** and **pnpm 11** through corepack (`corepack enable`; on Windows, if that fails
  with EPERM, `corepack enable --install-directory <a folder on your PATH> pnpm`).
- A **GitHub** account with your fork or copy of this repository.
- A **Vercel** account on the **Hobby** plan (personal, non-commercial use) and the Vercel CLI
  **≥ 50.20.0** (`pnpm dlx vercel@latest --version`; every command below runs it through
  `pnpm dlx`, nothing to install globally).
- A **Turso** account, and either the Turso CLI (https://docs.turso.tech/cli/installation; on
  Windows it runs inside **WSL**: run the `turso` commands there, everything else from the
  repository root in your usual terminal) or just the dashboard at https://app.turso.tech, which
  does the same for this setup.

## Run it locally

```bash
git clone <your fork> segnabollette && cd segnabollette
pnpm install
cp .env.example .env.local   # then fill BETTER_AUTH_SECRET with: openssl rand -base64 32
pnpm db:migrate              # creates local.db with the committed migrations
pnpm db:seed                 # two invented users (seed-a@example.test / seed-b@example.test)
pnpm dev                     # http://localhost:3000
```

`.env.local` points at `file:local.db` and opens the registration (`SIGNUP_ENABLED="true"`): it is
your development database, never the production one.

## Create the database

Pick the location closest to the Vercel region the app runs in (`dub1`, Dublin): that is
`aws-eu-west-1` (Ireland). On the free plan you have one group, whose location is chosen when you
sign up; the database goes into that group.

```bash
turso auth login
turso group list                 # the location of your group
turso db create segnabollette    # in the existing group
turso db show segnabollette --url
turso db tokens create segnabollette
```

Without the CLI (on Windows without WSL, for instance), the dashboard does the same: the group's
page shows its location; create the database `segnabollette` in that group, copy its URL
(`libsql://…`) and create a token with read and write access and no expiration (an expiring token
takes production down the day it expires).

Create `.env.turso-prod` in the repository root (it is gitignored, like every `.env.*` except
`.env.example`) with the two values:

```bash
TURSO_DATABASE_URL="libsql://<database>-<organization>.turso.io"
TURSO_AUTH_TOKEN="<the token>"
```

Then apply the migrations:

```bash
pnpm db:migrate:prod             # prints "Migrating <host> …" and "Done."
```

The production scripts read only this file, never variables exported into the shell: the same
command works from PowerShell and from bash, and `pnpm db:migrate:prod` refuses a URL that does not
start with `libsql://`, so it cannot run against a local file by mistake.

## Create the Vercel project

From the repository root:

```bash
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link --yes --project segnabollette
pnpm dlx vercel@latest git connect   # only if link did not connect your GitHub repository
```

Then, in the project's dashboard:

- **Settings → Deployment Protection → «Standard Protection»** (previews only). Production stays
  open: the app has its own login, and Vercel's login in front of it would stand between your phone
  and the app.
- **Settings → Functions**: after the first production deploy the region must read `dub1`
  (`vercel.json` sets it; new projects default to `iad1`).

`vercel.json` also has an `ignoreCommand` that skips the build of every branch other than `main`:
a pushed feature branch shows a «Canceled» deployment instead of a preview
(which would fail anyway, without preview variables). `main` is production; you verify a change
locally, and in production after the merge.

## Create the file stores

Bills (PDFs and photos) live in **private** Vercel Blob stores. Access and region cannot be changed
after a store is created, and the CLI defaults to `iad1`, so always give both:

```bash
pnpm dlx vercel@latest blob create-store segnabollette-files --access private --region dub1 --environment production
pnpm dlx vercel@latest blob create-store segnabollette-files-dev --access private --region dub1 --environment development
pnpm dlx vercel@latest blob list-stores
```

Two stores, because Blob has no local emulator: without a development store of its own, your tests
on `localhost` would write into production. **Never add `--yes`**: it links the store to every
environment, development included. A store created in the wrong region is not moved: delete it
(`vercel blob delete-store`) and create it again.

Linking a store adds `BLOB_READ_WRITE_TOKEN` to its environment, and the CLI then pulls the
Development variables into `.env.local`: your local copy gets the development store's token, never
the production one. The Vercel CLI also appends `.vercel` and `.env*` to `.gitignore` when it
links or pulls; this repository already ignores both, and `.env*` would cancel the
`!.env.example` exception above it, so discard that change (`git checkout -- .gitignore`).

### Development file store

If `.env.local` has no `BLOB_READ_WRITE_TOKEN` (it was written before the store was linked, or by
hand), take the development token without touching the rest of the file:

```bash
pnpm dlx vercel@latest env pull .env.vercel-dev --environment=development
```

Copy only the `BLOB_READ_WRITE_TOKEN=…` line from `.env.vercel-dev` into `.env.local`, then delete
`.env.vercel-dev`. Uploads on `localhost` then go to `segnabollette-files-dev`, never to production.

## Anthropic API key

The extraction calls Claude (`claude-opus-5-5`) with your own key: create it on an organization of
your own in the Claude Console (platform.claude.com), not on a shared or company one, and set a
**monthly spend limit** on that organization: a few dollars cover a household. One bill costs
about 0,30 $ and the app shows the estimate before every extraction; nothing is extracted until
you press «Estrai». «Impostazioni» shows what the month has cost.

For development, add the key to `.env.local` as `ANTHROPIC_API_KEY=…`; for production, type it:

```bash
pnpm dlx vercel@latest env add ANTHROPIC_API_KEY production     # tick Sensitive in the dashboard
```

Without the key the app still stores files attached to a bill by hand; without
`BLOB_READ_WRITE_TOKEN` the upload pages say the file store is not configured and offer manual entry.

## Environment variables

Production variables are typed by you (`vercel env add <NAME> production` asks for the value);
check them with `pnpm dlx vercel@latest env ls production`, which shows names only.

| Name | Environment | Example | Required | Set by |
| --- | --- | --- | --- | --- |
| `TURSO_DATABASE_URL` | Production | `libsql://<database>-<organization>.turso.io` | yes | you |
| `TURSO_AUTH_TOKEN` | Production | the token of `turso db tokens create` | yes | you |
| `BETTER_AUTH_SECRET` | Production | `openssl rand -base64 32`, a new one, never the local one | yes | you |
| `BETTER_AUTH_URL` | Production | `https://<project>.vercel.app` — scheme and host, no trailing `/` | yes | you |
| `SIGNUP_ENABLED` | Production | `true` for your first account, then `false` | no (closed when missing) | you |
| `BLOB_READ_WRITE_TOKEN` | Production (`segnabollette-files`), Development (`segnabollette-files-dev`) | — | for uploads | Vercel, when the store is linked |
| `ANTHROPIC_API_KEY` | Production | `sk-ant-…` of your own organization | for the extraction | you |

```bash
pnpm dlx vercel@latest env add TURSO_DATABASE_URL production
pnpm dlx vercel@latest env add TURSO_AUTH_TOKEN production
pnpm dlx vercel@latest env add BETTER_AUTH_SECRET production
pnpm dlx vercel@latest env add BETTER_AUTH_URL production
pnpm dlx vercel@latest env add SIGNUP_ENABLED production       # true, for now
pnpm dlx vercel@latest env add ANTHROPIC_API_KEY production
pnpm dlx vercel@latest env ls production
```

Without `openssl` (Windows PowerShell has none), the same secret comes from Node:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. The dashboard
(Settings → Environment Variables) works as well as the CLI: tick **Production only** for each
variable, since the form proposes Preview and Development too, and tick **Sensitive** for the
secrets (`TURSO_AUTH_TOKEN`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`): it is not on by default there.

A `BETTER_AUTH_URL` that differs from the real origin makes Better Auth's origin check refuse every
sign-in.

## Deploy and first account

1. Merge into `main`: Vercel builds and deploys production. The build log must be green and the
   function region `dub1`. A «Canceled» deployment of `main` means the ignored build step is wrong
   (`doc/guide/deploy.md` § 4); meanwhile `pnpm dlx vercel@latest redeploy <its url> --target
   production` builds it. Make the project's first deployment from `main`: a new project may
   promote its very first deployment to production even from another branch.
2. Open `https://<project>.vercel.app` on your phone, sign up with your own account, add a house, a
   supply and a bill.
3. **Close the door**: registration stays open only for the minutes it takes to create your
   account (and, if you want, one for a friend).

   ```bash
   pnpm dlx vercel@latest env rm SIGNUP_ENABLED production
   pnpm dlx vercel@latest env add SIGNUP_ENABLED production       # false
   pnpm dlx vercel@latest redeploy <url of the production deployment> --target production
   ```

   `/registrati` then says that registration is closed, and the server refuses a sign-up sent
   directly to `/api/auth/sign-up/email`: the switch closes the server, not only the page.

## Updating

Pull the new version; if it brings a new migration in `drizzle/`, run `pnpm db:migrate:prod`
**before** merging (or pushing) it to `main`. Vercel never migrates during the build, and a deploy
that starts on a schema not yet migrated fails at its first query.

Now and then, check the production store for files left behind (an upload abandoned halfway, a
delete interrupted between the row and the file):

```bash
pnpm documents:prune -- --prod             # lists; add -- --delete to delete
```

It needs a third line in `.env.turso-prod`, the **production** store's token, which you add only for
this command (from the page of `segnabollette-files` under Storage in the Vercel dashboard):

```bash
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_<store>_<secret>"
```

It prints the database host and the store id before anything else: check that they are the
production pair. Without `--prod` it pairs `.env.local`'s database (a local file only) with the
development store.

## Costs and limits

- **Vercel Hobby**: personal and non-commercial use only; one region; functions up to 300 s;
  request bodies up to 4.5 MB (files go from the browser straight to Blob for this reason);
  runtime logs kept for one hour.
- **Vercel Blob (Hobby)**: 1 GB, 10,000 simple and 2,000 advanced operations a month; past the
  limit the store is blocked for 30 days.
- **Turso (free)**: 100 databases and 5 GB, a single location, point-in-time restore of one day.
  There are no other backups.

## Coming next

Sections that later versions add to this file:

- **Market references** — importing the PUN Index GME into your database from a file you download by
  hand (private use under the GME terms: check them before opening registration to anyone else).
- **Install on your phone** — the PWA, the camera and the offline queue.
