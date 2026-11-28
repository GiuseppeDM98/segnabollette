# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **They live in the repo, not in agent memory**: memory is per machine and per install, so the
> rules drift apart; a tracked file travels with the clone. An agent with persistent memory saves
> one pointer to this file, not the rules. If the owner states a new rule, it is added *here*, in that session's commit: to section 3 if it holds
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
   Branches and edits need no approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new branch from the
   branch that is active at the start of the session. Check which one that is; never assume `master`/`main`.

3. **One commit per session.** Everything from a session is squashed into a single commit.

4. **Always answer in Italian** when working on this repo. This applies to the conversational
   channel; code, identifiers and comments stay in English. **Every tracked document is written in
   the repo's documentation language** (2026-11-01): English in the open repos, Italian where the
   repo's documentation is Italian (its WORKFLOW.md says which). In an English-language repo, Italian
   is reserved for the UI text a document quotes, page and feature names and the owner's own words, quoted as such. A guide still in the
   other language is rewritten when a session rewrites it anyway, never in a session of its own.

5. **Questions and proposals are asked interactively** (2026-09-11). A decision that is the owner's —
   which layers to build, on which surfaces, a wording — goes through the agent's interactive
   question tool, in groups of four, one topic at a time, multi-select where the options are not
   exclusive, the recommended option first; never a numbered list of questions in prose.

