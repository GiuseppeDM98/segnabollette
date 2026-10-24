# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **Why they live in the repo and not in agent memory**: agent memory is per-machine and per
> install, so the same rules drift into different versions on each machine and in a cloud
> session. A tracked file travels with the clone and can be reviewed in a diff. If you are an agent
> with persistent memory, do **not** re-save these rules there — save one pointer to this file. If
> the owner states a new rule, it is added *here*, in that session's commit: to section 3 if it holds
> for this repo only; if it holds for every repo, ask the owner, because it enters the standard
> first (`claude-config/prompts/WORKFLOW_STANDARD.md`) and reaches the repos from there.
>
> Sections 1-2 are the portable standard, identical across every repo that adopts it. Section 3 is
> the only project-specific part: it says what "automate it yourself" and "show me the app"
> concretely mean *here*.

---

## 1. Session and collaboration rules

1. **Never commit without explicit approval.** Do not run `git commit` (nor `--amend`) until the
   owner gives the OK for that specific commit. Finish the work, summarise the diff, then ask.
   Creating the branch and editing files needs no approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new branch from the
   branch that is active at the start of the session. Always check which one that is; never assume
   `master`/`main`.

3. **One commit per session.** Everything from a session is squashed into a single commit, never
   scattered across several.

4. **Always answer in Italian** when working on this repo. This applies to the conversational
   channel; code, identifiers and comments stay in English.

5. **Questions and proposals are asked interactively** (2026-09-11). When a decision is the owner's —
   which layers to build, on which surfaces, a wording — put it through the agent's interactive
   question tool, one batch per topic, multi-select where the options are not exclusive and the
   recommended option first; never a numbered list of questions in prose. The owner refines the
   wording through the free-text answer («hai pagato», not «pagherai», for a tax the broker
   withholds at the sale).

6. **Figures in tests are invented and round, never the owner's** (2026-10-12). A unit-test
   fixture, an E2E decoy or a seed carries amounts like 2500, 1120, 50: the owner's real data never
   enters the repo, not even as an expected value. If § 3 provides a copy of real data for the
   guided tour, it serves the tour only and phase G removes it.
   **Nothing of the owner's real data in a tracked file** (2026-09-20, 2026-10-15): a draft, a
   critique, a screenshot, a fixture or an example sentence takes invented figures and generic
   names, never an amount, an account or a family detail copied from the real data. In a public
   repo this has no exception. A private repo may waive it, or narrow it, only by saying so in § 3
   with the owner's decision and its date; public data that is not the owner's (a listed company's
   published accounts) is not the owner's data.

7. **After an audit or an analysis, stop and wait for the owner's go-ahead** (2026-10-19). An audit,
   a review or an analysis ends with the findings; no file changes until the owner has chosen which
   fixes to apply and in what order (through rule 5).

---

## 2. Guided verification (*collaudo guidato*)

When a freshly implemented feature has to be verified by hand, do **not** hand over a checklist and
disappear. The verification is done together, in chat, one phase at a time.

### Five obligations

1. **You prepare the test data.** A throwaway script (untracked by git, deleted when the
   verification ends) that plants **decoy words** — invented terms such as *fenicottero*,
   *ornitorinco*, which appear nowhere else in the data. Not entered by hand by the owner.

2. **One phase per message.** Give the phase, wait for the report, then the next one. Never deliver
   all the phases at once: it breaks their prerequisites.

3. **State the expected outcome before running, not after** — otherwise the reading always bends to
   fit whatever happened.

4. **Do every check you can automate yourself, and leave the owner only what you cannot do.**
   "Together, in chat" does not mean "one dictated click at a time". If the sessions are JWT-based
   or otherwise scriptable, write a throwaway script that opens a **real browser** (e.g. Playwright)
   with an authenticated session — your own if the role allows it, otherwise a throwaway test
   identity created for the occasion — and verify every outcome **against the database or the HTTP
   response, never against the look of the page alone**. Report the results phase by phase, with the
   expected outcome stated first.
   **Any automated end-to-end test that you are able to run, you run.** Never declare a feature
   verified while an automated check that could have covered it was left unrun. What is left to the
   owner is only what is genuinely not automatable: visual and aesthetic judgement, physical
   hardware (a real barcode scanner), or an interactive login that cannot be driven by a script (a
   real OAuth flow with MFA).

5. **Before dismantling, let the owner look.** When the session touched something visible, ask for
   the OK and then walk the owner onto the dev server **with the fixtures still alive**: exact URLs,
   under which identity, and at most **five** things to look at — for each one, what must happen and
   what would be the bug. **The tour starts at the owner's go, not when the work is ready**
   (2026-10-05): finish everything that needs no eyes, say it is ready, and wait. Where obligation 4
   allows it, **open the page for the owner, already authenticated** — but one item per message and
   one page at a time, waiting for the outcome before opening the next; two pages together only
   when the item is a comparison (the same URL under two identities), saying which window is which.
   The windows of a driven browser have no name: five at once turn the tour into working out which
   belongs to which item. Only what a probe cannot say: layout, whether the screen says what it must
   say, the words, whether an action gives feedback that it happened. State also **what that tour
   does not cover**, and never ask the owner to redo by hand something already verified. Whatever
   the tour finds becomes an assertion before the session ends, or it will come back: the tour
   exists to discover what nobody thought to assert, not to replace the tests.

