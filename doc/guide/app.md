# App — pages, actions, forms and the E2E rules

> Domain guide (born 2026-10-24 with the manual entry). AGENTS.md § 7 keeps a stub that points
> here; the visual system (tokens, type, components) is DESIGN.md, the product voice PRODUCT.md.
> Every rule names the file that implements it; when the code and this page disagree, the code is
> right and this page is fixed in the same change. All figures below are invented.

## 1. Routes

Everything behind login lives in `src/app/(app)/`: its `layout.tsx` checks the session
(`getSessionUser`, redirect to `/accedi?next=…`) and wraps the page in `AppShell`. `/accedi` and
`/registrati` live in `src/app/(auth)/`, with a layout of their own (cloth band and logo).

| Route | Query | What it shows |
|---|---|---|
| `/` | `casa=<houseId>` (only with more than one house) | «Casa»: one `supply-card` per non-archived supply with its latest bill; empty state «Comincia creando la tua casa» |
| `/forniture` | `archiviate=1` | Houses (create, rename, delete with a summary) and their supplies |
| `/forniture/[id]` | — | One supply: facts, «Modifica», «Archivia»/«Riattiva», «Elimina», its bills, its last 10 readings |
| `/bollette` | `fornitura=<supplyId>`, `pagina=<n>` | Bills, newest first, 50 a page |
| `/bollette/nuova` | `fornitura=<supplyId>` | Without the query: the choice of the supply; with it: `BillForm` |
| `/bollette/[id]` | — | The bill: facts, lines grouped by category with subtotals, readings |
| `/bollette/[id]/modifica` | — | `BillForm` on the confirmed bill; a replaced bill redirects to its page |
| `/letture` | `fornitura=<supplyId>` | `SelfReadingForm` (metered, non-archived supplies) and the reading list |
| `/impostazioni` | — | Account, «Esci», theme, «Elimina account» |

Rules every page follows (`src/app/(app)/page-helpers.ts`):

- `pageUser()` gives the session user (the layout already redirected the anonymous visitor).
- A foreign or unknown id — in the path or in the query — is a **404**, never a 403 and never an
  empty page: `orNotFound(promise)` turns a `NOT_FOUND` from a service into `notFound()`.
  `src/app/not-found.tsx` says «Pagina non trovata» / «Questa pagina non esiste o non è tua.».
- `queryValue(raw)` takes the first value of a query parameter; `pageNumber(raw)` reads `pagina`
  (1 when missing or invalid).

## 2. Read services used by the pages

All `(db, userId, …)`, all refuse a foreign id with `NOT_FOUND`:

- `src/lib/services/houses-supplies.ts`: `listHousesWithSupplies(db, userId, { includeArchived })`,
  `getSupplyDetail` (supply + house), `getDeletionSummary` (counts shown before a delete).
- `src/lib/services/bills.ts`: `listBills` (filter and page), `listLatestBills` (the latest
  confirmed bill of each supply, for «Casa»), `getBillDetail`, `billInputFromDetail` (a confirmed
  bill back into the form's input).
- `src/lib/services/readings.ts`: `listReadings`, `suggestedRegisters`, `latestReadings` (§ 6).

With more than one house a supply is named `formatSupplyLabel` → «Luce · Casa Gabbiano»
(`src/lib/format.ts`): `listBills` and `listReadings` return it, and the pages use it for the
supply filter and the self-reading choice; with one house the name alone.

## 3. Server Actions

Colocated in the route folder (`actions.ts`, only async exports) with their zod schemas beside them
(`schemas.ts`). One shape for all of them:

```ts
export async function renameHouseAction(houseId: string, input: unknown) {
  return toActionResult(async () => {
    const id = parseInput(IdSchema, houseId);       // shape of the arguments → VALIDATION
    const { name } = parseInput(HouseNameSchema, input);
    const user = await requireUser();               // inside: an expired session is a result
    await renameHouse(getDb(), user.id, id, name);
    revalidatePath('/forniture');                    // only on ok
  });
}
```

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

## 4. The shell

`src/components/shell/app-shell.tsx` is a client component (it reads `usePathname`): a bottom bar on
phones (`nav-bar`, below `lg`) and a side bar on desktops (`side-bar`), both
`<nav aria-label="Principale">` over the same `NAV_ITEMS` (`nav-items.ts`: Casa, Bollette, Letture,
Forniture, Impostazioni). `isNavItemActive`: «Casa» only on `/`, every other item on its path and
below it; the active link has `aria-current="page"`. A later page adds no item: it lives under one
of the five. The bars use the cloth (`bg-brand`) and focus with `outline-on-brand`.

## 5. The bill form — `src/components/bills/bill-form.tsx`

One client component for the manual entry and, from the extraction on, for the review:
`BillForm({ supply, initial, blankAmounts, submitLabel, nextPath, onSubmit })`.

- **Draft as strings** (`bill-draft.ts`): `draftFromInput(input, { blankAmounts })` turns the
  `BillInput` into strings the inputs own — cents and micro-euros through `formatDecimalInput`
  (`src/lib/format.ts`, Italian comma, no thousands separator, no trailing zeros — «30,5» —, at
  most 2 decimals for euro, 6 for unit prices); `inputFromDraft(draft)` parses back with `parseDecimalInput`, collects field errors
  by path («Importo obbligatorio», «Totale obbligatorio», «Valore obbligatorio» for a reading,
  «Numero non valido», «Al massimo N decimali») and then runs `BillInputSchema` (its issues land on the same paths). A line without
  «Periodo diverso» takes the bill's period. `draftFigures` gives the live «Riepilogo» (sums by
  category, «Totale calcolato», `ArithmeticWarnings`) without blocking on half-typed fields.