6. **Figures in tests are invented and round, never the owner's** (2026-10-12). A unit-test
   fixture, an E2E decoy or a seed carries amounts like 2500, 1120, 50: the owner's real data never
   enters the repo, not even as an expected value. A copy of real data that § 3 provides for the
   guided tour serves the tour only, and phase G removes it.
   **Nothing of the owner's real data in a tracked file** (2026-09-20, 2026-10-15; code comments
   too since 2026-11-15): a draft, comment, critique, screenshot, fixture or example sentence takes
   invented figures and generic names, never an amount, holding, account, start date or family
   detail from the real data. A public repo has no exception; a private one may waive or narrow it
   only in § 3, with the owner's decision and its date. Public data that is not the owner's (a
   listed company's published accounts) is not the owner's data.

7. **After an audit or an analysis, stop and wait for the owner's go-ahead** (2026-10-19). An audit,
   a review or an analysis ends with the findings; no file changes until the owner has chosen which
   fixes to apply and in what order (through rule 5).

8. **Dependencies: compare at session start, upgrade in a session of their own** (2026-10-26). If
   the repo has a lockfile, a session first installs from it with every server stopped (`npm ci`,
   `pnpm install --frozen-lockfile`; 2026-11-17: the audit reads the lock),
   then runs the package manager's audit and compares it with
   `doc/guide/dipendenze.md`, which records the date of the last audit, the framework version and
   every open advisory with the owner's decision. The answer is one line: «dipendenze: invariate
   dal <data>» or «N avvisi nuovi: …». A new advisory is written into the guide with its decision,
   asked through rule 5; nothing is upgraded in that session. An upgrade is a session on its own
   branch with its own verification; never `audit fix --force` or the command an advisory suggests:
   the version is chosen and installed by hand, preferring a release at least a few days old. A
   missing guide is created by the session that notices it (`TEMPLATES.md`). A repo without a
   lockfile skips this rule.

9. **`SESSION_NOTES.md` is the session's temporary container** (2026-10-26). A working file in the
   repo root, created at the start of the session and never committed. Before the closing prompt it
   ends with one block per thing learned: *Cosa* (what was done), *Perché* (the decision behind
   it), *Nota* (traps and measurements, dated), *Dove va a fine sessione* (`AGENTS.md`
   if it holds for the whole repo · `doc/guide/<tema>.md` if a domain lesson · `WORKFLOW.md` if a
   session rule · `CLAUDE.md` if project state · a comment at the right line if it is the why of one
   line). The closing prompt writes every entry into its destination and deletes the file before
   the single commit; a note that names no destination is lost. A `SESSION_NOTES.md` still on the
   remote means a session was not closed.

10. **The commit's «Model: … · effort …» line is read from the spec, never asked** (2026-11-18). A
    session that implements a spec writes the model and effort the spec names (its prompt, or its
    row in the series index); the one that retires it writes the SAME pair as the implementation's
    commit (`git log`). The owner is asked only when no spec is behind the session or it ran at
    another model or effort.

---

## 2. Guided verification (*collaudo guidato*)

When a freshly implemented feature has to be verified by hand, do **not** hand over a checklist and
disappear. The verification is done together, in chat, one phase at a time.

### Five obligations

1. **You prepare the test data.** A throwaway script (untracked by git, deleted when the
   verification ends) that plants **decoy words** — invented terms such as *fenicottero*,
   *ornitorinco*, which appear nowhere else in the data. Never entered by hand.

2. **One phase per message.** Give the phase, wait for the report, then the next one. Never deliver
   all the phases at once: it breaks their prerequisites.

3. **State the expected outcome before running, not after** — otherwise the reading always bends to
   fit whatever happened.

4. **Do every check you can automate yourself, and leave the owner only what you cannot do.**
   If the sessions are scriptable, write a throwaway script that opens a **real browser**
   with an authenticated session — your own if the role allows it, otherwise a
   throwaway test identity — and verify every outcome **against the database or the HTTP response,
   never against the look of the page alone**. Report phase by phase, expected outcome first.
   **Any automated end-to-end test that you are able to run, you run**: never declare a feature
   verified with an automated check left unrun. Left to the owner is only what is genuinely not
   automatable: visual and aesthetic judgement, physical hardware (a real barcode scanner), or a
   login no script can drive (a real OAuth flow with MFA).
   **The whole suite is launched last, when no file of the repo is left to change** (2026-11-22): a
   run fingerprints its tree, and a file edited meanwhile kills it or
   makes it measure a tree that is gone. Finish every edit first, the deletion of
   `SESSION_NOTES.md` included, touch nothing in that repo until the suite reports, and run it
   again if a file changes after. Other repos and the scratchpad may change.
   **A long run in the background is watched, not waited on** (2026-11-25): for the full suite, a
   build or a benchmark, a monitor reports progress **every five minutes** and **at once**
   when a service the run needs (emulators, dev server, database) stops answering. A dead service
   stops the run: restart both, never read the reds it left as results.
   **A browser suite on a shared backend runs on several workers, each in its own data universe**
   (2026-11-26): a database, project or tenant picked by the worker's index and seeded alike, never
   accounts cloned inside one. The count is measured: the fastest whole run green twice (on a
   hybrid CPU start from the performance cores). Above two workers the trace is kept only at the
   one retry of a red, and a test green only there is «flaky», read like a red. No spec names the
   backend, a parked session or another file's data by literal (one helper does) or reads what
   another file wrote. A fixed sleep becomes a condition, unless it IS the gesture under test.
   Nothing else runs on the machine, and the run's ports are free, while it is measured or gated;
   the whole run on a production build, an area run on the dev server. § 3 carries the line
   `Browser tests: workers <N> · isolation <mechanism> · whole run <wall> on <date> (<tests>
   tests)`; `workers 1` gives its reason.

5. **Before dismantling, let the owner look.** When the session touched something visible, ask for
   the OK and then walk the owner onto the dev server **with the fixtures still alive**: exact URLs,
   under which identity, and at most **five** things to look at — for each, what must happen and
   what would be the bug. **The tour starts at the owner's go** (2026-10-05): finish everything that
   needs no eyes, say it is ready, and wait. **A tour the spec plans is always done, and before the
   commit** (2026-11-14): never offered as optional, never traded for green tests, never begun
   without the owner's go; the diff summary and the commit's OK (rule 1) follow the tour
   (2026-11-21). The assistant opens the windows itself (2026-11-21): a before/after comparison as
   two windows side by side, an action as the page already on it. Where obligation 4 allows it,
   **open the page for the owner, already authenticated**: one item per message, one page at a
   time, waiting for the outcome; two pages together only for a comparison (the same URL under two
   identities), saying which window is which.
   Only what a probe cannot say: layout, whether the screen says what it must say, the words,
   whether an action gives feedback. State also **what that tour does not cover**, and never ask
   the owner to redo by hand something already verified. Whatever the tour finds becomes an
   assertion before the session ends: the tour does not replace the tests.
   **The windows have a width and a way to close** (2026-11-24): a phone check opens at a FIXED
   viewport (`viewport: { width: 390, height: 844 }`, a helper option), never `viewport: null`.
   The helper closes the windows it opened with the
   platform's tool (`taskkill /T /F` on Windows), sparing its own parents.

**A before/after comparison of screenshots is shown cropped, one item at a time** (2026-10-30): never
a folder of files. The agent opens a browser window on an HTML page with BEFORE and AFTER **cropped
to the area that changes** (one above the other; side by side for phone screenshots), **enlarged**
when the difference is a few pixels, titled with where to look, the crop checked with a headless
screenshot first. The message says «Comparison N of M», what changes and which side is which; the
window rules of obligation 5 apply.

**A window ends by itself, and is closed by its tree** (2026-11-09). The script that opens a visible
browser exits when the owner closes the **page** (`disconnected` alone never fires), when the browser goes, or after a time limit — one
wait, written **once** in a helper the throwaway scripts import. A window is closed by its root
with the whole tree (stopping the background task kills only the shell), then the count says zero.
**Once the owner confirms an item, the agent closes its windows** (2026-11-13; the comparison page
too, 2026-11-21: it opens in a driven window, never in the owner's default browser): it stops the
helper by its root, checks the count at zero and only then opens
the next item. The owner never closes a window to move on.

### Standard phases, when they make sense

| | Phase | What it establishes |
| --- | --- | --- |
| **A** | Invarianza | What worked before still works |
| **B** | Cambio di contesto | The new role/state is genuinely active |
| **C** | Comportamento nuovo | It does what it must, and not what it must not (obligation 4) |
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

**No collaudo script outlives its session** (2026-11-09; the services too, 2026-11-13). `node ~/.claude/processi-collaudo.mjs` counts the
trees of `scripts/collaudo-*` alive in the repo and the services a session starts and forgets (the
Firebase emulators, the Next.js `dev`/`start` servers), and says whose they are: this session's
(closed with `--chiudi`), another open session's (never touched), or unknown (named to the owner,
closed with `--chiudi --anche-ignote` only on their yes). The count is the **first gate** of every
repo's gate list: zero, or none starts. The standard `settings.json` runs it with `--hook` at
`SessionEnd`; a session that dies
without ending is caught by the next gate and by the count at every session start
(`prompts/01_SESSION_START.md`).
*A verification that was not recorded counts as not done.*

**The outcome is one line, the signals are not** (2026-10-19). In `CLAUDE.md` the session's status
entry says what was done, where it is documented, what is open and what comes next; it replaces the
previous one. The session's signals — type-check, test counts, E2E runs, flakes, skipped phases, the
guided tour's walk and findings (2026-10-23) — go in the commit message and, where they teach
something, in the area's guide, never in `CLAUDE.md`, which is injected into every turn: of the
tour it keeps only the outcome, done and closed or what is left open.

---

## 3. What this means in THIS repo

The rules above are the standard. This section is the local translation of obligations 4 and 5 — it
changes from repo to repo and is the only part to rewrite when the tooling changes.

### The commands (installed on 2026-10-24 unless the column names a later spec; that spec's row is real once it is implemented)

| Purpose | Command | Since |
| --- | --- | --- |
| Collaudo count (first gate) | `node ~/.claude/processi-collaudo.mjs` — zero collaudo trees and forgotten services (the Next `dev`/`start` server), or the gates do not start (§ 2) | 2026-11-14 |
| Types | `pnpm typecheck` (`tsc --noEmit`) | 2026-10-24 |
| Lint + format | `pnpm lint` (`biome check .`; `pnpm lint:fix` to write) | 2026-10-24 |
| Unit tests | `pnpm test` (Vitest, `TZ=Europe/Rome` set by `vitest.config.ts`) | 2026-10-24 |
| Build | `pnpm build` (`next build --webpack`, kept for the service worker) | 2026-10-24 |
| Browser tests | `pnpm test:e2e` (Playwright on a production build on :3100, `file:e2e.db`; fake Blob and Anthropic behind `E2E_FAKE_SERVICES=1` since 2026-10-26, which also turns the rate limit off) | 2026-10-24 |
| Database | `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`, `pnpm db:seed` (the two seed users, with invented houses, supplies, bills and self-readings); `pnpm db:migrate:prod` (production, reads `.env.turso-prod`) | 2026-10-24 / 2026-10-25 |
| Market references | `pnpm riferimenti:update` (ARERA, writes `data/riferimenti/*.json`), `pnpm riferimenti:pun -- <AnnoYYYY.zip> [--prod]` (GME zip downloaded by hand; writes `local.db`, or production with `--prod`, which reads `.env.turso-prod`) | 08 |
| Blob housekeeping | `pnpm documents:prune` (dry run; `-- --delete` removes orphan files; `-- --prod` targets production through `.env.turso-prod`) | 2026-10-26 |
| Fixtures | `pnpm fixture:bills` (rewrites the synthetic bill PDFs in `tests/fixtures/bills/`) | 2026-10-26 |
| Icons | `pnpm icons` | 09 |

Gates before a commit, in this order: `node ~/.claude/processi-collaudo.mjs` (the collaudo count: zero, or nothing starts), then `pnpm typecheck && pnpm lint && pnpm test && pnpm build`,
then `pnpm test:e2e` (it builds its own production server: no dev server may run beside it). A red
one stops the session. pnpm is the package manager (`packageManager: pnpm@11.22.0`,
`corepack enable`); Node ≥ 22.

Browser tests: workers 2 · isolation one `e2e.db` shared, the seed users read-only, every writing test signs up its own user (paths in `tests/e2e/helpers.ts`) · whole run 2,1 min on 2026-11-28 (81 tests)

### The isolated environment

- **Database**: `TURSO_DATABASE_URL="file:local.db"` in `.env.local` is the development database;
  unit and repository tests use a fresh temp **file** per test with the real migrations
  (`createTestDb()`, never `:memory:` — AGENTS.md § Gotchas); Playwright uses `file:e2e.db`
  rebuilt by its global setup. Production Turso is reached only through `.env.turso-prod`
  (gitignored, 2026-10-25), read by `pnpm db:migrate:prod` and by the scripts that take `--prod`
  (`riferimenti:pun`, `documents:prune`); never by exporting variables into the shell. Without
  `--prod` those scripts refuse a database URL that does not start with `file:`.
- **Blob**: development uses its own private store (`segnabollette-files-dev`, 2026-10-25), never the
  production one; tests and Playwright never touch Blob (fake store behind the container).
- **Anthropic**: tests and Playwright never call it (fake extractor behind the container, fixture
  extractions in `tests/fixtures/extractions/`). A real extraction happens only in a guided
  verification, after the owner's OK, with its estimated cost stated first (≈ 0,30 $ per bill
  with `claude-opus-5-5`); in the app an extraction starts only from the «Estrai» button, which
  shows the estimate.

