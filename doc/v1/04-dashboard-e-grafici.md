# 04 — Dashboard e grafici

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/04-dashboard` da `main`. **Dipende da**: 03 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-22, D-23, D-25, D-26, D-29, D-30, D-31,
> D-36; scelte T-1 (recharts), T-29; contratti C-13 (`dashboard.ts`), C-15 — li crea; usa C-6…C-12.

## 1. Il problema oggi (prove)

1. Dopo la 03 l'owner inserisce bollette e letture, ma vede solo elenchi e schede: nessun
   andamento nel tempo, che è il motivo dell'app (tema: «l'andamento nel tempo dei consumi … del
   costo unitario … e dei costi generali»).
2. Il motore della 02 (`buildSupplyMonths`, `buildHouseMonths`, `rolling12`, `yearOverYear`)
   produce già le serie mensili per competenza, con i mesi stimati, i due costi unitari, il
   consumo da letture dopo l'ultima bolletta e il fotovoltaico: manca chi le legge dal DB e le
   disegna.
3. Le scelte dell'owner fissano i grafici (D-30): consumi per mese, costo unitario nel tempo, costi
   per categoria, anno su anno, con Recharts (come hevy-coach, net-worth-tracker e
   stock-fundamental). Recharts 3.10.1 ha come peer `react-is` (npm, 2026-10-24).
4. DESIGN.md (dalla 03) contiene i token delle categorie di costo e delle fasce
   (`--color-cat-*`, `--color-band-*`).

## 2. Obiettivo e criteri di accettazione

La dashboard della casa in `/` e i grafici della fornitura in `/forniture/[id]`, alimentati dal
motore, con il selettore del periodo e un'alternativa testuale accessibile per ogni grafico.

| # | Criterio | Prova |
|---|---|---|
| A1 | `getSupplyDashboard` e `getHouseDashboard` leggono solo i dati dell'utente e restituiscono le serie del periodo scelto più i 12 mesi prima (per l'anno su anno). | `dashboard.test.ts` (coppia proprio/altrui). |
| A2 | `/forniture/[id]` di una fornitura a contatore mostra, nell'ordine: consumi per mese, costo unitario (due linee), costi per categoria, anno su anno con i due riquadri «ultimi 12 mesi»; una fornitura a canone mostra costi (solo totale) e anno su anno sulla spesa. | E2E `dashboard.spec.ts` con seed A. |
| A3 | I mesi stimati si distinguono nei consumi (riempimento tratteggiato e voce di legenda «stimato»); il consumo da letture dopo l'ultima bolletta è un segmento a parte «da letture, non ancora fatturato». | Unit `series.test.ts`; E2E (legenda presente con l'autolettura dei seed). |
| A4 | Col fotovoltaico, i consumi della luce mostrano anche l'autoconsumo (impilato) e l'immessa (linea). | Unit `series.test.ts`. |
| A5 | `/` mostra per la casa: due riquadri (spesa degli ultimi 12 mesi con la variazione sui 12 precedenti; spesa media mensile), i costi per categoria della casa (canoni in «Canoni e tributi»), una card per fornitura con consumo e costo unitario totale dell'ultimo mese fatturato; sotto, il riepilogo della 03. | E2E `dashboard.spec.ts`. |
| A6 | Selettore del periodo «12 mesi» · «24 mesi» (default) · «Tutto» (`?periodo=12\|24\|tutto`). | E2E: con `?periodo=12` il grafico dei costi ha 12 barre. |
| A7 | Per l'acqua, sotto il costo unitario: «Per l'acqua non esiste una serie nazionale di riferimento: nessun confronto.» (D-36). | E2E sulla fornitura «Acqua» di seed A. |
| A8 | Ogni grafico ha una tabella alternativa (`<details>` «Vedi i dati») con gli stessi numeri formattati da `format.ts`; axe senza violazioni. | `a11y.spec.ts` esteso alle due pagine; unit sui dati della tabella. |
| A9 | Seed A che apre `/forniture/<id di B>` riceve 404. | `isolamento.spec.ts` già della 03, esteso alla pagina con i grafici. |

## 3. Decisioni

- **D-22** (due costi unitari), **D-23** (competenza, stimati), **D-25** (consumi e letture),
  **D-26** (materia senza IVA, totale con), **D-29** (fotovoltaico), **D-30** (quattro grafici,
  Recharts), **D-31** (unità come in bolletta), **D-36** (acqua senza confronto).
- **T-29** (24 mesi di default).
- Adottate qui, ribaltabili:
  (a) i dati dei grafici si preparano in funzioni pure (`src/lib/charts/series.ts`) che
  convertono in unità di visualizzazione (euro e €/unità come numeri) — è l'unico posto, oltre a
  `format.ts`, dove si divide per 100 o per 1.000.000;
  (b) «ultimo mese fatturato» della card = l'ultimo mese con `billedDays` ≥ metà dei giorni del
  mese;
  (c) il costo unitario si disegna solo per i mesi con consumo > 0; i buchi restano buchi
  (`connectNulls={false}`);
  (d) l'energia ceduta (credito) nei costi è una barra negativa sotto lo zero, colore
  `--color-cat-feed-in`;
  (e) prima di scrivere i grafici chi implementa carica la skill `dataviz` e ne applica le regole
  (assi, legende, tooltip, contrasto, tabella alternativa) dentro i vincoli di questa spec e i
  token di DESIGN.md.

## 4. La soluzione

### 4.1 Servizio — `src/lib/services/dashboard.ts` (C-13)

```ts
export type DashboardRange = '12' | '24' | 'all';

