# App — pages, actions, forms and the E2E rules

> Domain guide (born 2026-10-24 with the manual entry). AGENTS.md § 7 keeps a stub that points
> here; the visual system (tokens, type, components) is DESIGN.md, the product voice PRODUCT.md.
> Every rule names the file that implements it; when the code and this page disagree, the code is
> right and this page is fixed in the same change. All figures below are invented.

## 1. Routes

Everything behind login lives in `src/app/(app)/`: `src/proxy.ts` sends a request without the
session cookie to `/accedi?next=…`; the real guard is `layout.tsx`, which reads the session
(`getSessionUser`), sends an invalid or expired one to `/accedi` and wraps the page in `AppShell`.
`/accedi` and `/registrati` live in `src/app/(auth)/`, with a layout of their own (cloth band and
logo).

| Route | Query | What it shows |
|---|---|---|
| `/` | `casa=<houseId>` (only with more than one house), `periodo=12\|24\|tutto` | «Casa»: period selector, the two tiles, the house costs chart, then one `supply-card` per non-archived supply with its latest bill and its last billed month (§ 9); empty state «Comincia creando la tua casa» |
| `/forniture` | `archiviate=1` | Houses (create, rename, delete with a summary) and their supplies |
| `/forniture/[id]` | `periodo=12\|24\|tutto` | One supply: facts, «Modifica», «Archivia»/«Riattiva», «Elimina», period selector and charts (§ 9; without bills «Ancora nessuna bolletta: aggiungi la prima»), its bills, its last 10 readings |
| `/bollette` | `fornitura=<supplyId>`, `pagina=<n>` | Bills, newest first, 50 a page |
| `/bollette/nuova` | `fornitura=<supplyId>` | Without the query: the choice of the non-archived supplies; with it: `BillForm` (an archived supply opens too: past bills of a closed supply) |
| `/bollette/carica` | — | `BillUploader`: a PDF or photos to extract (`doc/guide/estrazione.md`) |
| `/bollette/importa` | `lotto=<batchId>` | `BulkImporter`: «Lotti in sospeso» and a new batch of up to 50 bills; with the query, that batch's rows and «Riprendi» (`doc/guide/estrazione.md` § 13) |
| `/bollette/da-rivedere` | `lotto=<batchId>` | Extractions queued, running, extracted or failed, with their actions; with the query, one batch from its oldest period (another user's batch: an empty list) |
| `/bollette/revisione/[id]` | — | The document beside `BillForm` prefilled by the extraction, «Conferma» / «Scarta» |
| `/bollette/[id]` | — | The bill: facts, lines grouped by category with subtotals, readings, «Documenti» (its files, «Allega») |
| `/bollette/[id]/modifica` | — | `BillForm` on the confirmed bill; a replaced bill redirects to its page |
| `/letture` | `fornitura=<supplyId>` (404 for a flat-fee or archived supply, which the form does not list) | `SelfReadingForm` (metered, non-archived supplies) and the latest 100 readings |
| `/impostazioni` | — | Account, «Esci», theme, «Elimina account» |

Rules every page follows (`src/app/(app)/page-helpers.ts`):

- `pageUser()` gives the session user (the layout already redirected the anonymous visitor).
- A foreign or unknown id — in the path or in the query — is a **404**, never a 403 and never an
  empty page: `orNotFound(promise)` turns a `NOT_FOUND` from a service into `notFound()`.
  `src/app/not-found.tsx` says «Pagina non trovata» / «Questa pagina non esiste o non è tua.».
- `queryValue(raw)` returns one non-empty value of a query parameter (a repeated or empty one
  counts as absent); `pageNumber(raw)` reads `pagina` (1 when missing or not an integer from 1).

## 2. Read services used by the pages

All `(db, userId, …)` except the pure `billInputFromDetail`. `getSupplyDetail`,
`getDeletionSummary`, `getBillDetail`, `suggestedRegisters` and `latestReadings` refuse a foreign
id with `NOT_FOUND`; `listLatestBills` maps it to `null`; the lists return only the user's rows (a
foreign `fornitura` filter gives an empty list, and the page has already answered 404):

- `src/lib/services/houses-supplies.ts`: `listHousesWithSupplies(db, userId, { includeArchived })`,
  `getSupplyDetail` (supply + house), `getDeletionSummary` (counts shown before a delete).