### Obligation 5 — how to hand the owner an app already authenticated

- `pnpm dev` on :3000 with `.env.local` (`SIGNUP_ENABLED="true"` locally). `pnpm db:seed` creates
  two seed users, `seed-a@example.test` and `seed-b@example.test`, password `seed-password-1`,
  with invented houses, supplies, bills and self-readings (round numbers, decoy words). The
  throwaway Playwright script of a verification logs in with `POST /api/auth/sign-in/email` (with an `Origin` header)
  and saves `playwright/.auth/<user>.json` (gitignored), then opens the page already
  authenticated. Isolation checks use the pair: seed A's resource (must open) and seed B's
  resource (must be refused) with the same request.
- Phones (camera capture on Android and iPhone, installing the PWA, the offline queue on a real
  device) are the only part the owner must do by hand (the camera since 2026-10-26, the rest with
  spec 09): a probe cannot press
  "Add to Home Screen".

### Inspecting real data state

`pnpm db:studio` on `local.db`; a throwaway `tsx` script with `createDb({ url: 'file:local.db' })`
(never `src/lib/db/client.ts`, which is server-only); in
production a throwaway `tsx` script with `loadProductionTarget()` and `createDb`, `SELECT` only,
printing counts and ids, never the owner's names or emails (2026-10-25). Blob: `vercel blob list --prefix users/`
on the store of the environment in question. Never judge an outcome from the page alone when a
row can be read.

