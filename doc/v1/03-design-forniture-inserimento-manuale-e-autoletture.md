# 03 — Design, forniture, inserimento manuale e autoletture

> **Stato**: implementata il 2026-10-24, branch `feature/03-design-manual-entry`; collaudo A–G
> superato, giro guidato senza rilievi. Scostamento misurato: togliere `userId` da `getBill` non fa
> fallire `isolamento.spec.ts` (lo ferma il controllo della fornitura in `getBillDetail`; la
> mutazione la uccide Vitest, l'E2E cade togliendo entrambi i controlli). Scritta e riletta il
> 2026-10-24 (30 rilievi, decisioni D-47, D-49, D-50, D-51, D-52).
> **Branch**: `feature/03-design-manual-entry` da `main`. **Dipende da**: 02 (ritirata il 2026-10-24).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-5, D-7, D-13, D-24, D-28, D-29, D-38,
> D-39, D-40, D-47, D-49, D-50, D-51, D-52; scelte T-13, T-14, T-16, T-24, T-32; contratti: crea
> C-14, C-23 (`signUpTestUser`), C-24 (`AppShell`); aggiunge a C-8 (`formatDecimalInput` e le
> etichette di § 4.6) e a C-13 (i servizi di lettura di § 4.3 e § 4.7, `billInputFromDetail`); usa
> C-2, C-3, C-5…C-13, C-18, C-21.

## 1. Il problema oggi (prove)

1. Dopo la 02 esistono lo schema, il motore e i servizi, ma l'owner non può fare niente: la sola
   pagina è il segnaposto della 01 («Ciao, <nome>» e «Esci»).
2. Il vincolo di priorità (D-11) chiede di **inserire a mano** le prime bollette il prima possibile;
   l'inserimento a mano è anch'esso una conferma esplicita (D-7) e deve reggere le stesse forme
   dell'estrazione (la 06 riusa lo stesso modulo, C-14): voci con categoria e componente, periodo
   per voce (i ricalcoli), quantità e prezzi a 6 decimali, letture per registro, coefficiente C e
   PCS per il gas.
3. Le bollette vere hanno 10–70 voci (indice § 2.1): inserirle una per una a mano non è realistico;
   l'inserimento a mano parte da un **modello per tipo** con poche voci aggregate (T-32 e § 4.4), e
   chi vuole il dettaglio aggiunge voci.
4. Non esistono DESIGN.md e PRODUCT.md (D-13): nascono qui con la skill **impeccable**, prima dei
   componenti; dopo questa spec non si scrivono più a mano.

## 2. Obiettivo e criteri di accettazione

Il sistema visivo (DESIGN.md, PRODUCT.md, token in `globals.css`, logo), la shell dell'app, la
gestione di case e forniture, il modulo della bolletta (nuova, modifica, dettaglio, elimina), le
autoletture, Impostazioni con tema ed «Elimina account». La dashboard con i grafici è della 04: qui
la pagina «Casa» ha una card per fornitura con i dati dell'ultima bolletta (la 04 la estende).

| # | Criterio | Prova |
|---|---|---|
| A1 | DESIGN.md e PRODUCT.md esistono, scritti dalla skill impeccable; i token stanno in `src/app/globals.css` (`@theme`, che azzera la palette predefinita di Tailwind); nessun colore letterale nei componenti, nessuna classe della palette predefinita, nessuna variante `dark:`. | Collaudo § 7 F; i tre grep di § 4.1 → solo `src/app/globals.css` per il primo, nessun risultato per gli altri due. |
| A2 | Shell: barra in basso su mobile (390 px) con «Casa», «Bollette», «Letture», «Forniture», «Impostazioni»; barra laterale da 1024 px; la voce attiva è evidente («Casa» solo su `/`, le altre anche sulle pagine annidate). | E2E `shell.spec.ts` (mobile e desktop). |
| A3 | Case e forniture: crea, rinomina, elimina (con riepilogo di che cosa sparisce e conferma); fornitura con tipo, etichetta, fornitore, identificativo (normalizzato), fotovoltaico solo per la luce; modifica, archivia, riattiva, elimina; la home ha una card per fornitura non archiviata. | E2E `forniture.spec.ts`; integrazione dei servizi di lettura in `houses-supplies.test.ts`. |
| A4 | Nuova bolletta a mano: parte dal modello del tipo (con «Energia ceduta» se la luce ha il fotovoltaico) con importi e totale vuoti e obbligatori; somme per categoria e avvisi aritmetici dal vivo; salvataggio con `confirmBill`; con una sovrapposizione il modulo chiede «Si somma (conguaglio)» o «Sostituisce la bolletta del …» e risalva. | E2E `bolletta-manuale.spec.ts` (luce, gas con C, internet, sovrapposizione); unit `line-templates.test.ts`, `bill-draft.test.ts`. |
| A5 | Scheda della bolletta: dati, voci raggruppate per categoria con subtotali, letture, avvisi aritmetici; «Modifica» riapre il modulo (non su una bolletta sostituita); «Elimina» chiede conferma e torna alla fornitura. | E2E `bolletta-manuale.spec.ts`. |
| A6 | Autolettura: fornitura a contatore, data (default oggi, mai nel futuro), un campo per registro (F1/F2/F3 se la fornitura ne ha già, altrimenti unico; immessa e produzione col fotovoltaico); un valore più basso dell'ultima lettura dello stesso registro dà un avviso e chiede conferma; elenco con cancellazione delle sole autoletture. | E2E `letture.spec.ts`; integrazione in `readings.test.ts`. |
| A7 | Impostazioni: tema `Segui il sistema` · `Chiaro` · `Scuro` (cookie `theme`, nessun lampo al caricamento); «Esci»; «Elimina account» con la password → dati spariti, ritorno ad `/accedi`. | E2E `impostazioni.spec.ts` (utente registrato nel test per «Elimina account»). |
| A8 | Isolamento: seed A che apre `/bollette/<id di B>`, `/bollette/<id di B>/modifica`, `/forniture/<id di B>`, `/?casa=<casa di B>`, `/bollette/nuova?fornitura=<fornitura di B>`, `/bollette?fornitura=<fornitura di B>`, `/letture?fornitura=<fornitura di B>` riceve la pagina 404 «Pagina non trovata»; le stesse URL con gli id di A si aprono; la Server Action di salvataggio con l'id di una bolletta di B → `NOT_FOUND`. | E2E `isolamento.spec.ts` (coppie proprio/altrui); integrazione dei servizi nuovi. |
| A9 | Accessibilità: axe (WCAG 2.1 A/AA) senza violazioni su ogni pagina di § 4.3 e su `/accedi` e `/registrati`, mobile e desktop, tema chiaro e scuro. | E2E `a11y.spec.ts`. |

## 3. Decisioni

- **D-5**, **D-7**, **D-13** (impeccable crea DESIGN.md e PRODUCT.md), **D-24** (sovrapposte: la
  scelta), **D-28** (autolettura a mano), **D-29** (registri del fotovoltaico), **D-38** (solo
  italiano), **D-39** (tema che segue il sistema), **D-40** (elimina account).
- Decisioni dell'owner del 2026-10-24 che valgono qui:
  **D-47** un'autolettura con data successiva a oggi → `VALIDATION` «La lettura non può essere nel
  futuro.»; `createSelfReadings(db, userId, rawInput, { today })` riceve `romeToday(Date.now())`
  dall'azione; le date delle bollette restano libere;
  **D-49** `lineTemplateFor(kind, hasPhotovoltaic)`: con il fotovoltaico il modello della luce ha in
  più «Energia ceduta» (`feed_in`, `lump`);
  **D-50** un'autolettura con un valore più basso dell'ultima lettura dello stesso registro mostra
  l'avviso non bloccante «Il valore è più basso dell'ultima lettura (X del gg/mm/aaaa): è un
  contatore nuovo?» e il salvataggio chiede conferma;
  **D-51** in una bolletta nuova a mano gli importi delle voci e il «Totale bolletta» partono vuoti e
  sono obbligatori (`emptyBillInput` resta un `BillInput` con 0; il modulo lo apre con
  `draftFromInput(input, { blankAmounts: true })`);
  **D-52** la pagina «Casa» ha una sola card per fornitura (`data-testid="supply-card"`): la crea la
  03 con i dati dell'ultima bolletta e i pulsanti, la 04 la estende con consumo e costo unitario, la
  06 aggiunge «Carica bolletta».
- **T-13** (avvisi, mai blocchi), **T-14** (rotte), **T-16** (axe dalla 03), **T-24** (cookie del
  tema), **T-32** (modelli per i canoni).
- Adottate qui, ribaltabili:
  (a) la home `/` della 03 è un **riepilogo per casa**: una card per fornitura non archiviata con
  l'ultima bolletta (periodo, totale) e i pulsanti (D-52); la 04 estende le card e aggiunge i grafici;
  (b) con **più case**, un selettore della casa nell'intestazione di «Casa» (`/?casa=<id>`, default
  la prima per nome); «Forniture» elenca tutte le case, una sezione per casa;
  (c) i **modelli di voci** di § 4.4 (poche voci aggregate per tipo); l'owner aggiunge le voci
  di dettaglio con «Aggiungi voce»;
  (d) importi in **euro con la virgola** nei campi (`parseDecimalInput`), fino a 2 decimali (oltre →
  errore sul campo «Al massimo 2 decimali»); prezzi unitari fino a 6 decimali (oltre → errore sul
  campo «Al massimo 6 decimali»); quantità e letture senza limite di decimali, mai arrotondate dal
  modulo (le quote annuali pro rata sono frazioni di anno);
  (e) il periodo di una voce è quello della bolletta finché non si apre «Periodo diverso» sulla voce
  (serve ai ricalcoli);
  (f) «Elimina account» chiede la password e una casella «Ho capito che bollette, letture e file
  vengono cancellati per sempre»;
  (g) le cancellazioni (casa, fornitura, bolletta, autolettura) chiedono conferma in un dialogo
  nativo dell'app (non `window.confirm`), con il riepilogo di che cosa sparisce;
  (h) Server Actions colocate (`actions.ts` nella cartella della rotta), sottili:
  `toActionResult(async () => { zod → requireUser() → servizio con getDb() })` → con `ok`
  `revalidatePath`; `requireUser()` sta sempre dentro `toActionResult` (una sessione scaduta
  diventa un risultato `UNAUTHORIZED`, non un'eccezione che fa perdere il modulo). Il passo zod
  (`safeParse` dello schema dell'azione in `schemas.ts`, errore → `DomainError('VALIDATION',
  undefined, error.issues.map((issue) => issue.message))`) controlla la forma degli argomenti (id come stringhe, nome della casa,
  campi della fornitura, l'enum di `setTheme`); bollette e autoletture le validano i servizi
  (`confirmBill` con `BillInputSchema`, `createSelfReadings` con `SelfReadingInputSchema`), e le
  loro azioni passano l'input così com'è.

## 4. La soluzione

### 4.1 Prima di tutto: il design con impeccable

All'inizio della sessione, prima di scrivere componenti, si invoca la skill `impeccable:impeccable`
con questo brief (lo si incolla così):

> «Segnabollette: web app installabile (PWA) per registrare le bollette di casa (luce, gas, acqua,
> internet, TARI) e capire nel tempo consumi e prezzi, e se l'offerta è buona. Utenti: l'owner, al
> massimo un amico. Uso: dal telefono (390 px) con la bolletta in mano o appena arrivata la mail;
> dal computer per guardare i grafici. Italiano. Tema che segue il sistema (chiaro e scuro, tutti e
> due curati). Asticella: wow, ma leggibile come un estratto conto: cifre allineate, tabelle
> chiare, nessun ornamento che rubi spazio ai numeri. Schermate di questa sessione: accesso e
> registrazione, shell con navigazione (5 voci), riepilogo «Casa», forniture, elenco e scheda
> della bolletta, modulo della bolletta (voci in card su mobile, in tabella su desktop),
> autoletture, impostazioni. Grafici nella sessione successiva: prevedi i colori per le categorie
> di costo (materia, vendita, rete, oneri, imposte, IVA, altro, energia ceduta, canoni), per le
> fasce F1/F2/F3/F23 e unica, per il consumo da letture non ancora fatturato, per il fotovoltaico
> (autoconsumo, immessa), per le due linee del costo unitario (materia prima, costo totale), per
> l'anno corrente e il precedente, e per due riferimenti di mercato (all'ingrosso, ARERA).»

Prodotti obbligatori della skill: `DESIGN.md` e `PRODUCT.md` nella root, i token in
`src/app/globals.css` (`@theme`, versione chiara e scura sotto `[data-theme='dark']` e
sotto `@media (prefers-color-scheme: dark) { [data-theme='system'] { … } }`), i token
`--color-bg` (sfondo della pagina) e `--color-brand` (colore del tema), di cui DESIGN.md riporta
anche il valore sRGB esadecimale per il tema chiaro e per lo scuro (servono al manifest della PWA,
09), i colori dei grafici come token, con questi nomi esatti (li usano la 04 e la 08):
`--color-cat-commodity`, `--color-cat-sale`, `--color-cat-network`, `--color-cat-system`,
`--color-cat-excise`, `--color-cat-vat`, `--color-cat-other`, `--color-cat-feed-in`,
`--color-cat-flat`, `--color-band-f1`, `--color-band-f2`, `--color-band-f3`, `--color-band-f23`,
`--color-band-single`, `--color-readings` (consumo da letture non ancora fatturato),
`--color-pv-self`, `--color-pv-feed-in`, `--color-price-commodity`, `--color-price-total`,
`--color-yoy-current`, `--color-yoy-previous`, `--color-reference-wholesale` (PUN, CMEM),
`--color-reference-arera` (ARERA vulnerabili), e il logo `public/brand/logo.svg` (usato dalla 09
per le icone). Le scelte visive le prende la skill con l'owner; questa spec fissa solo la
struttura delle schermate.

`globals.css` apre `@theme` con `--color-*: initial;`: la palette predefinita di Tailwind non
esiste più (una classe come `text-gray-500` non genera CSS) e restano solo i token di DESIGN.md.
Le pagine della 01 (`/accedi`, `/registrati`) passano ai token in questa sessione. Prova di A1,
tre grep:
- `grep -rnE "oklch\(|hsla?\(|rgba?\(|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b" src/components src/app`
  → solo `src/app/globals.css`;
- `grep -rnE "(bg|text|border|fill|stroke|ring)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}" src`
  → nessun risultato;
- `grep -rnE "dark:[a-z]" src` (la variante `dark:` di Tailwind) → nessun risultato.

Le icone (tipi di fornitura e le cinque voci di navigazione) sono SVG inline disegnati con la
skill, in `src/components/icons/` (un componente per icona, `aria-hidden`, colore `currentColor`);
nessuna libreria di icone.

### 4.2 Shell e tema

- `src/app/layout.tsx`: legge il cookie `theme` (`system` default) e mette
  `<html lang="it" data-theme={theme}>`; il CSS applica lo scuro con `[data-theme='dark']` e con
  `@media (prefers-color-scheme: dark)` quando `data-theme='system'`. Nessuno script inline. Lo
  scuro passa solo dai token (le variabili ridefinite sotto `[data-theme='dark']` e sotto
  `@media (prefers-color-scheme: dark) { [data-theme='system'] { … } }`); nei componenti non si usa
  la variante `dark:` di Tailwind, che seguirebbe il sistema e ignorerebbe la scelta del cookie.
- `src/app/(app)/layout.tsx` (server): guardia della 01 (legge l'utente con `getSessionUser()`),
  poi monta `AppShell` (`src/components/shell/app-shell.tsx`) con `NavBar` (mobile, in basso,
  `position: sticky`) e `SideBar` (≥ 1024 px). Voci e rotte: «Casa» `/`, «Bollette» `/bollette`,
  «Letture» `/letture`, «Forniture» `/forniture`, «Impostazioni» `/impostazioni`. La voce attiva ha
  `aria-current="page"`: «Casa» solo su `/` esatto, le altre quando il percorso comincia con la loro
  rotta (`/bollette/123/modifica` → «Bollette»).
- `AppShell` è un componente client (`'use client'`: `NavBar` e `SideBar` leggono il percorso con
  `usePathname()` per `aria-current`) con props `{ children: React.ReactNode }` (C-24). Le spec
  successive lo estendono solo così: dati calcolati dal layout server e passati come props (la 06
  `reviewCount: number`, la 09 `userId: string`) e componenti client montati al suo interno (la 09).
- `src/app/(app)/impostazioni/actions.ts` → `setTheme(theme)`: zod `z.enum(['system','light','dark'])`,
  cookie `theme` per 365 giorni, `sameSite: 'lax'`, `revalidatePath('/', 'layout')`.

### 4.3 Pagine e azioni

Rotte (T-14), tutte sotto `(app)` e quindi protette; ogni pagina legge l'utente con
`requireUser()`/`getSessionUser()` e passa `user.id` ai servizi; un `NOT_FOUND` dei servizi →
`notFound()`.

| Rotta | Contenuto | Azioni (in `actions.ts`) |
|---|---|---|
| `/` | Selettore della casa (se > 1, `?casa=<id>`). Per ogni fornitura non archiviata della casa una card (`data-testid="supply-card"`, D-52): icona del tipo, etichetta, fornitore, ultima bolletta (periodo `formatDate` – `formatDate`, totale `formatEuro`, «stimata» se `isEstimated`), pulsanti «Nuova bolletta» (→ `/bollette/nuova?fornitura=<id>`) e, per i contatori, «Autolettura» (→ `/letture?fornitura=<id>`). Senza case: stato vuoto «Comincia creando la tua casa» → `/forniture`. | — |
| `/forniture` | Tutte le case, una sezione per casa, con le loro forniture (archiviate in fondo, attenuate, con «Mostra archiviate»). Form «Nuova casa» (nome). Per casa: «Rinomina», «Elimina» (dialogo: «Eliminerai N forniture, M bollette e K letture.»), «Nuova fornitura». | `createHouseAction`, `renameHouseAction`, `deleteHouseAction`, `createSupplyAction`, `updateSupplyAction`, `archiveSupplyAction`, `deleteSupplyAction` |
| `/forniture/[id]` | Intestazione (tipo, etichetta, fornitore, identificativo, fotovoltaico), «Modifica», «Archivia» (su un'archiviata «Riattiva»: `archiveSupplyAction` con `archived: false`), «Elimina» (dialogo con i conteggi); elenco delle bollette della fornitura; ultime 10 letture. La 04 aggiunge i grafici sopra. | come sopra |
| `/bollette` | Elenco di tutte le bollette (50 per pagina, `?pagina=`), filtro per fornitura (`?fornitura=`); riga: fornitura, periodo, totale, badge «stimata», «sostituita». Link «Pagina precedente» se `pagina` > 1 e «Pagina successiva» se la pagina ha 50 righe. Pulsante «Nuova bolletta». | — |
| `/bollette/nuova?fornitura=<id>` | Senza `fornitura`: prima la scelta della fornitura (solo non archiviate). Con `?fornitura=` di una fornitura archiviata il modulo si apre comunque (serve per le bollette passate di una fornitura cessata). Poi `BillForm` con il modello del tipo. | `saveBillAction(billId, input)` |
| `/bollette/[id]` | Scheda: fornitura, periodo, emissione, scadenza, fornitore, offerta, totale bolletta, totale da pagare, C e PCS (gas), «stimata»/«sostituita da …» (link); voci raggruppate per categoria con subtotale per gruppo e totale; letture; pannello avvisi (`checkBillArithmetic`, lo stesso del punto 5 di § 4.5). «Modifica», «Elimina». Una bolletta `replaced` è archiviata (D-24): la scheda mostra «Elimina» ma non «Modifica». | `deleteBillAction(billId)` |
| `/bollette/[id]/modifica` | `BillForm` con `initialValue = billInputFromDetail(await getBillDetail(…))`. Una bolletta `replaced` reindirizza (`redirect`) alla sua scheda. | `saveBillAction(billId, input)` |
| `/letture` | Form «Nuova autolettura» (§ 4.7; `?fornitura=<id>` la preseleziona) + elenco (fornitura, data, registro, valore, fonte «autolettura»/«da bolletta»), 100 righe, cancellazione solo delle autoletture. | `createReadingsAction(input)`, `deleteReadingAction(readingId)` |
| `/impostazioni` | Account (nome, email), tema, «Esci», «Elimina account». | `setTheme` |

Parametri di query: `?casa=` e `?fornitura=` con un id che non è dell'utente (o, su `/letture`, con
una fornitura a canone o archiviata, che la select non elenca) → `notFound()`; `?pagina=` che non è
un intero ≥ 1 → pagina 1.

`src/app/not-found.tsx`: titolo «Pagina non trovata», testo «Questa pagina non esiste o non è tua.»
e link «Torna a Casa» (`/`); è la pagina di ogni `notFound()` (status 404).

Letture delle pagine — servizi aggiunti qui a quelli della 02 (come `suggestedRegisters`; la riga
C-13 dell'indice li elenca):
- in `src/lib/services/houses-supplies.ts`:
  `listHousesWithSupplies(db, userId, { includeArchived: boolean }): Promise<Array<{ house: HouseRow; supplies: SupplyRow[] }>>`
  (case per nome, forniture per tipo ed etichetta, archiviate per ultime; usa `listHouses` e
  `listSupplies`);
  `getSupplyDetail(db, userId, supplyId): Promise<{ supply: SupplyRow; house: HouseRow }>`
  (`NOT_FOUND` se manca o se è di un altro utente);
  `getDeletionSummary(db, userId, target: { houseId: string } | { supplyId: string }): Promise<{ supplies: number; bills: number; readings: number }>`
  (usa `listSupplies`, `listBillIdsOfSupplies` e `listEngineReadings` per ogni fornitura; conta
  tutte le letture, di bolletta e autoletture; `NOT_FOUND` se la casa o la fornitura è di un altro
  utente);
- in `src/lib/services/bills.ts`:
  `listLatestBills(db, userId, supplyIds: string[]): Promise<Record<string, BillRow | null>>` (per
  ogni fornitura la prima bolletta `confirmed` in ordine di `periodEnd` decrescente; un id che non è
  dell'utente → `null`);
  `billInputFromDetail(detail: { bill: BillRow; lines: BillLineRow[]; readings: ReadingRow[] }): BillInput`,
  pura: voci in ordine di `position`, letture con il loro `source` (`bill_actual`/`bill_estimated`),
  `overlapDecision: null`; la pagina di modifica la chiama sul risultato di `getBillDetail`;
- in `src/lib/services/readings.ts`: `suggestedRegisters` e `latestReadings` (§ 4.7).

Le pagine leggono solo con questi servizi e con quelli della 02 (`getBillDetail`, `listBills`,
`listReadings`). Ognuno dei servizi nuovi ha nel suo file di test la coppia «risorsa propria
(passa) / risorsa altrui (`NOT_FOUND` o `null`)».

`saveBillAction(billId: string | null, input: unknown): Promise<ActionResult<{ billId: string }>>`,
in `src/app/(app)/bollette/actions.ts`. Dentro `toActionResult`: `requireUser()` →
`confirmBill(getDb(), user.id, input, { source: 'manual', billId: billId ?? undefined })`. Con `ok`
chiama `revalidatePath('/bollette')`, `revalidatePath('/')`, `revalidatePath('/letture')` e
`revalidatePath('/forniture/<supplyId>')`, e restituisce `{ billId }`. Le pagine passano
`onSubmit={saveBillAction.bind(null, null)}` (nuova) o `onSubmit={saveBillAction.bind(null, bill.id)}`
(modifica): a un Client Component si passa solo una Server Action, mai una closure scritta nella
pagina. `deleteBillAction`, `createReadingsAction`, `deleteReadingAction` e le azioni di case e
forniture hanno la stessa forma (decisione (h)): `requireUser()` dentro `toActionResult`,
`getDb()`, `revalidatePath` delle pagine che mostrano il dato.

### 4.4 Modelli di voci — `src/components/bills/line-templates.ts` (C-14)

Modulo puro, senza `'use client'`: lo importano sia la pagina server `/bollette/nuova` (che chiama
`emptyBillInput`) sia il modulo client. Si aggiunge `src/components/bills/line-templates.ts`
all'elenco del commento `WARNING` in testa a `src/lib/domain/types.ts` (un valore nuovo di quelle
liste va gestito anche qui).

```ts
import type { BillInput, BillLineInput } from '@/lib/domain/bill-input';
import { monthEnd, monthKeyOf, monthStart, shiftMonth } from '@/lib/domain/dates';
import type { IsoDate, SupplyKind } from '@/lib/domain/types';

export type LineTemplate = Pick<BillLineInput, 'description' | 'category' | 'component' | 'quantityUnit' | 'band'>;

/**
 * The few aggregated lines a hand-typed bill starts from; detail lines are added on demand.
 * With photovoltaic panels an electricity bill also credits the energy fed into the grid.
 */
export function lineTemplateFor(kind: SupplyKind, hasPhotovoltaic: boolean): LineTemplate[] {
  const line = (description: string, category: LineTemplate['category'], component: LineTemplate['component'], quantityUnit: LineTemplate['quantityUnit'] = null): LineTemplate =>
    ({ description, category, component, quantityUnit, band: null });
  switch (kind) {
    case 'electricity':
      return [
        line('Energia', 'commodity', 'variable', 'kWh'),
        line('Altre spese di vendita', 'sale', 'lump'),
        line('Trasporto e gestione del contatore', 'network', 'lump'),
        line('Oneri di sistema', 'system', 'lump'),
        line('Accise', 'excise', 'lump'),
        line('IVA', 'vat', 'lump'),
        ...(hasPhotovoltaic ? [line('Energia ceduta', 'feed_in', 'lump')] : []),
      ];
    case 'gas':
      return [
        line('Gas naturale', 'commodity', 'variable', 'Smc'),
        line('Altre spese di vendita', 'sale', 'lump'),
        line('Trasporto e gestione del contatore', 'network', 'lump'),
        line('Oneri di sistema', 'system', 'lump'),
        line('Accise e addizionale regionale', 'excise', 'lump'),
        line('IVA', 'vat', 'lump'),
      ];
    case 'water':
      return [
        line('Acquedotto (quota variabile)', 'commodity', 'variable', 'm3'),
        line('Quota fissa', 'sale', 'fixed'),
        line('Fognatura e depurazione', 'network', 'lump'),
        line('Componenti perequative', 'system', 'lump'),
        line('IVA', 'vat', 'lump'),
      ];
    case 'telecom':
      return [line('Canone', 'sale', 'fixed'), line('IVA', 'vat', 'lump')];
    case 'waste':
      return [line('TARI', 'sale', 'fixed')];
  }
}

/**
 * A new hand-typed bill for last month, built from the supply's line template. Amounts are 0 here;
 * the form shows them empty and requires them.
 */
export function emptyBillInput(
  supply: { id: string; kind: SupplyKind; supplierName: string | null; hasPhotovoltaic: boolean },
  today: IsoDate,
): BillInput {
  const month = shiftMonth(monthKeyOf(today), -1);
  const periodStart = monthStart(month);
  const periodEnd = monthEnd(month);
  return {
    supplyId: supply.id,
    periodStart,
    periodEnd,
    issueDate: null,
    dueDate: null,
    supplierName: supply.supplierName,
    offerName: null,
    totalCents: 0,
    amountDueCents: null,
    conversionFactor: null,
    calorificValueGj: null,
    isEstimated: false,
    lines: lineTemplateFor(supply.kind, supply.hasPhotovoltaic).map((template) => ({
      ...template,
      periodStart,
      periodEnd,
      // Only the consumption line carries a quantity: it starts at 0 in its own unit.
      quantity: template.category === 'commodity' && template.quantityUnit !== null ? 0 : null,
      unitPriceMicros: null,
      amountCents: 0,
      isRecalculation: false,
      isEstimated: false,
      vatRateBp: null,
    })),
    readings: [],
    overlapDecision: null,
  };
}
```

### 4.5 Il modulo — `src/components/bills/bill-form.tsx` (C-14)

Componente client. Firma:

```ts
export interface BillFormProps {
  supply: { id: string; kind: SupplyKind; label: string; hasPhotovoltaic: boolean };
  initialValue: BillInput;
  /** A new hand-typed bill: line amounts and the bill total start empty and must be typed. */
  blankAmounts?: boolean;
  /** Bills already known to overlap (the review passes them; manual entry learns them on save). */
  overlaps?: ExistingBillPeriod[];
  submitLabel: string;
  /** nextPath: where to go after a successful save (default: the saved bill). */
  onSubmit: (input: BillInput) => Promise<ActionResult<{ billId: string; nextPath?: string }>>;
}
```

Per una bolletta nuova la pagina costruisce `initialValue` con `emptyBillInput(supply, today)` di
`line-templates.ts` (§ 4.4; `today = romeToday(Date.now())`) e passa `blankAmounts` (D-51); la
modifica (e la revisione della 06) non lo passano.

Lo stato interno è una **bozza a stringhe** (`BillDraft`, `src/components/bills/bill-draft.ts`,
modulo puro con il suo test):
- `export type FieldErrors = Record<string, string>` (chiave = percorso, es. `lines.3.amountCents`,
  `totalCents`, `readings.0.value`);
- `BillDraft` = `BillInput` con ogni campo numerico (`totalCents`, `amountDueCents`,
  `conversionFactor`, `calorificValueGj`, `quantity`, `unitPriceMicros`, `amountCents`,
  `vatRateBp`, `value`) come `string`, più `hasOwnPeriod: boolean` per ogni voce (vero quando il
  periodo della voce differisce da quello della bolletta);
- `draftFromInput(input: BillInput, options?: { blankAmounts?: boolean }): BillDraft` usa
  `formatDecimalInput` (nuova in `src/lib/format.ts`: `formatDecimalInput(value: number,
  maxFractionDigits: number): string` arrotonda a `maxFractionDigits` cifre con `toFixed`, poi
  scrive il numero più corto che si rilegge uguale, `String(Number(…))`, con la virgola decimale,
  senza separatori delle migliaia e senza zeri finali): centesimi ÷ 100 con 2 cifre, micro-euro ÷
  1.000.000 con 6, quantità e valori delle letture con 20 (nessun arrotondamento: una quota annuale
  30/365 torna identica), `vatRateBp` ÷ 100 con 2; un `null` diventa `''`. Con
  `blankAmounts` gli `amountCents` di ogni voce e `totalCents` sono `''`;
- `inputFromDraft(draft: BillDraft): { input?: BillInput; errors: FieldErrors }` fa il contrario con
  `parseDecimalInput`, `centsFromEuro`, `microsFromEuro` (`vatRateBp = Math.round(percentuale ×
  100)`), poi valida con `BillInputSchema`; importo di una voce vuoto → «Importo obbligatorio»,
  «Totale bolletta» vuoto → «Totale obbligatorio», testo non numerico → «Numero non valido», più di
  2 decimali in un importo o più di 6 in un prezzo → l'errore di (d); una voce senza `hasOwnPeriod`
  prende il periodo della bolletta. `input` c'è solo quando `errors` è vuoto.

Gli errori si mostrano sotto il campo quando il campo perde il focus e a ogni invio.

Sezioni, in ordine:
1. **Bolletta**: fornitura (solo testo), periodo dal/al, emissione, scadenza, fornitore, offerta,
   «Consumi stimati» (spunta: imposta `isEstimated` della bolletta e, quando cambia, quello delle
   voci `commodity` non di ricalcolo).
2. **Totali**: «Totale bolletta» (obbligatorio, vuoto in una bolletta nuova), «Totale da pagare»
   (facoltativo, la nota dice «se diverso: canone TV, saldi precedenti»).
3. **Gas** (solo gas): «Coefficiente C» e «Potere calorifico superiore (GJ/Smc)», con l'aiuto «se
   la bolletta lo stampa in MJ/Smc, dividi per 1000».
4. **Voci**: su mobile una card per voce, da 768 px una tabella. Campi: descrizione, categoria
   (select con le etichette di § 4.6), componente, quantità + unità (unità fissa per la voce di
   consumo), prezzo unitario (€), importo (€, obbligatorio, anche negativo, vuoto in una bolletta
   nuova), fascia (solo luce: `—`, F1, F2, F3, F23, unica), «Ricalcolo», «Stimata», IVA % (facoltativa), «Periodo diverso»
   (apre dal/al della voce). Pulsanti «Aggiungi voce», «Rimuovi», «Su»/«Giù».
5. **Riepilogo** (dal vivo): somma per categoria con le etichette di § 4.6, totale calcolato, e il
   pannello di `checkBillArithmetic`: «Le voci sommano X, il totale stampato è Y (differenza Z)»
   in stile di avviso quando `isTotalConsistent` è falso; quando `isAmountDueConsistent === false`,
   «Tutte le voci (canone TV compreso) sommano X, il totale da pagare è Y (differenza Z)»; per ogni
   `lineMismatches` «Voce N: quantità × prezzo fa X, l'importo è Y». Il riepilogo conta 0 una voce
   con l'importo vuoto o non leggibile.
6. **Letture della bolletta** (solo contatori): righe data · registro (quelli di
   `allowedRegisters`) · valore · «Rilevata»/«Stimata»; «Aggiungi lettura».
7. **Sovrapposizione**: se `overlaps` non è vuoto (dalle props o da un `OVERLAP_DECISION_REQUIRED`
   del salvataggio, `details` = le bollette), un riquadro elenca le bollette («dal … al …», link
   che si apre in una nuova scheda) e chiede la scelta con due radio: «Si somma: è un conguaglio o
   una bolletta in più» (`sum`) e «Sostituisce quella vecchia» (`replace`); il pulsante resta
   disattivato finché non si sceglie.
8. Pulsante `submitLabel` («Salva bolletta» nella 03, «Conferma» nella 06, «Conferma e passa alla
   prossima» nelle bollette di un lotto della 07). L'invio: `inputFromDraft`; con errori li mostra
   sotto i campi e non chiama il server; altrimenti `onSubmit({ ...input, supplyId: props.supply.id })`.
   Con `ok` esegue `router.push(data.nextPath ?? '/bollette/' + data.billId)` (`nextPath` è per le
   azioni che dopo la conferma portano altrove, come la prossima bolletta di un lotto nella 07;
   `saveBillAction` non lo restituisce); con `OVERLAP_DECISION_REQUIRED` mostra il riquadro 7; con `UNAUTHORIZED` mostra «La sessione è scaduta: accedi di nuovo in
   un'altra scheda e poi premi di nuovo il pulsante»; un `VALIDATION` del server mostra in cima al
   modulo, come elenco, ogni stringa di `details` così com'è (`details` di un `VALIDATION` è sempre
   `string[]`); con gli altri errori il `message` in cima. In tutti i casi d'errore la bozza resta com'è.

### 4.6 Etichette — in `src/lib/format.ts`

Le mappe di etichette qui sotto entrano nell'elenco del commento `WARNING` in testa a
`src/lib/domain/types.ts`, come `line-templates.ts` (§ 4.4).

```ts
export const CATEGORY_LABELS: Record<LineCategory, string> = {
  commodity: 'Materia prima', sale: 'Altre spese di vendita', network: 'Rete e contatore',
  system: 'Oneri di sistema', excise: 'Accise e imposte', vat: 'IVA', other: 'Altre partite',
  feed_in: 'Energia ceduta', outside: 'Fuori bolletta',
};
export const COMPONENT_LABELS: Record<LineComponent, string> = {
  variable: 'a consumo', fixed: 'fissa', power: 'a potenza', lump: 'importo unico',
};
export const KIND_LABELS: Record<SupplyKind, string> = {
  electricity: 'Luce', gas: 'Gas', water: 'Acqua', telecom: 'Internet e telefono', waste: 'TARI',
};
export const REGISTER_LABELS: Record<ReadingRegister, string> = {
  single: 'Lettura', F1: 'F1', F2: 'F2', F3: 'F3', feed_in: 'Immessa', production: 'Produzione',
};
export const IDENTIFIER_HINTS: Record<SupplyKind, string> = {
  electricity: 'POD (es. IT001E…)', gas: 'PDR (14 cifre)', water: 'Codice utenza',
  telecom: 'Numero di linea o codice cliente (facoltativo)', waste: 'Codice contribuente (facoltativo)',
};
```

(L'identificativo di una fornitura internet o TARI è facoltativo e l'owner può lasciarlo vuoto: D-6
ammette solo l'identificativo della fornitura, niente codici cliente oltre a quello.)

### 4.7 Autolettura

`src/components/readings/self-reading-form.tsx` (client, esporta `SelfReadingForm`): select della
fornitura (solo a contatore, non archiviate; `?fornitura=<id>` la preseleziona), data (default
`today = romeToday(Date.now())` calcolato dalla pagina e passato come prop; il campo ha
`max={today}`), i campi dei registri: se una qualsiasi lettura della fornitura (di bolletta
confermata o autolettura) usa F1, F2 o F3 → tre campi «F1», «F2», «F3», altrimenti «Lettura»; col
fotovoltaico in più «Immessa» e «Produzione» (facoltativi); unità accanto al campo (`kWh` o `m³`).
Un campo vuoto non si invia; almeno un valore.

Servizi nuovi in `src/lib/services/readings.ts` (aggiunti qui, riga C-13 dell'indice). Tutti e due
leggono con `getSupply` (`NOT_FOUND` se la fornitura manca o è di un altro utente) e
`listEngineReadings(db, userId, supplyId)` (02), e considerano solo le letture `bill_actual` /
`bill_estimated` di bollette `confirmed` (`billId` fra gli id di `listBillPeriods`, che restituisce
solo le `confirmed`) e le autoletture (`billId` nullo):
- `suggestedRegisters(db, userId, supplyId): Promise<ReadingRegister[]>`: `['F1','F2','F3']` se fra
  quelle letture compare F1, F2 o F3, altrimenti `['single']` (gas e acqua sempre `['single']`), più
  `feed_in` e `production` col fotovoltaico; fornitura a canone → `VALIDATION`. È la stessa regola
  con cui il motore sceglie i registri (`usesBands` in `addReadingsConsumption`,
  `src/lib/engine/supply-months.ts`): un'autolettura `single` su una fornitura
  che ha già letture a fasce sparirebbe dal consumo da letture.
- `latestReadings(db, userId, supplyId): Promise<Partial<Record<ReadingRegister, { value: number; readOn: IsoDate }>>>`:
  per ogni registro la lettura con la data più recente fra quelle scelte da `pickReadings`.

La pagina `/letture` calcola, per ogni fornitura a contatore non archiviata,
`registersBySupply: Record<string, ReadingRegister[]>` con `suggestedRegisters` e
`lastReadingsBySupply: Record<string, Partial<Record<ReadingRegister, { value: number; readOn: IsoDate }>>>`
con `latestReadings`, e li passa al form, che cambia i campi quando cambia la select.

Valore più basso (D-50): quando un valore digitato è minore di quello di `lastReadingsBySupply` per
lo stesso registro, sotto il campo compare l'avviso «Il valore è più basso dell'ultima lettura (X
del gg/mm/aaaa): è un contatore nuovo?» (X con `formatQuantity`, la data con `formatDate`); premendo
«Salva» con almeno un avviso si apre il dialogo di conferma dell'app (decisione (g)) con gli avvisi e
i pulsanti «Salva comunque» e «Annulla».

Il form costruisce nel browser un `SelfReadingInput` (`supplyId`, `readOn`, `values` con i soli
campi compilati, convertiti con `parseDecimalInput`; un testo non numerico è un errore sotto il
campo e non si invia) e lo passa a `createReadingsAction(input: SelfReadingInput)` (in
`src/app/(app)/letture/actions.ts`: dentro `toActionResult` `requireUser()` →
`createSelfReadings(getDb(), user.id, input, { today: romeToday(Date.now()) })` → con `ok`
`revalidatePath('/letture')`, `revalidatePath('/forniture/<supplyId>')`, `revalidatePath('/')`;
restituisce `ActionResult<{ readingIds: string[] }>`). Una data successiva a oggi torna come
`VALIDATION` «La lettura non può essere nel futuro.» (D-47), mostrata in cima al form. La 09 accoda
lo stesso `SelfReadingInput` quando è offline.

### 4.8 Elimina account

`src/components/settings/delete-account.tsx` (client): password + casella di conferma; chiama
`authClient.deleteUser({ password })`; al successo `router.replace('/accedi')`; all'errore con
codice `INVALID_PASSWORD` «Password non corretta.»; con ogni altro errore «Non è stato possibile
eliminare l'account: riprova più tardi.». Il server fa già il resto (01: `beforeDelete` →
`deleteAllUserData`).

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che pagine e azioni non importano repository né
  schema; il calcolo dei registri suggeriti sta nel servizio, non nella pagina.
- **AGENTS.md § 2.4 Isolation** — `userId` solo da `requireUser()`; gli id nelle URL e nei form
  sono sempre riletti con l'utente; un id altrui dà 404, mai 403 (non si conferma che esiste).
- **AGENTS.md § 2.5 Money and dates** — i componenti non dividono per 100: `formatEuro`,
  `formatUnitPrice`, `formatQuantity`, `formatDate` da `format.ts`; le date di calendario restano
  stringhe (un `<input type="date">` produce già `YYYY-MM-DD`).
- **AGENTS.md § 7 UI** — token di DESIGN.md, nessun colore letterale; testi italiani nei
  componenti; `data-testid` sui controlli che Playwright usa (segnaprezzi § 4.25: `getByRole('alert')`
  non è unico per via dell'annunciatore di Next).
- Un file `"use server"` esporta solo funzioni async: gli schemi zod delle azioni stanno in
  `schemas.ts` accanto (segnaprezzi § 4.22).
- Un Server Component non chiama una funzione esportata da un file `'use client'` (Next lancia
  «Attempted to call … from the server»): `emptyBillInput` sta nel modulo puro `line-templates.ts`.
  A un Client Component si passa come funzione solo una Server Action (anche con `.bind`), mai una
  closure scritta nella pagina.
- Playwright: aspettare l'idratazione prima di compilare i form; parole spia diverse per ogni
  file di test (segnaprezzi § 4.60). Gli utenti seed A e B sono in sola lettura: servono ai test che
  leggono (shell, isolamento in lettura, a11y, tema) e un test non li modifica, non li fa uscire, non
  li elimina; ogni test che scrive registra il suo utente con `signUpTestUser` e crea dalla UI la sua
  casa (nome = parola spia del file).

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `line-templates.test.ts`: ogni tipo (la luce con e senza fotovoltaico) produce un modello che, riempito con numeri tondi, passa `BillInputSchema` e `assertInputFitsSupply`; la luce ha una sola voce `commodity` in kWh. | Unità `Smc` sulla luce → `assertInputFitsSupply` fallisce. |
| Unit | `line-templates.test.ts`: `lineTemplateFor('electricity', true)` finisce con «Energia ceduta» (`feed_in`, `lump`); `lineTemplateFor('electricity', false)` non ha voci `feed_in`. | Ignorare `hasPhotovoltaic` (restituire sempre il modello senza «Energia ceduta») → il primo caso fallisce. |
| Unit | `line-templates.test.ts`: `emptyBillInput` con `today` `2026-01-15` → periodo `2025-12-01`–`2025-12-31`; con `2028-03-10` → `2028-02-01`–`2028-02-29`; `supplierName` della fornitura, ogni voce col periodo della bolletta, `amountCents` 0, `quantity` 0 sulla sola voce di consumo; il risultato passa `BillInputSchema`. | Usare il mese di `today` invece del precedente (`shiftMonth(…, 0)`) → fallisce. |
| Unit | `bill-draft.test.ts`: `draftFromInput` → `inputFromDraft` restituisce lo stesso input (anche con una quantità 30/365 e un IVA `vatRateBp` 1000); «12,34» → 1234; «0,099» → 99000 µ€; «0,0990001» come prezzo → «Al massimo 6 decimali»; importo vuoto → «Importo obbligatorio» su `lines.N.amountCents`; quantità «abc» → «Numero non valido». | `centsFromEuro` al posto di `microsFromEuro` per il prezzo → 10 invece di 99000. |
| Unit | `bill-draft.test.ts`: `draftFromInput(input, { blankAmounts: true })` → ogni `amountCents` e `totalCents` sono `''`, quantità e prezzi invariati; `inputFromDraft` di quella bozza → errori su ogni `lines.N.amountCents` e su `totalCents`, nessun `input`. | Ignorare `blankAmounts` → la bozza ha «0» e il test fallisce. |
| Unit | `format.test.ts` (esteso): `formatDecimalInput(1234.5, 2) === '1234,5'`, `formatDecimalInput(0.099, 6) === '0,099'`, `formatDecimalInput(-1, 2) === '-1'`, `formatDecimalInput(0.1, 20) === '0,1'`, `parseDecimalInput(formatDecimalInput(30 / 365, 20)) === 30 / 365`. | Restituire `value.toFixed(maxFractionDigits)` senza `Number(…)` → il primo caso dà «1234,50». |
| Integrazione | `houses-supplies.test.ts` (esteso): `listHousesWithSupplies` (case per nome, archiviate per ultime e assenti con `includeArchived: false`, nessuna casa dell'altro utente); `getSupplyDetail` della propria fornitura → `{ supply, house }`, di quella dell'altro utente → `NOT_FOUND`; `getDeletionSummary` di una casa con 2 forniture, 3 bollette, 4 letture → `{ supplies: 2, bills: 3, readings: 4 }`, della casa dell'altro utente → `NOT_FOUND`. | Togliere `userId` dal `WHERE` di `getSupply` → `getSupplyDetail` restituisce la fornitura altrui. |
| Integrazione | `bills.test.ts` (esteso): `listLatestBills` su una fornitura con A (gennaio 2025), B (`2025-02-01`–`2025-03-31`) e C (febbraio 2025, confermata con `replace`: B diventa sostituita) → C; id della fornitura dell'altro utente → `null`. `confirmBill` → `getBillDetail` → `billInputFromDetail` restituisce l'input confermato (con `overlapDecision: null`). | Non filtrare le `confirmed` in `listLatestBills` → restituisce B; ordinare le voci per `position` decrescente in `billInputFromDetail` → le voci si invertono. |
| Integrazione | `readings.test.ts` (servizio, esteso): `suggestedRegisters` di una luce con una bolletta con letture F1/F2/F3 → `['F1','F2','F3']`; con quella bolletta vecchia e l'ultima senza letture → ancora `['F1','F2','F3']`; senza letture → `['single']`; con il fotovoltaico → più `feed_in` e `production`; gas → `['single']`; a canone → `VALIDATION`; fornitura dell'altro utente → `NOT_FOUND` (la propria passa). | Togliere `userId` dalla lettura → la fornitura altrui restituisce registri; guardare solo l'ultima bolletta → il secondo caso dà `['single']`. |
| Integrazione | `readings.test.ts`: `latestReadings` con F1 100 del `2025-01-31` (bolletta) e F1 120 del `2025-02-15` (autolettura) → `F1: { value: 120, readOn: '2025-02-15' }`; una lettura F1 più recente di una bolletta sostituita non conta; fornitura dell'altro utente → `NOT_FOUND` (la propria passa). | Prendere la lettura più vecchia invece della più recente → 100; non filtrare le bollette `confirmed` → vince la lettura della sostituita. |
| E2E | `auth.spec.ts` (della 01, aggiornato qui): (2) dopo la registrazione arriva su `/` e vede «Comincia creando la tua casa»; (3) «Esci» si preme da `/impostazioni` → `/accedi`; gli altri passi restano. | Togliere «Esci» da `/impostazioni` → il passo (3) fallisce. |
| E2E | `shell.spec.ts` (seed A, sola lettura): cinque voci; `aria-current` sulla pagina aperta; su `/bollette/<id>/modifica` è attiva «Bollette» e non «Casa»; mobile in basso e desktop a lato. | Confrontare «Casa» per prefisso → «Casa» risulta attiva anche su `/bollette/<id>/modifica`. |
| E2E | `forniture.spec.ts` (`signUpTestUser`, casa «Casa Quokka»): fornitura luce con identificativo `it 001 e 0000-0042` → mostrato `IT001E00000042`; fotovoltaico assente sul gas; `/` mostra due `supply-card`; archiviata la luce, `/` mostra una sola `supply-card` e la scheda della luce ha «Riattiva»; «Riattiva» → di nuovo due; elimina casa con il riepilogo dei conteggi. | Saltare la normalizzazione → il testo mostrato differisce; non filtrare le archiviate sulla home → due card dopo l'archiviazione. |
| E2E | `bolletta-manuale.spec.ts` (`signUpTestUser`, casa «Casa Capibara», parola spia «capibara»): il modulo nuovo della luce ha importi e totale vuoti; «Salva bolletta» con l'importo dell'IVA vuoto → «Importo obbligatorio» sotto quel campo e nessuna bolletta salvata; luce dal modello con importi tondi → scheda con i subtotali; gas con C 1,02 e PCS 0,0385; internet con «Canone» e «IVA»; una seconda luce sullo stesso periodo → riquadro di sovrapposizione → «Sostituisce» → la prima mostra «sostituita», non ha «Modifica», e `/bollette/<prima>/modifica` porta alla sua scheda; modifica di un importo della seconda; eliminazione della seconda → torna alla fornitura e la prima ritorna normale. | Inviare senza `overlapDecision` dopo la scelta → resta l'errore. |
| E2E | `letture.spec.ts` (`signUpTestUser`, casa «Casa Tucano» con una «Luce»): una bolletta con letture F1/F2/F3 inserita dal modulo; `/letture?fornitura=<luce>` propone tre campi; autolettura salvata ed elencata; le letture della bolletta non hanno «Elimina»; un valore F1 più basso dell'ultimo → l'avviso «Il valore è più basso dell'ultima lettura …» → «Salva» apre il dialogo → «Salva comunque» → lettura salvata ed elencata. | Proporre sempre «Lettura» → fallisce; confrontare con `>` invece di `<` → nessun avviso e nessun dialogo. |
| E2E | `impostazioni.spec.ts`: tema «Scuro» con seed A (solo il cookie) → `html[data-theme=dark]` anche dopo il ricaricamento; «Elimina account» con un utente di `signUpTestUser` (casa «Casa Koala», una bolletta internet) → `/accedi`, accesso con le stesse credenziali rifiutato. | Non chiamare `deleteAllUserData` nell'hook → l'eliminazione fallisce (foreign key) e il test resta su Impostazioni con «Non è stato possibile eliminare l'account: riprova più tardi.». |
| E2E | `isolamento.spec.ts`, letture (seed A): `/bollette/<id di B>`, `/bollette/<id di B>/modifica`, `/forniture/<id di B>`, `/?casa=<casa di B>`, `/bollette/nuova?fornitura=<fornitura di B>`, `/bollette?fornitura=<fornitura di B>`, `/letture?fornitura=<fornitura di B>` → status 404 e titolo «Pagina non trovata»; le stesse URL con gli id di A si aprono (gli id si leggono da `e2e.db` con `createDb`). | Togliere `userId` da `getBill` → A apre la bolletta di B. |
| E2E | `isolamento.spec.ts`, Server Action (coppia che scrive): un utente di `signUpTestUser` (casa «Casa Ibis», fornitura «Internet», una bolletta) apre `/bollette/<id proprio>/modifica` e intercetta con `page.route` la POST dell'azione (header `next-action`); nel corpo sostituisce il proprio `billId` con quello di una bolletta di seed B e salva → la risposta porta `NOT_FOUND` e la bolletta di B è invariata su `e2e.db`; lo stesso salvataggio senza la sostituzione → `ok`. | Togliere in `confirmBill` il controllo `getBill` della bolletta da modificare → la risposta è `ok` invece di `NOT_FOUND`. |
| E2E | `a11y.spec.ts`: ogni rotta di § 4.3 con seed A, più `/accedi` e `/registrati` senza sessione, mobile e desktop, tema chiaro e scuro (cookie `theme`), `await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()` → `violations` vuoto. | Un `<input>` senza etichetta → violazione. |

`tests/e2e/helpers.ts` nasce qui (C-23) con `signUpTestUser(page: Page, prefix: string): Promise<{ email: string; password: string }>`:
registrazione dalla UI di `/registrati` su :3100 con email `<prefix>-<nanoid>@example.test`, attende
`/` e restituisce le credenziali. `forniture.spec.ts`, `bolletta-manuale.spec.ts`, `letture.spec.ts`,
la parte «Elimina account» di `impostazioni.spec.ts` e la coppia che scrive di `isolamento.spec.ts`
lo usano; ciascuno crea dalla UI la sua casa e le sue forniture.

`pnpm add -D @axe-core/playwright@4.14.0`.

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: E2E della 01 (con `auth.spec.ts` aggiornato come in § 6) e test Vitest del
  modello e del motore verdi.
- **B — Cambio di contesto**: con seed A si vede la «Casa Fenicottero» con quattro `supply-card` e
  le ultime bollette; con seed B la «Casa Ornitorinco» con una. Esito atteso dichiarato prima.
- **C — Comportamento nuovo**: tutta la suite verde. Poi uno script Playwright usa e getta
  (sessione di seed A su `local.db`: nel collaudo locale seed A si può scrivere, il divieto vale
  solo per la suite Playwright) inserisce a mano una bolletta del gas con periodo dal primo
  all'ultimo giorno del mese di 20 mesi fa (nessuna bolletta seed lo copre), C 1,02, PCS 0,0385, le
  voci del modello con importi 1000/700/600/−100/300/400 cent e totale 2900, la parola spia
  «tapiro» nella descrizione della prima voce. Esito atteso dichiarato prima: nessun riquadro di
  sovrapposizione; sul DB (`createDb` su `local.db`) una riga in `bills` con `total_cents` 2900 e
  `conversion_factor` 1.02, sei righe in `bill_lines` con quegli `amount_cents`.
- **D — Sotto la UI**: lo stesso script, con la sessione di seed A, apre
  `/bollette/<id della bolletta «tapiro»>/modifica` e fa la stessa intercettazione di
  `isolamento.spec.ts`: sostituisce nel corpo della POST dell'azione l'id della bolletta «tapiro» con
  quello di una bolletta di seed B. Esito atteso dichiarato prima: con l'id di B la risposta porta
  `NOT_FOUND` e la riga di B è invariata su `local.db`; con il proprio id `ok`.
- **E — Casi negativi**: coperti da `isolamento.spec.ts` (URL altrui → 404, Server Action con l'id
  altrui → `NOT_FOUND`), da `src/lib/services/readings.test.ts` su `createSelfReadings` (data futura → `VALIDATION`,
  D-47) e da `bill-draft.test.ts` (importo vuoto → errore sul campo); si citano.
- **F — Giro guidato** (al via dell'owner, con le fixture vive, una pagina per messaggio, sessione
  di seed A già aperta): (1) `/` — il riepilogo si legge al volo? (2) `/bollette/nuova?fornitura=<luce>`
  — il modulo su telefono (390 px) è compilabile senza fatica? (3) `/bollette/<id>` — subtotali e
  avvisi chiari? (4) `/letture` — la scelta dei registri è ovvia, e l'avviso di un valore più basso
  si capisce? (5) `/impostazioni` — tema chiaro
  e scuro tutti e due curati? Che cosa NON copre: i grafici (04), il telefono vero (05).
- **G — Ripristino**: la bolletta «tapiro» si cancella; lo script si cancella; i seed restano.

## 8. Messa in esercizio

- Nessuna migrazione, nessuna variabile nuova.
- Misura di chiusura: suite verde e collaudo annotato; la 05 rifà in produzione l'inserimento di
  una bolletta inventata e l'isolamento fra due utenti.

## 9. Documentazione

- `DESIGN.md`, `PRODUCT.md`: nascono qui (impeccable); CLAUDE.md § Design Context li punta e toglie
  la riga da § Not yet present.
- `CLAUDE.md`: Latest; § Key Features (inserimento manuale, autoletture, Impostazioni);
  § Architecture Snapshot (`BillForm` come modulo unico di manuale e revisione).
- **`doc/guide/app.md`** (nasce qui, ≤ 300 righe): rotte, parametri di query e azioni (forma di
  (h), `.bind` per `saveBillAction`), i servizi di lettura delle pagine, `AppShell` client e come le
  spec successive lo estendono, il modulo della bolletta (bozza a stringhe, `formatDecimalInput`,
  importi vuoti di una bolletta nuova, sovrapposizione, errori del server), i modelli di voci, la
  regola dei registri dell'autolettura e l'avviso del valore più basso, il tema (solo token, niente
  `dark:`), le regole dei test E2E (seed A e B in sola lettura, `signUpTestUser`, parole spia,
  `data-testid`).
- `AGENTS.md`: § 7 UI (stub che rimanda a `doc/guide/app.md` e DESIGN.md; niente palette
  predefinita di Tailwind né variante `dark:`); § 9 Testing (axe, `tests/e2e/helpers.ts` con
  `signUpTestUser`, parole spia per file).
- `README.md`: § What it does (inserimento a mano, autoletture); nessuno screenshot (gli screenshot
  con dati inventati arrivano con la 05, dal deploy).

## 10. Fuori ambito, dichiarato

- Grafici e dashboard → **04**.
- Allegare il file a una bolletta e l'estrazione → **06**.
- Riordinare le voci trascinandole, duplicare una bolletta come modello del mese dopo →
  CLAUDE.md § Not yet present.
- Esportazione dei dati (CSV/JSON) → CLAUDE.md § Not yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **L** (design + molte pagine + E2E).

```
Ciao, in questa sessione implemento la spec doc/v1/03-design-forniture-inserimento-manuale-e-autoletture.md.

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto) e doc/guide/calcoli.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 03 INTERA
- Controlla con un grep che i contratti C-2, C-3, C-5…C-13, C-18, C-21 esistano con i nomi e le
  firme dell'indice (in particolare `createSelfReadings(db, userId, rawInput, { today })` di
  `src/lib/services/readings.ts`)

Prima di tutto: `git pull` su `main`; la 02 è ritirata (2026-10-24, stato in § 5 dell'indice e in
CLAUDE.md → Latest), quindi non c'è uno stato da scrivere per lei.

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/03-design-manual-entry. Crea SESSION_NOTES.md.

Comincia da § 4.1: invoca la skill impeccable con il brief della spec e porta avanti la
direzione visiva con me fino a DESIGN.md, PRODUCT.md, token (con `--color-bg` e `--color-brand`
anche in esadecimale) e logo. Solo dopo scrivi i componenti. Poi implementa la spec esattamente
come scritta: § 4 è la soluzione (le decisioni D-47, D-49, D-50, D-51, D-52 di § 3 comprese), § 6
i test con le mutazioni che li provano portanti (seed A e B in sola lettura: chi scrive usa
`signUpTestUser`; aggiorna anche `auth.spec.ts` della 01), § 7 il collaudo (fase per fase, esito
atteso prima; il giro guidato parte al mio via, una pagina per messaggio), § 9 la documentazione. Non decidere nulla
che la spec ha già deciso; se trovi un punto che la spec non copre, fermati e chiedimelo con
AskUserQuestion. Le etichette della serie non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
