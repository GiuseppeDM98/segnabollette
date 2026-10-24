# 03 — Design, forniture, inserimento manuale e autoletture

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/03-design-manual-entry` da `main`. **Dipende da**: 02 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-5, D-7, D-13, D-24, D-28, D-29, D-38,
> D-39, D-40; scelte T-13, T-14, T-16, T-24, T-32; contratti C-14 (lo crea); usa C-3, C-5…C-13.

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
la pagina «Casa» è un riepilogo testuale.

| # | Criterio | Prova |
|---|---|---|
| A1 | DESIGN.md e PRODUCT.md esistono, scritti dalla skill impeccable; i token stanno in `src/app/globals.css` (`@theme`); nessun colore letterale nei componenti. | Collaudo § 7 F; grep `#[0-9a-fA-F]{3,6}\|rgb(` in `src/components` e `src/app` → solo `globals.css`. |
| A2 | Shell: barra in basso su mobile (390 px) con «Casa», «Bollette», «Letture», «Forniture», «Impostazioni»; barra laterale da 1024 px; la voce attiva è evidente. | E2E `shell.spec.ts` (mobile e desktop). |
| A3 | Case e forniture: crea, rinomina, elimina (con riepilogo di che cosa sparisce e conferma); fornitura con tipo, etichetta, fornitore, identificativo (normalizzato), fotovoltaico solo per la luce; modifica, archivia, elimina. | E2E `forniture.spec.ts`; integrazione già nella 02. |
| A4 | Nuova bolletta a mano: parte dal modello del tipo; somme per categoria e avvisi aritmetici dal vivo; salvataggio con `confirmBill`; con una sovrapposizione il modulo chiede «Si somma (conguaglio)» o «Sostituisce la bolletta del …» e risalva. | E2E `bolletta-manuale.spec.ts` (luce, gas con C, internet, sovrapposizione). |
| A5 | Scheda della bolletta: dati, voci raggruppate per categoria con subtotali, letture, avvisi aritmetici; «Modifica» riapre il modulo; «Elimina» chiede conferma e torna alla fornitura. | E2E `bolletta-manuale.spec.ts`. |
| A6 | Autolettura: fornitura a contatore, data (default oggi), un campo per registro (quelli dell'ultima bolletta: F1/F2/F3 o unico; immessa e produzione col fotovoltaico); elenco con cancellazione delle sole autoletture. | E2E `letture.spec.ts`. |
| A7 | Impostazioni: tema `Segui il sistema` · `Chiaro` · `Scuro` (cookie `theme`, nessun lampo al caricamento); «Esci»; «Elimina account» con la password → dati spariti, ritorno ad `/accedi`. | E2E `impostazioni.spec.ts` (utente creato apposta). |
| A8 | Isolamento: seed A che apre l'URL di una bolletta, una fornitura o una casa di seed B riceve la pagina 404; la stessa URL con seed B si apre. | E2E `isolamento.spec.ts` (coppia proprio/altrui). |
| A9 | Accessibilità: axe (WCAG 2.1 A/AA) senza violazioni su ogni pagina, mobile e desktop, tema chiaro e scuro. | E2E `a11y.spec.ts`. |

## 3. Decisioni

- **D-5**, **D-7**, **D-13** (impeccable crea DESIGN.md e PRODUCT.md), **D-24** (sovrapposte: la
  scelta), **D-28** (autolettura a mano), **D-29** (registri del fotovoltaico), **D-38** (solo
  italiano), **D-39** (tema che segue il sistema), **D-40** (elimina account).
- **T-13** (avvisi, mai blocchi), **T-14** (rotte), **T-16** (axe dalla 03), **T-24** (cookie del
  tema), **T-32** (modelli per i canoni).
- Adottate qui, ribaltabili:
  (a) la home `/` della 03 è un **riepilogo per casa**: per ogni fornitura l'ultima bolletta
  (periodo, totale) e il pulsante «Nuova bolletta»; la 04 la trasforma nella dashboard;
  (b) con **più case**, un selettore della casa nell'intestazione di «Casa» e di «Forniture»
  (`?casa=<id>`, default la prima per nome);
  (c) i **modelli di voci** di § 4.4 (poche voci aggregate per tipo); l'owner aggiunge le voci
  di dettaglio con «Aggiungi voce»;
  (d) importi in **euro con la virgola** nei campi (`parseDecimalInput`), prezzi unitari con fino
  a 6 decimali, quantità con fino a 3;
  (e) il periodo di una voce è quello della bolletta finché non si apre «Periodo diverso» sulla voce
  (serve ai ricalcoli);
  (f) «Elimina account» chiede la password e una casella «Ho capito che bollette, letture e file
  vengono cancellati per sempre»;
  (g) le cancellazioni (casa, fornitura, bolletta, autolettura) chiedono conferma in un dialogo
  nativo dell'app (non `window.confirm`), con il riepilogo di che cosa sparisce;
  (h) Server Actions colocate (`actions.ts` nella cartella della rotta), sottili: zod →
  `requireUser()` → servizio → `toActionResult` → `revalidatePath`.

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
> di costo (materia, vendita, rete, oneri, imposte, IVA, altro, energia ceduta, canoni) e per le
> fasce F1/F2/F3.»

Prodotti obbligatori della skill: `DESIGN.md` e `PRODUCT.md` nella root, i token in
`src/app/globals.css` (`@theme`, versione chiara e scura sotto `[data-theme='dark']` e
`@media (prefers-color-scheme: dark)` per `system`), i colori dei grafici come token, con
questi nomi esatti (li usano la 04 e la 08): `--color-cat-commodity`, `--color-cat-sale`,
`--color-cat-network`, `--color-cat-system`, `--color-cat-excise`, `--color-cat-vat`,
`--color-cat-other`, `--color-cat-feed-in`, `--color-cat-flat`, `--color-band-f1`,
`--color-band-f2`, `--color-band-f3`, `--color-band-f23`, `--color-band-single`,
`--color-pv-self`, `--color-pv-feed-in`, `--color-reference`, il logo
`public/brand/logo.svg` (usato dalla 09 per le icone). Le scelte visive le prende la skill con
l'owner; questa spec fissa solo la struttura delle schermate.

### 4.2 Shell e tema

- `src/app/layout.tsx`: legge il cookie `theme` (`system` default) e mette
  `<html lang="it" data-theme={theme}>`; il CSS applica lo scuro con `[data-theme='dark']` e con
  `@media (prefers-color-scheme: dark)` quando `data-theme='system'`. Nessuno script inline.
- `src/app/(app)/layout.tsx`: guardia della 01 + `AppShell` (`src/components/shell/app-shell.tsx`)
  con `NavBar` (mobile, in basso, `position: sticky`) e `SideBar` (≥ 1024 px). Voci e rotte:
  «Casa» `/`, «Bollette» `/bollette`, «Letture» `/letture`, «Forniture» `/forniture`,
  «Impostazioni» `/impostazioni`. La voce attiva ha `aria-current="page"`.
- `src/app/(app)/impostazioni/actions.ts` → `setTheme(theme)`: zod `z.enum(['system','light','dark'])`,
  cookie `theme` per 365 giorni, `sameSite: 'lax'`, `revalidatePath('/', 'layout')`.

### 4.3 Pagine e azioni

Rotte (T-14), tutte sotto `(app)` e quindi protette; ogni pagina legge l'utente con
`requireUser()`/`getSessionUser()` e passa `user.id` ai servizi; un `NOT_FOUND` dei servizi →
`notFound()`.

| Rotta | Contenuto | Azioni (in `actions.ts`) |
|---|---|---|
| `/` | Selettore della casa (se > 1). Per ogni fornitura non archiviata: icona del tipo, etichetta, fornitore, ultima bolletta (periodo `formatDate` – `formatDate`, totale `formatEuro`, «stimata» se `isEstimated`), pulsanti «Nuova bolletta» e (contatori) «Autolettura». Senza case: stato vuoto «Comincia creando la tua casa» → `/forniture`. | — |
| `/forniture` | Case con le loro forniture (archiviate in fondo, attenuate, con «Mostra archiviate»). Form «Nuova casa» (nome). Per casa: «Rinomina», «Elimina» (dialogo: «Eliminerai N forniture, M bollette e K letture.»), «Nuova fornitura». | `createHouseAction`, `renameHouseAction`, `deleteHouseAction`, `createSupplyAction`, `updateSupplyAction`, `archiveSupplyAction`, `deleteSupplyAction` |
| `/forniture/[id]` | Intestazione (tipo, etichetta, fornitore, identificativo, fotovoltaico), «Modifica», «Archivia», «Elimina»; elenco delle bollette della fornitura; ultime 10 letture. La 04 aggiunge i grafici sopra. | come sopra |
| `/bollette` | Elenco di tutte le bollette (50 per pagina, `?pagina=`), filtro per fornitura (`?fornitura=`); riga: fornitura, periodo, totale, badge «stimata», «sostituita». Pulsante «Nuova bolletta». | — |
| `/bollette/nuova?fornitura=<id>` | Senza `fornitura`: prima la scelta della fornitura (solo non archiviate). Poi `BillForm` con il modello del tipo. | `saveBillAction({ input, billId? })` |
| `/bollette/[id]` | Scheda: fornitura, periodo, emissione, scadenza, fornitore, offerta, totale bolletta, totale da pagare, C e PCS (gas), «stimata»/«sostituita da …» (link); voci raggruppate per categoria con subtotale per gruppo e totale; letture; pannello avvisi (`checkBillArithmetic`). «Modifica», «Elimina». | `deleteBillAction(billId)` |
| `/bollette/[id]/modifica` | `BillForm` precompilato da `getBillDetail`. | `saveBillAction` |
| `/letture` | Form «Nuova autolettura» + elenco (fornitura, data, registro, valore, fonte «autolettura»/«da bolletta»), 100 righe, cancellazione solo delle autoletture. | `createReadingsAction`, `deleteReadingAction` |
| `/impostazioni` | Account (nome, email), tema, «Esci», «Elimina account». | `setTheme` |

`saveBillAction({ input, billId })`: `requireUser()` → `confirmBill(db, user.id, input, { source:
'manual', billId })` dentro `toActionResult` → con `ok` `revalidatePath('/bollette')`,
`revalidatePath('/')`, `revalidatePath('/forniture/<supplyId>')` e restituisce `{ billId }`; il client
naviga a `/bollette/<billId>`.

### 4.4 Modelli di voci — `src/components/bills/line-templates.ts` (C-14)

```ts
import type { BillLineInput } from '@/lib/domain/bill-input';
import type { SupplyKind } from '@/lib/domain/types';

export type LineTemplate = Pick<BillLineInput, 'description' | 'category' | 'component' | 'quantityUnit' | 'band'>;

/** The few aggregated lines a hand-typed bill starts from; detail lines are added on demand. */
export function lineTemplateFor(kind: SupplyKind): LineTemplate[] {
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
```

### 4.5 Il modulo — `src/components/bills/bill-form.tsx` (C-14)

Componente client. Firma:

```ts
export interface BillFormProps {
  supply: { id: string; kind: SupplyKind; label: string; hasPhotovoltaic: boolean };
  initialValue: BillInput;
  /** Bills already known to overlap (the review passes them; manual entry learns them on save). */
  overlaps?: ExistingBillPeriod[];
  submitLabel: string;
  onSubmit: (input: BillInput) => Promise<ActionResult<{ billId: string }>>;
}
```

Per una bolletta nuova `initialValue` si costruisce con `emptyBillInput(supply, today)` (stesso
file): periodo dal primo all'ultimo giorno del mese precedente a `today`, `lines` dai modelli con
`quantity: null` (per la voce di consumo `quantity: 0`), `amountCents: 0`, `periodStart/End` della
bolletta, tutti i flag falsi, `readings: []`, `overlapDecision: null`.

Lo stato interno è una **bozza a stringhe** (`BillDraft`, `src/components/bills/bill-draft.ts`):
ogni numero è il testo digitato; `draftFromInput(input)` e `inputFromDraft(draft): { input?: BillInput; errors: FieldErrors }`
convertono con `parseDecimalInput`, `centsFromEuro`, `microsFromEuro` e validano con
`BillInputSchema`; gli errori si mostrano sotto il campo. Le funzioni di `bill-draft.ts` sono pure e
hanno il loro test.

Sezioni, in ordine:
1. **Bolletta**: fornitura (solo testo), periodo dal/al, emissione, scadenza, fornitore, offerta,
   «Consumi stimati» (spunta: imposta `isEstimated` della bolletta e, quando cambia, quello delle
   voci `commodity` non di ricalcolo).
2. **Totali**: «Totale bolletta» (obbligatorio), «Totale da pagare» (facoltativo, la nota dice
   «se diverso: canone TV, saldi precedenti»).
3. **Gas** (solo gas): «Coefficiente C» e «Potere calorifico superiore (GJ/Smc)», con l'aiuto «se
   la bolletta lo stampa in MJ/Smc, dividi per 1000».
4. **Voci**: su mobile una card per voce, da 768 px una tabella. Campi: descrizione, categoria
   (select con le etichette di § 4.6), componente, quantità + unità (unità fissa per la voce di
   consumo), prezzo unitario (€), importo (€, obbligatorio, anche negativo), fascia (solo luce:
   `—`, F1, F2, F3, F23, unica), «Ricalcolo», «Stimata», IVA % (facoltativa), «Periodo diverso»
   (apre dal/al della voce). Pulsanti «Aggiungi voce», «Rimuovi», «Su»/«Giù».
5. **Riepilogo** (dal vivo): somma per categoria con le etichette di § 4.6, totale calcolato, e il
   pannello di `checkBillArithmetic`: «Le voci sommano X, il totale stampato è Y (differenza Z)»
   in stile di avviso quando incoerente; per ogni `lineMismatches` «Voce N: quantità × prezzo fa
   X, l'importo è Y».
6. **Letture della bolletta** (solo contatori): righe data · registro (quelli di
   `allowedRegisters`) · valore · «Rilevata»/«Stimata»; «Aggiungi lettura».
7. **Sovrapposizione**: se `overlaps` non è vuoto (dalle props o da un `OVERLAP_DECISION_REQUIRED`
   del salvataggio, `details` = le bollette), un riquadro elenca le bollette («dal … al …», link
   che si apre in una nuova scheda) e chiede la scelta con due radio: «Si somma: è un conguaglio o
   una bolletta in più» (`sum`) e «Sostituisce quella vecchia» (`replace`); il pulsante resta
   disattivato finché non si sceglie.
8. Pulsante `submitLabel` («Salva bolletta» nella 03, «Conferma» nella 06). Un `VALIDATION` del
   server mostra i messaggi in cima al modulo.

### 4.6 Etichette — in `src/lib/format.ts`

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

`src/components/readings/self-reading-form.tsx` (client): select della fornitura (solo a contatore,
non archiviate), data (default `romeToday(Date.now())` calcolato dalla pagina e passato come prop),
i campi dei registri: se l'ultima bolletta della fornitura ha letture F1/F2/F3 → tre campi «F1»,
«F2», «F3», altrimenti «Lettura»; col fotovoltaico in più «Immessa» e «Produzione» (facoltativi);
unità accanto al campo (`kWh` o `m³`). La pagina calcola i registri con il servizio nuovo
`suggestedRegisters(db, userId, supplyId): Promise<ReadingRegister[]>` (in
`src/lib/services/readings.ts`, aggiunto qui: ultima bolletta per `periodEnd`, i registri delle sue
letture, o `['single']`, più `feed_in` e `production` col fotovoltaico). Un campo vuoto non si
invia; almeno un valore.

### 4.8 Elimina account

`src/components/settings/delete-account.tsx` (client): password + casella di conferma; chiama
`authClient.deleteUser({ password })`; al successo `router.replace('/accedi')`; all'errore «Password
non corretta.». Il server fa già il resto (01: `beforeDelete` → `deleteAllUserData`).

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
- Playwright: aspettare l'idratazione prima di compilare i form; parole spia diverse per ogni
  file di test (segnaprezzi § 4.60).

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `line-templates.test.ts`: ogni tipo produce un modello che, riempito con numeri tondi, passa `BillInputSchema` e `assertInputFitsSupply`; la luce ha una sola voce `commodity` in kWh. | Unità `Smc` sulla luce → `assertInputFitsSupply` fallisce. |
| Unit | `bill-draft.test.ts`: `draftFromInput` → `inputFromDraft` restituisce lo stesso input; «12,34» → 1234; «0,099» → 99000 µ€; importo vuoto → errore sul campo; quantità «abc» → errore. | `centsFromEuro` al posto di `microsFromEuro` per il prezzo → 9,9 invece di 99000. |
| E2E | `shell.spec.ts`: cinque voci, `aria-current` sulla pagina aperta, mobile in basso e desktop a lato. | Togliere `aria-current` → fallisce. |
| E2E | `forniture.spec.ts` (utente nuovo): casa «Casa Quokka», fornitura luce con identificativo `it 001 e 0000-0042` → mostrato `IT001E00000042`; fotovoltaico assente sul gas; elimina casa con il riepilogo dei conteggi. | Saltare la normalizzazione → il testo mostrato differisce. |
| E2E | `bolletta-manuale.spec.ts` (utente nuovo, parola spia «capibara»): luce dal modello con importi tondi → scheda con i subtotali; gas con C 1,02 e PCS 0,0385; internet con «Canone» e «IVA»; una seconda luce sullo stesso periodo → riquadro di sovrapposizione → «Sostituisce» → la prima mostra «sostituita»; modifica di un importo; eliminazione → torna alla fornitura e la prima ritorna normale. | Inviare senza `overlapDecision` dopo la scelta → resta l'errore. |
| E2E | `letture.spec.ts`: con una bolletta con letture F1/F2/F3 il form propone tre campi; autolettura salvata ed elencata; le letture della bolletta non hanno «Elimina». | Proporre sempre «Lettura» → fallisce. |
| E2E | `impostazioni.spec.ts`: tema «Scuro» → `html[data-theme=dark]` anche dopo il ricaricamento; «Elimina account» con un utente creato nel test che ha una bolletta → `/accedi`, accesso con le stesse credenziali rifiutato. | Non chiamare `deleteAllUserData` nell'hook → l'eliminazione fallisce (foreign key) e il test resta su Impostazioni. |
| E2E | `isolamento.spec.ts`: seed A apre `/bollette/<id di B>`, `/forniture/<id di B>`, `/bollette/<id di B>/modifica` → 404; seed B le apre. Una Server Action chiamata con l'id di B da A (`saveBillAction` con `billId` di B) → `NOT_FOUND`. | Togliere `userId` da `getBill` → A apre la bolletta di B. |
| E2E | `a11y.spec.ts`: ogni rotta di § 4.3 con seed A, mobile e desktop, tema chiaro e scuro, `AxeBuilder().withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` → 0 violazioni. | Un `<input>` senza etichetta → violazione. |

`pnpm add -D @axe-core/playwright@4.14.0`.

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: E2E della 01 e test della 02 verdi.
- **B — Cambio di contesto**: con seed A si vede la «Casa Fenicottero» con quattro forniture e
  le ultime bollette; con seed B la «Casa Ornitorinco». Esito atteso dichiarato prima.
- **C — Comportamento nuovo**: tutta la suite verde. Poi uno script usa e getta con Playwright
  (sessione di seed A) inserisce a mano una bolletta del gas con parola spia «tapiro» nella
  descrizione di una voce e verifica **sul DB** (`createDb` su `local.db`) la riga in `bills`, le
  voci in `bill_lines` con `amount_cents` attesi e `conversion_factor`.
- **D — Sotto la UI**: lo script chiama `saveBillAction` di A con l'id di una bolletta di B → atteso
  `NOT_FOUND` e la bolletta di B invariata sul DB.
- **E — Casi negativi**: coperti da `isolamento.spec.ts`; si citano.
- **F — Giro guidato** (al via dell'owner, con le fixture vive, una pagina per messaggio, sessione
  di seed A già aperta): (1) `/` — il riepilogo si legge al volo? (2) `/bollette/nuova?fornitura=<luce>`
  — il modulo su telefono (390 px) è compilabile senza fatica? (3) `/bollette/<id>` — subtotali e
  avvisi chiari? (4) `/letture` — la scelta dei registri è ovvia? (5) `/impostazioni` — tema chiaro
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
- **`doc/guide/app.md`** (nasce qui, ≤ 300 righe): rotte e azioni, il modulo della bolletta (bozza a
  stringhe, conversioni, sovrapposizione), i modelli di voci, il tema, le regole dei test E2E
  (utenti seed, parole spia, `data-testid`).
- `AGENTS.md`: § 7 UI (stub che rimanda a `doc/guide/app.md` e DESIGN.md); § 9 Testing (axe,
  progetti, parole spia).
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
- Controlla con un grep che i contratti C-3, C-5…C-13 esistano con i nomi e le firme dell'indice

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/03-design-manual-entry. Crea SESSION_NOTES.md.

Comincia da § 4.1: invoca la skill impeccable con il brief della spec e porta avanti la
direzione visiva con me fino a DESIGN.md, PRODUCT.md, token e logo. Solo dopo scrivi i
componenti. Poi implementa la spec esattamente come scritta: § 4 è la soluzione, § 6 i test con
le mutazioni che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima; il giro
guidato parte al mio via, una pagina per messaggio), § 9 la documentazione. Non decidere nulla
che la spec ha già deciso; se trovi un punto che la spec non copre, fermati e chiedimelo con
AskUserQuestion. Le etichette della serie non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