### Branches

`main` is the default and the integration branch **and production** (a merged PR deploys, since 2026-10-25).
One branch per spec (`feature/NN-slug`, named in the spec header), one squashed commit, one PR to
`main` (since 2026-10-25, a second branch `docs/<NN>-in-esercizio` for the closing commit after the
production verification, § Where things are recorded); the monthly ARERA refresh (spec 08) uses `feature/riferimenti-<YYYY-MM>`. No `develop`, no
preview deployments: the ignored build step of `vercel.json` skips the build of every branch other
than `main` (verification runs locally, and in production after the merge). A fix found after the
closing commit goes on its own branch `fix/<slug>`, one squashed commit and a PR, like any change
to `main` (2026-10-25: the `ignoreCommand` fix `4b5ee0a` went to `main` directly, a one-off the
owner accepted).

### Where things are recorded

- **SESSION_NOTES.md**: untracked scratch file in the root, created at the start of every session
  and deleted at its end. Before the closing prompt it ends with one block per thing learned or
  decided: *Cosa* (what was done) · *Perché* (the decision behind it) · *Nota* (traps and
  measures, each with its date) · *Dove va a fine sessione* (AGENTS.md if it holds for the whole
  repo · `doc/guide/<tema>.md` if it is a domain lesson · WORKFLOW.md if it is a session rule ·
  CLAUDE.md if it is project status · a comment on the right line if it is the why of a line).
  Every item is written to its destination before the file is deleted.
- **A verification in production happens after the merge** (2026-10-24, specs 05–09; revised
  2026-10-25, owner's decision): the session makes its implementation commit and its PR **before**
  the merge (status «implementata»); after the merge, in the same session, the owner and the agent
  run the production verification, then the session closes like any other (session-end prompt):
  outcome, gotchas and the status «in esercizio» written where they belong, `SESSION_NOTES.md`
  deleted, one closing commit on `docs/<NN>-in-esercizio` from the updated `main`, and its PR. It
  is the one exception to rule 1.3: such a session has two commits, the implementation and the
  closing one. The retirement of the spec comes next, in a session of its own.
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