export interface SupplyDashboard {
  supply: SupplyRow;
  /** The months shown (range), each with its consumption, costs and unit prices. */
  months: SupplyMonth[];
  /** The same series extended 12 months back, for the year-over-year chart. */
  monthsWithPreviousYear: SupplyMonth[];
  rolling: ReturnType<typeof rolling12>;
  lastBilledMonth: MonthKey | null;
}

export async function getSupplyDashboard(db: Db, userId: string, supplyId: string, options: { today: IsoDate; range: DashboardRange }): Promise<SupplyDashboard>;
export async function getHouseDashboard(db: Db, userId: string, houseId: string, options: { today: IsoDate; range: DashboardRange }): Promise<HouseDashboard>;
```

- `toMonth = monthKeyOf(today)`; `fromMonth` = `shiftMonth(toMonth, -11)` per `12`,
  `shiftMonth(toMonth, -23)` per `24`, e per `all` il mese più vecchio fra `periodStart` delle voci e
  `readOn` delle letture della fornitura (o `toMonth` se non ce ne sono).
- Si chiama `buildSupplyMonths` una volta da `shiftMonth(fromMonth, -12)` a `toMonth`;
  `months` è la coda da `fromMonth`, `monthsWithPreviousYear` tutto.
- `rolling = rolling12(monthsWithPreviousYear, lastBilledMonth ?? toMonth)`.
- `lastBilledMonth`: l'ultimo mese con `billedDays * 2 >= daysInMonth(month)`.
- `NOT_FOUND` se la fornitura o la casa non è dell'utente.
- `HouseDashboard = { house; supplies: Array<{ supply: SupplyRow; months: SupplyMonth[]; lastBilledMonth: MonthKey | null }>; houseMonths: HouseMonth[]; rolling: { last12: number; previous12: number } }`
  con `houseMonths = buildHouseMonths(...)` sul periodo e `rolling` = somme di `totalCents` dei 12
  mesi che finiscono al mese corrente e dei 12 prima (calcolate su una serie estesa di 12 mesi come
  sopra). Le forniture archiviate contano nei costi della casa (sono spese vere) ma non hanno card.

### 4.2 Serie per i grafici — `src/lib/charts/series.ts` (pura)

```ts
export interface ConsumptionPoint {
  month: MonthKey;
  label: string;          // formatMonth(month)
  F1: number | null; F2: number | null; F3: number | null; F23: number | null; single: number | null;
  fromReadings: number | null;
  selfConsumption: number | null;
  feedIn: number | null;
  isEstimated: boolean;
}