- **New bill**: the page builds the input with `emptyBillInput(supply, today)` from
  `line-templates.ts` — last month's period and the lines of `lineTemplateFor(kind,
  hasPhotovoltaic)` — and passes `blankAmounts`: the line amounts and «Totale bolletta» start
  empty and must be typed (a zero is never assumed). Templates: electricity «Energia» (kWh), sale,
  network, system, excise, VAT (plus «Energia ceduta» with panels); gas the same in Smc; water
  variable share (m³), fixed share, sewerage, equalisation, VAT; internet/phone «Canone» and VAT;
  TARI one «TARI» line.
- **Layout**: the lines are one `<table>` with a `<tbody data-testid="bill-line">` per line: cards
  on phones (labels visible), a table from `md` up (labels `sr-only`, the column headers
  instead). Up/down/remove per line, «Aggiungi voce»; readings of the bill below (`bill-reading`).
- **Errors**: a field shows its error after blur or after the first submit; on submit the first
  invalid field gets focus and `form-errors` says «Correggi i campi segnati in rosso.». Server
  results: `VALIDATION` lists its details, `UNAUTHORIZED` asks to sign in again (the form keeps
  what was typed), any other code shows its message.
- **Overlap**: `OVERLAP_DECISION_REQUIRED` opens `overlap-panel` with links to the overlapping
  bills and two choices — «Si somma: è un conguaglio o una bolletta in più» (`add`) or
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
  (`[data-theme='dark']`, and `prefers-color-scheme: dark` under `[data-theme='system']`).
- Components use only token utilities (`bg-surface`, `text-ink`, `border-rule`, `text-action`…):
  `@theme` opens with `--color-*: initial`, so the default Tailwind palette does not exist, and the
  `dark:` variant is never used — a dark value is a token, not a class. Literal colours only in
  `globals.css`. Shared class strings live in `src/components/ui/styles.ts` (`buttonClass`,
  `inputClass`, `figureInputClass`, `panelClass`, `columnHeaderClass`…).
- Figures use tabular numbers and align right; the «stimata», «sostituita» and «archiviata»
  states are `Stamp` (`src/components/ui/stamp.tsx`), its tilt animated only under
  `motion-safe`.

## 8. E2E rules

- Helpers in `tests/e2e/helpers.ts`: `signUpTestUser(page, prefix)` (a fresh user
  `<prefix>-<nanoid>@example.test`), `gotoReady` / `waitForHydration` (waits for
  `body[data-hydrated]`, set by `src/components/hydration-mark.tsx`: a form filled before
  hydration would submit natively), `createHouse`, `createSupply` (returns the id), `enterBill`,
  `seedIds(email)` (ids of a seed user's first house, supply and bill, read from `e2e.db`).
- Seed users A and B are read-only: they serve `shell`, the isolation reads, the theme (a cookie
  of the browser, nothing in the database) and `a11y`. Every test that writes signs up its own
  user and builds its house through the UI.
- Decoy words differ per file: Quokka (`forniture`), Capibara (`bolletta-manuale`), Tucano
  (`letture`), Koala (`impostazioni`), Ibis (`isolamento`), Lontra (`auth`). A new file picks a
  new animal.
- `a11y.spec.ts` runs axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) on every page, light and
  dark, in both projects; a new page is added to its list.
- `data-testid` on what the tests drive: `supply-card`, `supply-row`, `supply-form`,
  `house-panel`, `supply-identifier`, `deletion-summary`, `bill-row`, `bill-line`, `line-amount`,
  `bill-total`, `computed-total`, `bill-reading`, `overlap-panel`, `line-group`,
  `group-subtotal`, `arithmetic-warnings`, `form-errors`, `field-error`, `reading-row`,
  `self-reading-form`, `lower-reading-warning`, `delete-account`, `confirm-dialog`, `nav-bar`,
  `side-bar`.
- Italian numbers in assertions: `it-IT` groups thousands only from five digits, so `1100 kWh`,
  not `1.100` (2026-10-24), as `formatQuantity` prints them.