- `src/lib/services/bills.ts`: `listBills` (filter and page), `listLatestBills` (the latest
  confirmed bill of each supply, for «Casa»), `getBillDetail`, `billInputFromDetail` (a confirmed
  bill back into the form's input).
- `src/lib/services/readings.ts`: `listReadings`, `suggestedRegisters`, `latestReadings` (§ 6).
- `src/lib/services/dashboard.ts`: `getSupplyDashboard`, `getHouseDashboard` (§ 9).

Two reads are guarded twice: `getSupplyDetail` reads the supply and then its house with the user,
`getBillDetail` the bill and then its supply. Dropping `userId` from `getSupply` or `getBill` alone
therefore leaves them refusing (and `isolamento.spec.ts` green); what goes red is the service tests
that read through one guard only — `getDeletionSummary({ supplyId })`, the supply writes,
`suggestedRegisters`, and the edit and delete pairs of `bills.test.ts` (measured 2026-10-24).
«Casa» instead is refused by `getHouseDashboard` alone: the page does not look the house up again
in the user's list, so dropping `userId` from `getHouse` turns `/?casa=<B's house>` into a 200 and
`isolamento.spec.ts` red (measured 2026-10-24; with a second lookup it stayed green).

With more than one house a supply is named `formatSupplyLabel` → «Luce · Casa Gabbiano»
(`src/lib/format.ts`): `listBills` and `listReadings` return it, and the pages use it for the
supply filter and the self-reading choice; with one house the name alone.

## 3. Server Actions

Colocated in the route folder (`actions.ts`, only async exports) with their zod schemas beside them
(`schemas.ts`). One shape for all of them (`bollette/actions.ts`):

```ts
export async function saveBillAction(billId: string | null, input: unknown) {
  return toActionResult(async () => {
    const editedId = parseInput(OptionalBillIdSchema, billId); // shape of the arguments → VALIDATION
    const user = await requireUser();          // inside: an expired session is a result, not a throw
    const saved = await confirmBill(getDb(), user.id, input, {
      source: 'manual',
      billId: editedId ?? undefined,
    });
    revalidateBillPages(SavedSupplySchema.parse(input).supplyId); // reached only on success
    return { billId: saved.billId };
  });
}
```

- Arguments arrive from the browser, so they are typed `unknown` (or checked like `billId`) and
  parsed first. The house and supply actions wrap `toActionResult` in `withRevalidation`
  (`forniture/actions.ts`), which revalidates their five pages only when the result is ok.

- `parseInput` (`src/lib/parse-input.ts`) runs `safeParse` and throws
  `DomainError('VALIDATION', undefined, messages)`; `resultMessages(result)` gives the client the
  lines to show.
- Bills and self readings are validated by their services (`confirmBill` with `BillInputSchema`,
  `createSelfReadings` with `SelfReadingInputSchema`): their actions pass the input as it is.
- A client component receives only a Server Action, never a closure written in the page: the bill
  pages pass `saveBillAction.bind(null, null)` (new) or `saveBillAction.bind(null, bill.id)`
  (edit). The id travels in the POST body, so the service checks it again (the isolation test
  swaps it).
- Actions: `forniture/actions.ts` (houses and supplies), `bollette/actions.ts` (`saveBillAction`
  → `{ billId }`, `deleteBillAction` → `{ supplyId }`), `letture/actions.ts`
  (`createReadingsAction` with `today = romeToday(Date.now())`, `deleteReadingAction`),
  `impostazioni/actions.ts` (`setTheme`). Each revalidates the pages that show the data.
- Deletions ask first in `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`, a native
  `<dialog>` opened with `showModal`), never `window.confirm`; the house dialog shows
  `getDeletionSummary` through `deletionSummaryText` («Eliminerai 2 forniture, 0 bollette e 0
  letture.», singular when a count is 1).
- «Elimina account» (`src/components/settings/delete-account.tsx`) asks for the password and the
  box «Ho capito che bollette, letture e file vengono cancellati per sempre», calls
  `authClient.deleteUser({ password })` and goes to `/accedi`; `INVALID_PASSWORD` says «Password
  non corretta.», any other error «Non è stato possibile eliminare l'account: riprova più tardi.».
  The data goes in the server hook (`deleteAllUserData`, AGENTS.md § 5).

## 4. The shell

`src/components/shell/app-shell.tsx` is a client component (it reads `usePathname`): a bottom bar on
phones (`nav-bar`, below `lg`) and a side bar on desktops (`side-bar`), both
`<nav aria-label="Principale">` over the same `NAV_ITEMS` (`nav-items.ts`: Casa, Bollette, Letture,
Forniture, Impostazioni). `isNavItemActive`: «Casa» only on `/`, every other item on its path and
below it; the active link has `aria-current="page"`. A later page adds no item: it lives under one
of the five. The bars use the `cloth` utility (`globals.css`: `--color-brand` with a faint weave)
and focus with `outline-on-brand`.

`AppShell` takes `{ children }` and grows only in two ways: props computed by the server layout
`(app)/layout.tsx`, which stays the guard (a count of bills to review, the user id for the offline
queue), and client components mounted inside it. It has no header: something that must sit above
every page goes at the top of the content column, above `<main>`.

## 5. The bill form — `src/components/bills/bill-form.tsx`

One client component for the manual entry and, from the extraction on, for the review:
`BillForm({ supply, initialValue, blankAmounts?, overlaps?, submitLabel, onSubmit })`, where
`onSubmit(input)` returns `ActionResult<{ billId; nextPath? }>` and a successful save goes to
`nextPath`, otherwise to `/bollette/<billId>` (the caller does not navigate). `overlaps` opens
the overlap panel from the start (the review knows them); manual entry learns them on save.

- **Draft as strings** (`bill-draft.ts`): `draftFromInput(input, { blankAmounts })` turns the
  `BillInput` into strings the inputs own — cents and micro-euros through `formatDecimalInput`
  (`src/lib/format.ts`, which also does the division by its `scale`, 2026-10-24: the form never
  divides; Italian comma, no thousands separator, no trailing zeros — «30,5» —, at
  most 2 decimals for euro, 6 for unit prices; quantities and readings keep 20 digits and are never
  rounded, so a fee pro rata 30/365 comes back identical); `inputFromDraft(draft)` parses back with `parseDecimalInput`, collects field errors
  by path («Importo obbligatorio», «Totale obbligatorio», «Numero non valido», «Al massimo N
  decimali») and then runs `BillInputSchema` (its issues land on the same paths). A line without
  «Periodo diverso» takes the bill's period. `draftFigures` gives the live «Riepilogo» (sums by
  category, «Totale calcolato», `ArithmeticWarnings`) without blocking on half-typed fields.
  «Fuori bolletta» is not among the categories: it goes under «Totale calcolato», followed by
  «Da pagare» (`computed-amount-due`, total plus outside), the figure the bill prints as the
  amount due (owner, 2026-10-25).
- **Readings as rows** (owner, 2026-10-25): the draft holds them the way a bill prints them, one
  row per date and source (`BillReadingRowDraft`: `readOn`, `source`, `values` by register) plus
  `readingRegisters`, the columns, in `READING_REGISTERS` order. An empty cell means the bill
  prints nothing for that register and is skipped; errors land on `readings.<row>.<register>`.
  A new electricity bill starts with F1/F2/F3 (`defaultRegisters`); «Registri» toggles the
  columns («Monoraria» for `single` on electricity) and keeps one that has values. «Aggiungi
  data» adds a row dated at the end of the period. `BillInput.readings` is unchanged.
- **New bill**: the page builds the input with `emptyBillInput(supply, today)` from
  `line-templates.ts` — last month's period and the lines of `lineTemplateFor(kind,
  hasPhotovoltaic)` — and passes `blankAmounts`: the line amounts and «Totale bolletta» start
  empty and must be typed (a zero is never assumed). Templates: electricity «Energia» (kWh), sale,
  network, system, excise, VAT (plus «Energia ceduta» with panels); gas the same in Smc; water
  variable share (m³), fixed share, sewerage, equalisation, VAT; internet/phone «Canone» and VAT;
  TARI one «TARI» line.
- **Fields**: «Consumi stimati» is there for every kind (a flat-fee bill marked estimated, by hand
  or by the extraction, must be clearable) and also marks the commodity lines that are not
  recalculations; the band select lists «—», F1, F2, F3, F23, then «unica» (electricity only).
- **Layout by the form's own width** (owner, 2026-10-25): the form is a `@container` and lays
  itself out with container queries, never the window's breakpoints, because the review puts it
  in a column about 450 px wide on a desktop. Dates two per row, four from `@2xl`; field pairs
  from `@md`/`@lg`. The lines are one `<table>` with a `<tbody data-testid="bill-line">` per
  line, and the readings one `<tr data-testid="bill-reading">` per date: cards below `@3xl`
  (labels visible), a table from `@3xl` (labels `sr-only`, the column headers instead).
  Up/down/remove per line, «Aggiungi voce». `estrazione.spec.ts` guards it with
  `fieldsOutOfTheForm` (every field inside the form and at least 40 px wide).
- **Errors**: a field shows its error after blur or after the first submit; on submit the first
  invalid field gets focus and `form-has-errors` says «Correggi i campi segnati in rosso.». Server
  results go into `form-errors`: `VALIDATION` lists its details, `UNAUTHORIZED` asks to sign in
  again in another tab (the form keeps what was typed), any other code shows its message.
- **Overlap**: `OVERLAP_DECISION_REQUIRED` opens `overlap-panel` with links to the overlapping
  bills and two choices — «Si somma: è un conguaglio o una bolletta in più» (`sum`) or
  «Sostituisce quella vecchia» (`replace`); the submit stays disabled until one is chosen and the
  next save sends it as `overlapDecision`. Replaced bills show the «sostituita» stamp, have no
  «Modifica» and come back to normal when the bill that replaced them is deleted.

## 6. Self readings — `src/components/readings/self-reading-form.tsx`

- **Registers**: `suggestedRegisters(db, userId, supplyId)` gives F1/F2/F3 as soon as any counted
  reading of an electricity supply uses a band (the same rule the engine uses to pick registers:
  a «single» reading on a banded supply would never count), otherwise one «Lettura» field; with
  panels it adds «Immessa» and «Produzione». The page computes them for every choice
  (`registersBySupply`) so switching supply does not reload.
- **Date**: default today (Rome), `max` today; a future day is refused by the service with
  «La lettura non può essere nel futuro.».
- **Lower value**: `latestReadings` gives the last counted reading per register; a typed value
  below it shows `lower-reading-warning` «Il valore è più basso dell'ultima lettura (X del
  gg/mm/aaaa): …» under the field. The warning does not block: «Salva» opens the dialog «Salvare
  comunque?» and «Salva comunque» saves.
- Empty fields are skipped; no value at all says «Scrivi almeno un valore.». The list shows source
  «autolettura» or «da bolletta»; only self readings have «Elimina» (the bill's readings change
  with the bill). Below `sm` the table folds (`reading-table.tsx`): supply and source join the
  register cell, so the value never needs a sideways scroll.

## 7. Theme and tokens

- The `theme` cookie (`system | light | dark`, `src/lib/theme.ts`) is read by the root layout and
  written by `setTheme`; `<html data-theme>` picks the token set in `src/app/globals.css`
  (`[data-theme='dark']`, and `prefers-color-scheme: dark` under `[data-theme='system']`). The
  server writes the attribute, so there is no inline script and no flash on load.
- Components use only token utilities (`bg-surface`, `text-ink`, `border-rule`, `text-action`…):
  `@theme` opens with `--color-*: initial`, so the default Tailwind palette does not exist, and the
  `dark:` variant is never used — a dark value is a token, not a class. Literal colours only in
  `globals.css`. Shared class strings live in `src/components/ui/styles.ts` (`buttonClass`,
  `inputClass`, `figureInputClass`, `panelClass`, `columnHeaderClass`…). The check, empty on
  2026-10-24 (the first outside `globals.css`):
  `grep -rnE "oklch\(|hsla?\(|rgba?\(|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b" src/components src/app`,
  `grep -rnE "(bg|text|border|fill|stroke|ring)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}" src`,
  `grep -rnE "dark:[a-z]" src`.
- Figures use tabular numbers and align right; the «stimata», «sostituita» and «archiviata»
  states are `Stamp` (`src/components/ui/stamp.tsx`), its tilt animated only under
  `motion-safe`.

## 8. E2E rules

- Helpers in `tests/e2e/helpers.ts`: `signUpTestUser(page, prefix)` (a fresh user
  `<prefix>-<nanoid>@example.test`), `gotoReady` / `waitForHydration` (waits for
  `body[data-hydrated]`, set by `src/components/hydration-mark.tsx`: a form filled before
  hydration would submit natively), `createHouse`, `createSupply` (returns the id), `enterBill`,
  `seedIds(email)` (ids of a seed user's first house, supply and bill, read from `e2e.db`),
  `SEED_A_STATE` and `SEED_B_STATE` (the two seed sessions saved by the global setup).
- An isolation read is a pair on the same URLs: A gets a 404 on B's ids, and B opens them under
  its own session, so the 404 comes from the owner check and not from an id that does not exist
  (`isolamento.spec.ts`, 2026-10-24).
- Seed users A and B are read-only: they serve `shell`, the isolation reads, the theme (a cookie
  of the browser, nothing in the database) and `a11y`. Every test that writes signs up its own
  user and builds its house through the UI.
- Decoy words differ per file: Quokka (`forniture`), Capibara (`bolletta-manuale`), Tucano
  (`letture`), Koala (`impostazioni`), Ibis (`isolamento`), Lontra (`auth`), Pellicano
  (`estrazione`), Gazza (`import`). A new file picks a new animal.
- `a11y.spec.ts` runs axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) on every page, light and
  dark, in both projects; a new page is added to its list.
- `data-testid` on what the tests drive: `supply-card`, `supply-row`, `supply-form`,
  `house-panel`, `supply-identifier`, `deletion-summary`, `bill-row`, `bill-line`, `line-amount`,
  `bill-total`, `computed-total`, `bill-reading` (form), `bill-reading-row` (bill page),
  `overlap-panel`, `line-group`,
  `group-subtotal`, `arithmetic-warnings`, `form-errors`, `field-error`, `reading-row`,
  `self-reading-form`, `lower-reading-warning`, `delete-account`, `confirm-dialog`, `nav-bar`,
  `nav-active-tick`, `side-bar`, `chart-frame`, `kpi-tile`, `supply-last-month`,
  `extraction-warnings`, `pending-extraction`, `review-badge`, `bill-document`, `extraction-spend`,
  `import-row`, `import-estimate`, `pending-batch`.
- `dashboard.spec.ts` only reads seed A (no decoy word); `seedSupplyIds(email)` gives the seed
  supplies' ids by name. `a11y.spec.ts` opens every `<details>` before axe, so the charts' data
  tables are checked too.
- README screenshots (`doc/screenshots/`): a 390×844 viewport at scale 2, light theme, an account
  with invented data only, never `fullPage` (the fixed bottom bar would land in the middle of the
  image) and from a production build: `next dev` draws its indicator over the bar (2026-10-25).
- Italian numbers in assertions: `it-IT` groups thousands only from five digits, so `1100 kWh`,
  not `1.100` (2026-10-24), as `formatQuantity` prints them.

## 9. Dashboard and charts

**Data** — `src/lib/services/dashboard.ts` (the calculations: `doc/guide/calcoli.md` § 13):
`getSupplyDashboard(db, userId, supplyId, { today, range })` and `getHouseDashboard(db, userId,
houseId, { today, range })`, `range` `'12' | '24' | 'all'`. Both reread the supply or house with
the user: a foreign id is `NOT_FOUND`, a 404. The pages read `?periodo=` with `dashboardRange`
(`page-helpers.ts`: `12`, `24`, `tutto`, anything else `24`) and pass `today = romeToday(Date.now())`.

**Points** — `src/lib/charts/series.ts`, pure: `toConsumptionSeries`, `toUnitPriceSeries`,
`toCostSeries`, `toHouseCostSeries`, `toYearOverYearSeries(months, endMonth, 'consumption' |
'cost')`, `percentChange`, and the `ReferenceLine` type (market references; it lives in `src/lib`
because `src/lib` never imports from `src/components`). It is the one place beside `format.ts`
that divides by 100 and by 10⁶: points carry euros and euros per unit. A missing value is `null`,
never 0 (a band without consumption, a month without price, a cost month without billed days), so
Recharts draws a gap. Pages build the points; the chart components know neither the database nor
the engine.

**Formats** — points are already in euros, so axes, tooltips and tables use
`formatEuroValue(euro)` and `formatUnitPriceValue(euroPerUnit, unit)` (`formatEuro(47.3)` would
print «0,47 €»); quantities `formatQuantity`; the tiles take cents and micro-euros (`formatEuro`,
`formatUnitPrice`) and the change `formatPercentChange` («+10,0 %», «−4,5 %», typographic minus).

**Components** — `src/components/charts/`:

- `recharts.ts` (`'use client'`) is the only import of `recharts`.
- `ChartFrame` (`data-testid="chart-frame"`): title (h2) and unit, the plot at 240 px, 320 px from
  `md` (a `ResponsiveContainer` without a parent height draws nothing), the HTML legend, notes,
  and `<details><summary>Vedi i dati</summary>` with a table of one row per month (per bar),
  every cell formatted by `format.ts`; the table region is focusable for sideways scrolling.
- `chart-parts.tsx`: axis, grid and cursor styles, `CHART_MARGIN` (32 px on the right: the line
  chart centres its last month label on the plot's edge, and 20 px cut it at 390 px, 2026-10-25),
  `HatchPattern`, `StripePattern`, `ChartLegend`, `ChartTooltipBox` (value first, then the series
  name, a line key in the series colour); `dashboard.spec.ts` keeps every month label inside its chart.
- `ConsumptionChart`: bands F1/F2/F3/F23 and `single` stacked («Fascia unica» for electricity,
  «Consumo» for gas and water), then «da letture, non ancora fatturato» on the same stack
  (striped, bordered in `--color-readings`), «Autoconsumo» on the stack and «Immessa in rete» as a
  line with panels. Estimated months: hatched bands at opacity 0.55 through `Cell`, and a
  «stimato» legend entry; legend entries appear only when the range has them. Gas readings
  converted with C = 1 print «Coefficiente C non noto: i m³ delle autoletture sono convertiti con
  C = 1.».
- `UnitPriceChart({ points, unit, references?, note? })`: «Materia prima (senza IVA)» and «Costo
  totale per unità (IVA inclusa)», 2 px lines with ringed dots and gaps where there is no
  consumption; references dashed (empty until the market references exist); water passes the note
  «Per l'acqua non esiste una serie nazionale di riferimento: nessun confronto.».
- `CostsChart({ points, mode })`: `supply` the seven categories + «Energia ceduta» (hatched grey,
  below zero); `flat` the total only (no legend: one series); `house` the seven + «Canoni e
  tributi» + «Energia ceduta». Categories that are zero over the whole range are left out. The
  tooltip lists the non-zero segments and «Totale», net of the fed-in credit.
- `YearOverYearChart({ consumption, cost, unit, totals })`: «quest'anno» / «anno prima» side by
  side, a «Consumo / Spesa» switch for metered supplies (`aria-pressed`), and above it the
  `KpiTile`s «Ultimi 12 mesi · consumo» and «· spesa» (spending only for flat fees).
- `KpiTile({ label, value, change })` (`data-testid="kpi-tile"`): a number shows «+10,0 % sui 12
  mesi precedenti», `null` «— sui 12 mesi precedenti» (the periods are not comparable), absent no
  line.
- `PeriodSelector({ current, hrefFor })`: «12 mesi» · «24 mesi» · «Tutto» as links, the current one
  with `aria-current="true"`. On «Casa» its links keep `?casa=` and the house select keeps
  `?periodo=`.

**Rules of the charts** (DESIGN.md § Charts and the dataviz method):

- Colours only as tokens in `fill`/`stroke` (`var(--color-cat-*)`, `--color-band-*`,
  `--color-readings`, `--color-pv-*`, `--color-price-*`, `--color-yoy-*`); text in charts (ticks,
  legend, tooltip, table) wears the ink tokens; ticks are figures (`--font-print`, 11 px).
- Stacked charts use `stackOffset="sign"`: with the default offset a negative value starts from
  the top of the pile and covers the positive segments; with `sign` the fed-in credit, discounts,
  negative system charges and recalculations that sum below zero stack down from a zero line.
- Bars at most 24 px, a 1 px surface-coloured edge (a 2 px gap between touching segments), no
  rounded ends (DESIGN.md: square stationery); recessive solid grid; no Recharts animation (the
  stamp is the only motion); one axis per chart. SVG pattern ids come from `useId` stripped to
  `[A-Za-z0-9_-]`, since they are referenced as `url(#…)`.
- Every chart has its table; axe runs on the pages with the tables open.
- A new chart is drawn after loading the `dataviz` skill, whose rules (axes, legends, tooltips,
  contrast, the table) apply inside these constraints and the tokens of DESIGN.md.

**Pages** — `/forniture/[id]`: a metered supply shows consumption, unit price, costs, year over
year (four `chart-frame`); a flat fee costs and year over year (two, one tile). The year-over-year
points end at `lastBilledMonth ?? monthKeyOf(today)`. «Casa»: the line «Ultimi 12 mesi fatturati:
<from> – <to>» (absent without a billed month), the tiles «Spesa degli ultimi 12 mesi» (change only
when comparable) and «Spesa media mensile», `CostsChart mode="house"` (or «Ancora nessuna bolletta
in questa casa» when no supply, archived ones included, has a billed month), then the cards with
one more line from `lastBilled`: month · consumption · total unit price for metered supplies, month
· spending for flat fees, «Nessun mese fatturato» without one. No second list under the cards.

At 390 px the Y axes need room: 72 px for quantities («240 kWh»), 80 px for euros, 108 px for unit
prices («0,2400 €/kWh»), or the tick text wraps (measured 2026-10-24).