export function toConsumptionSeries(months: SupplyMonth[], options: { hasPhotovoltaic: boolean }): ConsumptionPoint[];

export interface UnitPricePoint {
  month: MonthKey;
  label: string;
  /** €/unit, net of VAT */
  commodity: number | null;
  /** €/unit, VAT included */
  total: number | null;
}
export function toUnitPriceSeries(months: SupplyMonth[]): UnitPricePoint[];

export interface CostPoint {
  month: MonthKey;
  label: string;
  commodity: number; sale: number; network: number; system: number; excise: number; vat: number; other: number;
  feedIn: number;   // ≤ 0
  flat: number;     // house only
  total: number;
}
export function toCostSeries(months: SupplyMonth[]): CostPoint[];
export function toHouseCostSeries(months: HouseMonth[]): CostPoint[];

export interface YearOverYearPoint {
  month: MonthKey;         // the month of the current year
  label: string;           // short month name: 'gen', 'feb', …
  current: number | null;
  previous: number | null;
}
export function toYearOverYearSeries(monthsWithPreviousYear: SupplyMonth[], endMonth: MonthKey, metric: 'consumption' | 'cost'): YearOverYearPoint[];

export function percentChange(current: number, previous: number): number | null; // null when previous is 0
```

Regole: euro = `cents / 100`; €/unità = `micros / 1_000_000`; le quantità restano come sono; una
fascia senza consumo è `null` (Recharts non disegna il segmento); `feedIn` dei costi =
`costs.feed_in / 100` (≤ 0); `selfConsumption`/`feedIn` dei consumi solo con `hasPhotovoltaic`;
`toYearOverYearSeries` restituisce i 12 mesi che finiscono a `endMonth`, con `previous` dal mese
−12.

### 4.3 Componenti — `src/components/charts/` (C-15)

- `recharts.ts`: `'use client'` e **unico** file che importa `recharts` (riesporta
  `ResponsiveContainer`, `BarChart`, `Bar`, `LineChart`, `Line`, `ComposedChart`, `XAxis`, `YAxis`,
  `CartesianGrid`, `Tooltip`, `Legend`, `ReferenceLine`).
- `chart-frame.tsx`: titolo, sottotitolo con l'unità, il grafico (altezza 240 px su mobile, 320 px
  da 768 px), la legenda e `<details><summary>Vedi i dati</summary><table>…</table></details>`;
  riceve `columns` e `rows` già formattati con `format.ts`.
- `consumption-chart.tsx` — `ConsumptionChart({ points, unit, hasPhotovoltaic })`: `ComposedChart`
  con barre impilate `F1`, `F2`, `F3`, `F23`, `single` (colori `--color-band-*`, `single` usa
  `--color-band-single`), poi `fromReadings` (stesso stack, riempimento a righe con un `<pattern>`
  SVG e bordo), `selfConsumption` (stack, `--color-pv-self`), linea `feedIn` (`--color-pv-feed-in`);
  i mesi `isEstimated` hanno opacità 0,55 e un `<pattern>` tratteggiato via `Cell`; legenda con
  «stimato» e «da letture, non ancora fatturato» solo se presenti; tooltip con `formatQuantity`.
- `unit-price-chart.tsx` — `UnitPriceChart({ points, unit, references?: ReferenceLine[], note? })`:
  `LineChart` con «Materia prima (senza IVA)» e «Costo totale per unità (IVA inclusa)»;
  `references` disegnate tratteggiate (la 08 le passa; qui il tipo esiste e l'array è vuoto);
  `note` è il testo sotto il grafico (l'acqua lo usa per D-36).

```ts
export interface ReferenceLine {
  key: string;
  label: string;
  /** e.g. 'Fonte: ARERA' — printed under the chart. */
  source: string;
  /** €/unit (net of VAT) per month; null where the series has no value. */
  values: Record<MonthKey, number | null>;
}
```

- `costs-chart.tsx` — `CostsChart({ points, mode: 'supply' | 'flat' | 'house' })`: barre impilate
  per categoria (`supply`: le sette categorie + `feedIn` negativa; `flat`: solo `total`; `house`:
  le sette + `flat` «Canoni e tributi» + `feedIn`), colori `--color-cat-*`, tooltip con
  `formatEuro` su ogni segmento e il totale.
- `year-over-year-chart.tsx` — `YearOverYearChart({ points, metric, unit? })`: barre affiancate
  «quest'anno» / «anno prima»; sopra, due riquadri (`KpiTile`): «Ultimi 12 mesi» con il totale e
  la variazione percentuale sui 12 precedenti (`percentChange`; «—» se non calcolabile) per
  consumo e spesa. Il commutatore «Consumo / Spesa» (solo contatori) cambia `metric` lato client.

### 4.4 Pagine

- `/forniture/[id]/page.tsx`: legge `?periodo` (`12` · `24` · `tutto`, default `24`; un valore
  diverso → `24`), `today = romeToday(Date.now())`, chiama `getSupplyDashboard`; mostra il
  selettore del periodo (link con `aria-current`), poi i grafici di A2 e sotto le sezioni della 03
  (bollette e letture). Una fornitura senza bollette mostra al posto dei grafici lo stato vuoto
  «Ancora nessuna bolletta: aggiungi la prima» con il link alla nuova bolletta.
- `/page.tsx` (Casa): selettore della casa (03), selettore del periodo, `KpiTile` × 2,
  `CostsChart mode="house"`, le card delle forniture (consumo e `totalUnitPriceMicros` di
  `lastBilledMonth` con `formatQuantity` e `formatUnitPrice`; per i canoni la spesa di quel mese),
  poi il riepilogo della 03.

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che le pagine chiamano solo `dashboard.ts`; i
  componenti dei grafici non conoscono il DB né il motore, ricevono punti già pronti.
- **AGENTS.md § 2.5 Money and dates** — divisioni per 100 e 10⁶ solo in `series.ts` e in
  `format.ts`; i mesi restano `MonthKey`.
- **AGENTS.md § 7 UI** — Recharts solo attraverso `recharts.ts`; colori solo da token (via
  `var(--…)` nelle prop `fill`/`stroke`); i grafici sono componenti client caricati dentro pagine
  server.
- Recharts 3 + React 19: serve `react-is@19.3.1` installato a fianco (peer dipendenza).
- `ResponsiveContainer` dentro un genitore senza altezza esplicita non disegna nulla: `chart-frame`
  fissa l'altezza.
- Un'ora legale nel mezzo non tocca nulla: i mesi vengono dal motore, che lavora su date.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `series.test.ts`: `toConsumptionSeries` con un mese 200 kWh F1/F2/F3 80/60/60 → punti 80/60/60, `single` null; un mese con `readingsConsumption 50` → `fromReadings 50`; fotovoltaico → `selfConsumption` e `feedIn`; senza fotovoltaico → entrambi null. `toUnitPriceSeries`: 100000 µ€ → 0,1. `toCostSeries`: `feed_in -500` → `feedIn -5`. `toYearOverYearSeries`: 24 mesi → 12 punti con `previous` = valore di 12 mesi prima. `percentChange(110, 100) === 10`, `(5, 0) === null`. | Dividere per 1000 invece che per 10⁶ → 100 invece di 0,1. |
| Integrazione | `dashboard.test.ts`: due utenti; `getSupplyDashboard` della fornitura propria con `range '12'` → 12 mesi in `months` e 24 in `monthsWithPreviousYear`; fornitura altrui → `NOT_FOUND`; `getHouseDashboard` somma luce e internet nello stesso mese e mette l'internet in `flat`; `all` parte dal mese della lettura più vecchia. | Calcolare `fromMonth` con `-12` per `'12'` → 13 mesi. |
| E2E | `dashboard.spec.ts` (seed A): `/forniture/<luce>` → quattro `chart-frame` con titolo; la legenda contiene «da letture, non ancora fatturato» (autoletture seed); `?periodo=12` → la tabella «Vedi i dati» dei costi ha 12 righe; `/forniture/<acqua>` → il testo di D-36; `/forniture/<internet>` → due grafici; `/` → due riquadri e una card per fornitura. | Ignorare `?periodo` → 24 righe. |
| E2E | `a11y.spec.ts` e `isolamento.spec.ts` estesi a `/` e `/forniture/[id]` con i grafici. | Un grafico senza tabella alternativa né `aria-label` → violazione. |

`pnpm add recharts@3.10.1 react-is@19.3.1`.

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: tutta la suite precedente verde.
- **C — Comportamento nuovo**: suite verde; uno script usa e getta stampa per la «Luce» di seed A
  l'ultimo mese di `getSupplyDashboard`. Esito atteso dichiarato prima: 200 kWh, `F1 80 · F2 60 ·
  F3 60`, materia 0,1000 €/kWh, totale (4730 cent ÷ 200) 0,2365 €/kWh; il riquadro «Ultimi 12 mesi»
  della casa uguale alla somma dei 12 mesi letti dal DB con una query diretta.
- **D — Sotto la UI**: lo script prova `getSupplyDashboard` di seed A con l'id di una fornitura di
  seed B → `NOT_FOUND`.
- **F — Giro guidato** (al via dell'owner, sessione di seed A, una pagina per messaggio): (1) `/` —
  la casa si capisce in cinque secondi? (2) `/forniture/<luce>` — consumi per fascia e mesi stimati
  si distinguono? (3) stesso URL — il costo unitario: le due linee si leggono senza legenda? (4)
  `/forniture/<gas>?periodo=tutto` — l'inverno salta all'occhio? (5) mobile 390 px — i grafici
  restano leggibili? Che cosa NON copre: i riferimenti di mercato (08), le bollette vere
  dell'owner (07).
- **G — Ripristino**: lo script si cancella.

## 8. Messa in esercizio

- Nessuna migrazione, nessuna variabile.
- Misura di chiusura: suite verde e collaudo annotato; la 05 rifà in produzione il giro di `/`
  con una bolletta inventata.

## 9. Documentazione

- `CLAUDE.md`: Latest; § Key Features (la riga della dashboard, con i quattro grafici);
  § Architecture Snapshot (`series.ts` e `components/charts`).
- `doc/guide/app.md`: sezione «Dashboard e grafici» (servizio, serie, componenti, regole dei colori
  e della tabella alternativa) — la guida resta sotto le 500 righe.
- `doc/guide/calcoli.md`: un paragrafo su «ultimo mese fatturato» e sul periodo con i 12 mesi in
  più.
- `AGENTS.md` § 7 UI: Recharts solo da `recharts.ts`.

## 10. Fuori ambito, dichiarato

- Riferimenti di mercato sul costo unitario → **08**.
- Grafici giornalieri, zoom e confronti fra forniture di case diverse → CLAUDE.md § Not yet present.
- Previsione della prossima bolletta → CLAUDE.md § Not yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **M**.

```
Ciao, in questa sessione implemento la spec doc/v1/04-dashboard-e-grafici.md.

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), DESIGN.md, doc/guide/calcoli.md e doc/guide/app.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 04 INTERA
- Controlla con un grep che i contratti C-6…C-13 esistano con i nomi e le firme dell'indice
- Prima di scrivere il primo grafico carica la skill dataviz

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/04-dashboard. Crea SESSION_NOTES.md.

Implementa la spec 04 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima; il giro guidato parte
al mio via, una pagina per messaggio), § 9 la documentazione. Non decidere nulla che la spec ha
già deciso; se trovi un punto che la spec non copre, fermati e chiedimelo con AskUserQuestion. Le
etichette della serie non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