### Standard phases, when they make sense

| | Phase | What it establishes |
| --- | --- | --- |
| **A** | Invarianza | What worked before still works |
| **B** | Cambio di contesto | The new role/state is genuinely active |
| **C** | Comportamento nuovo | It does what it must, and not what it must not — obligation 4 matters most here: automate |
| **D** | Sotto la UI | The same rules hold when the route is called directly |
| **E** | Casi negativi | Someone without rights is refused, with the right error |
| **F** | Giro guidato | The only phase the owner executes: they look with their own eyes, fixtures still alive |
| **G** | Ripristino | Configuration restored, fixtures removed, script deleted |

### A negative test alone never proves a security guard

It always takes the pair: **own resource** (positive control — must succeed) and **someone else's
resource** (the test — must fail), with the same identical file or record.

### Closing a verification

Restore any configuration that was changed, remove fixtures and test attachments, delete the script,
and **record the outcome somewhere that survives the session** (`CLAUDE.md` or equivalent).
*A verification that was not recorded counts as not done.*

**The outcome is one line, the signals are not** (2026-10-19). In `CLAUDE.md` the session's status
entry says what was done, where it is documented, what is still open and what comes next; it
replaces the previous one. The session's signals — type-check, test counts, E2E runs, flakes,
skipped phases, the guided tour's walk and its findings (2026-10-23) — go in the commit message
and, where they teach something, in the area's guide, never in `CLAUDE.md`: that file is injected
into every turn, and a status entry that collects them grows back into a diary after every trim.
Of the tour, the status entry keeps only its outcome: done and closed, or what it left open.

---

## 3. What this means in THIS repo

The rules above are the standard. This section is the local translation of obligations 4 and 5 — it
changes from repo to repo and is the only part to rewrite when the tooling changes.

> **State on 2026-10-24**: the repo holds documentation and the v1 spec series (`doc/v1/`). There is
> no code yet: every command below is the one the specs install, and each spec's § 9 updates this
> section the day the command becomes real. Until spec 01 is in service, "the gates" means the
> commands of the table once they exist, and nothing else.

### The commands that exist (installed by spec 01 unless the column says otherwise)

| Purpose | Command | Since |
| --- | --- | --- |
| Types | `pnpm typecheck` (`tsc --noEmit`) | 01 |
| Lint + format | `pnpm lint` (`biome check .`; `pnpm lint:fix` to write) | 01 |
| Unit tests | `pnpm test` (Vitest, `TZ=Europe/Rome` set by `vitest.config.ts`) | 01 |
| Build | `pnpm build` (`next build --webpack`, kept for the service worker) | 01 |
| Browser tests | `pnpm test:e2e` (Playwright on a production build on :3100, `file:e2e.db`, fake Blob and Anthropic behind `E2E_FAKE_SERVICES=1`) | 01 |
| Database | `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`, `pnpm db:seed` (the two seed users); `pnpm db:migrate:prod` (production, reads `.env.turso-prod`) | 01 / 02 / 05 |
| Market references | `pnpm riferimenti:update` (ARERA, writes `data/riferimenti/*.json`), `pnpm riferimenti:pun -- <AnnoYYYY.zip> [--prod]` (GME zip downloaded by hand; writes `local.db`, or production with `--prod`, which reads `.env.turso-prod`) | 08 |
| Blob housekeeping | `pnpm documents:prune` (dry run; `-- --delete` removes orphan files; `-- --prod` targets production through `.env.turso-prod`) | 06 |
| Fixtures | `pnpm fixture:bills` (rewrites the synthetic bill PDFs in `tests/fixtures/bills/`) | 06 |
| Icons | `pnpm icons` | 09 |

Gates before a commit, in this order: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`,
then `pnpm test:e2e` (it builds its own production server: no dev server may run beside it). A red
one stops the session. pnpm is the package manager (`packageManager: pnpm@11.22.0`,
`corepack enable`); Node ≥ 22.

### The isolated environment

- **Database**: `TURSO_DATABASE_URL="file:local.db"` in `.env.local` is the development database;
  unit and repository tests use a fresh temp **file** per test with the real migrations
  (`createTestDb()`, never `:memory:` — AGENTS.md § Gotchas); Playwright uses `file:e2e.db`
  rebuilt by its global setup. Production Turso is reached only through `.env.turso-prod`
  (gitignored, spec 05), read by `pnpm db:migrate:prod` and by the scripts that take `--prod`
  (`riferimenti:pun`, `documents:prune`); never by exporting variables into the shell. Without
  `--prod` those scripts refuse a database URL that does not start with `file:`.
- **Blob**: development uses its own private store (`segnabollette-files-dev`, spec 05), never the
  production one; tests and Playwright never touch Blob (fake store behind the container).
- **Anthropic**: tests and Playwright never call it (fake extractor behind the container, fixture
  extractions in `tests/fixtures/extractions/`). A real extraction happens only in a guided
  verification, after the owner's OK, with its estimated cost stated first (≈ 0,30 $ per bill
  with `claude-opus-5-5`); in the app an extraction starts only from the «Estrai» button, which
  shows the estimate.

### Obligation 5 — how to hand the owner an app already authenticated

- `pnpm dev` on :3000 with `.env.local` (`SIGNUP_ENABLED="true"` locally). `pnpm db:seed` creates
  two seed users, `seed-a@example.test` and `seed-b@example.test`, password `seed-password-1`,
  with invented houses, supplies and bills (round numbers, decoy words). The throwaway Playwright
  script of a verification logs in with `POST /api/auth/sign-in/email` (with an `Origin` header)
  and saves `playwright/.auth/<user>.json` (gitignored), then opens the page already
  authenticated. Isolation checks use the pair: seed A's resource (must open) and seed B's
  resource (must be refused) with the same request.
- Phones (camera capture on Android and iPhone, installing the PWA, the offline queue on a real
  device) are the only part the owner must do by hand (specs 06 and 09): a probe cannot press
  "Add to Home Screen".

### Inspecting real data state

`pnpm db:studio` on `local.db`; a throwaway `tsx` script with `createDb({ url: 'file:local.db' })`
(never `src/lib/db/client.ts`, which is server-only); in
production a throwaway `tsx` script with `loadProductionTarget()` and `createDb`, `SELECT` only,
printing counts and ids, never the owner's names or emails (spec 05). Blob: `vercel blob list --prefix users/`
on the store of the environment in question. Never judge an outcome from the page alone when a
row can be read.

### Branches

`main` is the default and the integration branch **and production** (a merged PR deploys, spec 05).
One branch per spec (`feature/NN-slug`, named in the spec header), one squashed commit, one PR to
`main`; the monthly ARERA refresh (spec 08) uses `feature/riferimenti-<YYYY-MM>`. No `develop`, no
preview deployments: the ignored build step of `vercel.json` skips every non-production build
(verification runs locally, and in production after the merge).

### Where things are recorded

- **SESSION_NOTES.md**: untracked scratch file in the root, created at the start of every session
  and deleted at its end. Before the closing prompt it ends with one block per thing learned or
  decided: *Cosa* (what was done) · *Perché* (the decision behind it) · *Nota* (traps and
  measures, each with its date) · *Dove va a fine sessione* (AGENTS.md if it holds for the whole
  repo · `doc/guide/<tema>.md` if it is a domain lesson · WORKFLOW.md if it is a session rule ·
  CLAUDE.md if it is project status · a comment on the right line if it is the why of a line).
  Every item is written to its destination before the file is deleted.
- **A verification in production happens after the merge** (2026-10-24, specs 05–09): the session
  makes its one commit and its PR **before** the merge (status «implementata»); after the merge,
  in the same session, the owner and the agent run the production verification; its outcome, the
  gotchas it taught and the status «in esercizio» stay in `SESSION_NOTES.md`, which in this case
  survives the session (untracked), and enter the commit of the **next** session, which starts by
  writing them. The last spec of a series closes with a short documentation-only session. The
  rule «one commit per session» stays intact.
- **The outcome of a verification** goes in `CLAUDE.md § Current Status → Latest`, one line, and
  replaces the previous entry; the session's signals (test counts, E2E runs, skipped phases) go in
  the commit message. During the v1 series the same status is written in the spec's `Stato` line
  and in `doc/v1/00-INDICE.md § 5`.
- **`Draft Release Temp.md`** (public repo: the session-end prompt 03 maintains it): a GitHub
  Release draft that accumulates until the owner tags. Model: title `# Draft release`, a quote
  line with the date range, then groups per area of the app in navigation order (Casa, Bollette,
  Letture, Forniture, Impostazioni, Import, Riferimenti di mercato, PWA, Deploy), each a bullet
  list of `- Added/Fixed/Improved …`, two sentences at most, user-facing English, no file names,
  no owner data, never "spec retired". Ceiling 60,000 characters.
- **Nothing of the owner's data in a tracked file, commit message or PR** (rule 1.6, no exception:
  public repo). No real bill, POD, PDR, invoice number, supplier account, address or amount: bill
  fixtures are synthetic and generated (`pnpm fixture:bills`), test numbers invented and round.
  Real bills used in a verification stay outside the repo (`Downloads\bollette-campione\` or the
  owner's own files) and leave no trace in the database after phase G.
