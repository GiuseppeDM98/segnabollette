# 04 — Dashboard e grafici

> **Stato**: scritta 2026-10-24; riletta in modo adversariale il 2026-10-24: 20 rilievi, 4 decisioni
> (D-43, D-52, D-53, D-54). Implementata il 2026-10-24 sul branch `feature/04-dashboard`, con tre
> decisioni dell'owner in implementazione (D-65, D-66, D-67); collaudo guidato fatto e chiuso il
> 2026-10-24, nessun rilievo aperto. In esercizio dopo il merge della PR.
> **Branch**: `feature/04-dashboard` da `main`. **Dipende da**: 03 (ritirata il 2026-10-24).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-22, D-23, D-25, D-26, D-29, D-30, D-31,
> D-36, D-43, D-52, D-53, D-54; scelte T-1 (recharts), T-29, T-30 (avviso del coefficiente C);
> contratti: crea C-13 (`dashboard.ts`) e C-15 (componenti e tipo `ReferenceLine` in
> `src/lib/charts/series.ts`), aggiunge a C-8 `formatEuroValue` e `formatUnitPriceValue`; usa C-3,
> C-4, C-5, C-6…C-12, C-21.

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
4. DESIGN.md (dalla 03) contiene i token delle categorie di costo, delle fasce e delle serie dei
   grafici (`--color-cat-*`, `--color-band-*`, `--color-readings`, `--color-pv-*`,
   `--color-price-*`, `--color-yoy-*`).
5. La home `/` della 03 ha già una card per fornitura (`data-testid="supply-card"`) con l'ultima
   bolletta e i pulsanti: la dashboard della casa la estende, non ne aggiunge una seconda (D-52).

## 2. Obiettivo e criteri di accettazione

La dashboard della casa in `/` e i grafici della fornitura in `/forniture/[id]`, alimentati dal
motore, con il selettore del periodo e un'alternativa testuale accessibile per ogni grafico.

| # | Criterio | Prova |
|---|---|---|
| A1 | `getSupplyDashboard` e `getHouseDashboard` leggono solo i dati dell'utente (un id altrui → `NOT_FOUND`) e restituiscono le serie del periodo scelto e i 24 mesi che finiscono all'ultimo mese fatturato (anno su anno e riquadri). | `dashboard.test.ts` (coppia proprio/altrui per ognuno dei due servizi). |
| A2 | `/forniture/[id]` di una fornitura a contatore mostra, nell'ordine: consumi per mese, costo unitario (due linee), costi per categoria, anno su anno con i riquadri «Ultimi 12 mesi» di consumo e spesa; una fornitura a canone mostra costi (solo totale) e anno su anno sulla spesa con il solo riquadro della spesa. La variazione sui 12 mesi precedenti compare solo se i due periodi hanno 12 mesi con bollette ciascuno, altrimenti «—». | E2E `dashboard.spec.ts` con seed A; integrazione `dashboard.test.ts` (`isComparable`). |
| A3 | I mesi stimati si distinguono nei consumi (riempimento tratteggiato e voce di legenda «stimato»); il consumo da letture dopo l'ultima bolletta è un segmento a parte «da letture, non ancora fatturato»; se le letture del gas sono convertite con C = 1, sotto il grafico la nota «Coefficiente C non noto: i m³ delle autoletture sono convertiti con C = 1.» (T-30). | Unit `series.test.ts`; E2E (legenda presente con l'autolettura dei seed). |
| A4 | Col fotovoltaico, i consumi della luce mostrano anche l'autoconsumo (impilato) e l'immessa (linea). | Unit `series.test.ts`. |
| A5 | `/` mostra per la casa: due riquadri (spesa degli ultimi 12 mesi con la variazione sui 12 precedenti; spesa media mensile) sulla finestra che finisce al più vecchio fra gli ultimi mesi fatturati delle forniture non archiviate (D-53, D-54), i costi per categoria della casa (canoni in «Canoni e tributi»), e una sola card per fornitura non archiviata — quella della 03 — con in più consumo e costo unitario totale dell'ultimo mese fatturato (D-52). | E2E `dashboard.spec.ts`; integrazione `dashboard.test.ts` (finestra e media). |
| A6 | Selettore del periodo «12 mesi» · «24 mesi» (default) · «Tutto» (`?periodo=12\|24\|tutto`). | E2E: con `?periodo=12` la tabella «Vedi i dati» dei costi ha 12 righe (una per barra). |
| A7 | Per l'acqua, sotto il costo unitario: «Per l'acqua non esiste una serie nazionale di riferimento: nessun confronto.» (D-36). | E2E sulla fornitura «Acqua» di seed A. |
| A8 | Ogni grafico ha una tabella alternativa (`<details>` «Vedi i dati») con gli stessi numeri formattati da `format.ts`; axe senza violazioni. | `dashboard.spec.ts`: con `?periodo=12` ogni `chart-frame` contiene un `<details>` con una `<table>` di 12 righe, una per mese; `a11y.spec.ts` esteso alle due pagine. |
| A9 | Seed A che apre `/forniture/<id di B>` o `/?casa=<id casa di B>` riceve 404; seed B le apre. | `isolamento.spec.ts` già della 03, esteso alle due pagine con i grafici. |
| A10 | L'energia ceduta è un segmento negativo sotto lo zero nei costi e il «Totale» del mese è al netto del credito (D-43); i segmenti negativi (energia ceduta, sconti, oneri compensativi) si impilano sotto lo zero, quelli positivi sopra. | Unit `series.test.ts` (`total` col credito). |

## 3. Decisioni

- **D-22** (due costi unitari), **D-23** (competenza, stimati), **D-25** (consumi e letture),
  **D-26** (materia senza IVA, totale con), **D-29** (fotovoltaico), **D-30** (quattro grafici,
  Recharts), **D-31** (unità come in bolletta), **D-36** (acqua senza confronto).
- **D-43** (il totale del mese comprende l'energia ceduta: costo totale per unità, spesa della
  casa, riquadri e somma delle categorie sono al netto del credito), **D-52** (una sola card per
  fornitura nella Casa: quella della 03, estesa qui), **D-53** (la finestra dei riquadri della Casa
  finisce al più vecchio fra gli ultimi mesi fatturati delle forniture non archiviate con
  bollette; «—» se nessuna), **D-54** (spesa media mensile = spesa degli ultimi 12 mesi ÷ mesi
  della finestra con giorni fatturati in almeno una fornitura).
- **T-29** (24 mesi di default), **T-30** (avviso «coefficiente C non noto»).
- Adottate qui, ribaltabili:
  (a) i dati dei grafici si preparano in funzioni pure (`src/lib/charts/series.ts`) che
  convertono in unità di visualizzazione (euro e €/unità come numeri) — è l'unico posto, oltre a
  `format.ts`, dove si divide per 100 o per 1.000.000; assi, tooltip e tabelle formattano quei
  numeri con `formatEuroValue` e `formatUnitPriceValue`;
  (b) «ultimo mese fatturato» di una fornitura (card, anno su anno, riquadri) = l'ultimo mese con
  `billedDays` ≥ metà dei giorni del mese; anno su anno e riquadri della fornitura usano i 24 mesi
  che finiscono lì;
  (c) il costo unitario si disegna solo per i mesi con consumo > 0; i buchi restano buchi
  (`connectNulls={false}`);
  (d) l'energia ceduta (credito) nei costi è una barra negativa sotto lo zero, colore
  `--color-cat-feed-in`; i grafici impilati usano `stackOffset="sign"`;
  (e) prima di scrivere i grafici chi implementa carica la skill `dataviz` e ne applica le regole
  (assi, legende, tooltip, contrasto, tabella alternativa) dentro i vincoli di questa spec e i
  token di DESIGN.md;
  (f) la variazione sui 12 mesi precedenti si mostra solo se il confronto è valido: per una
  fornitura, 12 mesi con bollette in tutti e due i periodi; per la casa, ognuno dei 24 mesi con
  giorni fatturati in almeno una fornitura; altrimenti «—».

## 4. La soluzione

### 4.1 Servizio — `src/lib/services/dashboard.ts` (C-13)

```ts
export type DashboardRange = '12' | '24' | 'all';

export interface SupplyDashboard {
  supply: SupplyRow;
  /** The months shown (range), each with its consumption, costs and unit prices. */
  months: SupplyMonth[];
  /** The 24 months ending at the last billed month (or the current one): year-over-year chart and tiles. */
  yearOverYearMonths: SupplyMonth[];
  rolling: ReturnType<typeof rolling12>;
  /** Both 12-month periods have 12 months with bills: only then the change is shown. */
  isComparable: boolean;
  lastBilledMonth: MonthKey | null;
}

export interface HouseDashboard {
  house: HouseRow;
  /** Every supply of the house, archived ones included (they count in the costs, they get no card). */
  supplies: Array<{
    supply: SupplyRow;
    months: SupplyMonth[];
    lastBilledMonth: MonthKey | null;
    /** The month lastBilledMonth taken from the whole series, not only from the range. */
    lastBilled: SupplyMonth | null;
  }>;
  /** The months shown (range), summed over all the supplies. */
  houseMonths: HouseMonth[];
  /** Last month of the tiles' window; null when no active supply has a billed month. */
  houseEndMonth: MonthKey | null;
  /** Cents of the 12 months ending at houseEndMonth and of the 12 before; null with houseEndMonth null. */
  rolling: { last12: number; previous12: number; isComparable: boolean } | null;
  /** rolling.last12 over the months of its window with billed days, rounded; null when there are none. */
  averageMonthlyCents: number | null;
}

export async function getSupplyDashboard(db: Db, userId: string, supplyId: string, options: { today: IsoDate; range: DashboardRange }): Promise<SupplyDashboard>;
export async function getHouseDashboard(db: Db, userId: string, houseId: string, options: { today: IsoDate; range: DashboardRange }): Promise<HouseDashboard>;
```

`getSupplyDashboard`:

- `getSupply(db, userId, supplyId)` → `NOT_FOUND` se manca (fornitura di un altro utente
  compresa); poi `listEngineBills` e `listEngineReadings` della fornitura.
- `toMonth = monthKeyOf(today)`; `oldestMonth` = il mese più vecchio fra `periodStart` delle voci
  delle bollette `confirmed` e `readOn` delle letture della fornitura (`toMonth` se non ce ne
  sono); `fromMonth` = `shiftMonth(toMonth, -11)` per `12`, `shiftMonth(toMonth, -23)` per `24`,
  `oldestMonth` per `all`.
- Si chiama `buildSupplyMonths` una volta, da `seriesStart` = il minore fra `fromMonth` e
  `shiftMonth(oldestMonth, -23)` fino a `toMonth` (prima di `oldestMonth` i mesi sono vuoti: così
  la serie contiene qualunque finestra di 24 mesi che finisca in un mese con dati).
- `lastBilledMonth`: l'ultimo mese dell'intera serie con `billedDays * 2 >= daysInMonth(month)`,
  `null` se nessuno; `endMonth = lastBilledMonth ?? toMonth`.
- `months` = i mesi della serie da `fromMonth` a `toMonth`; `yearOverYearMonths` = i 24 mesi da
  `shiftMonth(endMonth, -23)` a `endMonth`; `rolling = rolling12(yearOverYearMonths, endMonth)`.
- `isComparable` = `rolling.last12.monthsWithBills === 12 && rolling.previous12.monthsWithBills
  === 12`; con `false` i riquadri mostrano il totale e «—» al posto della variazione (es.: il primo
  anno di dati).

`getHouseDashboard`:

- `getHouse(db, userId, houseId)` → `NOT_FOUND` se manca (casa di un altro utente compresa); le
  forniture della casa con `listSupplies(db, userId, { houseId, includeArchived: true })`.
- `oldestMonth` della casa = il più vecchio fra gli `oldestMonth` delle sue forniture (archiviate
  comprese), calcolati come sopra; `fromMonth` e `seriesStart` si calcolano come sopra con
  l'`oldestMonth` della casa, e tutte le forniture si costruiscono con gli stessi `fromMonth` e
  `seriesStart`: così `houseMonths` ha un mese per ogni mese da `fromMonth` a `toMonth`.
- Per ogni fornitura: `months` (da `fromMonth` a `toMonth`), `lastBilledMonth` come sopra e
  `lastBilled` = il mese `lastBilledMonth` della serie intera (`null` con `lastBilledMonth`
  nullo).
- `houseMonths = buildHouseMonths(...)` sui `months` di tutte le forniture, archiviate comprese
  (sono spese vere); i riquadri usano `buildHouseMonths` sulla serie intera di ogni fornitura.
- `houseEndMonth` = il più vecchio fra i `lastBilledMonth` non nulli delle forniture **non
  archiviate**; `null` se nessuna ne ha uno → `rolling` e `averageMonthlyCents` `null` (i riquadri
  mostrano «—»).
- `rolling.last12` = somma di `totalCents` dei mesi della casa da `shiftMonth(houseEndMonth, -11)` a
  `houseEndMonth`; `rolling.previous12` = la stessa somma sui 12 mesi prima; `rolling.isComparable`
  = ognuno dei 24 mesi ha `billedDays > 0` in almeno una fornitura.
- `averageMonthlyCents` = `Math.round(rolling.last12 / n)`, con `n` = i mesi della finestra di
  `last12` in cui almeno una fornitura (archiviate comprese) ha `billedDays > 0`; `null` se `n` è 0.
- I totali sono al netto dell'energia ceduta (D-43): `totalCents` del motore la comprende.

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
  isReadingsConversionAssumed: boolean; // from SupplyMonth
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
  /** totalCents / 100: net of the credit for energy fed into the grid. */
  total: number;
}
export function toCostSeries(months: SupplyMonth[]): CostPoint[];
export function toHouseCostSeries(months: HouseMonth[]): CostPoint[];

export interface YearOverYearPoint {
  month: MonthKey;         // the month of the current year
  label: string;           // formatMonth(month), e.g. 'set 2026'
  current: number | null;
  previous: number | null;
}
export function toYearOverYearSeries(yearOverYearMonths: SupplyMonth[], endMonth: MonthKey, metric: 'consumption' | 'cost'): YearOverYearPoint[];

export function percentChange(current: number, previous: number): number | null; // null when previous is 0

export interface ReferenceLine {
  key: string;
  label: string;
  /** e.g. 'Fonte: ARERA' — printed under the chart. */
  source: string;
  /** €/unit (net of VAT) per month; null where the series has no value. */
  values: Record<MonthKey, number | null>;
}
```

Il tipo `ReferenceLine` vive qui (modulo puro): lo importano `unit-price-chart.tsx` e la 08
(`src/lib/references/reference-lines.ts`).

Regole: euro = `cents / 100`; €/unità = `micros / 1_000_000`; le quantità restano come sono; una
fascia senza consumo è `null` (Recharts non disegna il segmento); `feedIn` dei costi =
`costs.feed_in / 100` (≤ 0); `total` = `totalCents / 100` (al netto del credito: l'energia
ceduta, negativa, è compresa, D-43); `selfConsumption`/`feedIn` dei consumi solo con
`hasPhotovoltaic`; `isEstimated` e `isReadingsConversionAssumed` si copiano dal mese.
`toYearOverYearSeries` restituisce i 12 mesi che finiscono a `endMonth`, con `previous` dal mese
−12: con `metric 'consumption'` `current`/`previous` = `consumption` del mese (il solo fatturato,
D-25: `readingsConsumption` non entra); con `'cost'` = `totalCents / 100` se `billedDays > 0`,
altrimenti `null`; un mese assente dalla serie → `null`.

Assi, tooltip e tabelle «Vedi i dati» dei grafici formattano i valori dei punti con due funzioni
nuove di `src/lib/format.ts`, che ricevono già le unità di visualizzazione:
`formatEuroValue(euro: number): string` (lo stesso `Intl.NumberFormat` di `formatEuro`) e
`formatUnitPriceValue(euroPerUnit: number, unit: ConsumptionUnit): string` (4 decimali, come
`formatUnitPrice`); le quantità con `formatQuantity`. `formatEuro` e `formatUnitPrice` restano per
centesimi e micro-euro (riquadri e card).

### 4.3 Componenti — `src/components/charts/` (C-15)

- `recharts.ts`: `'use client'` e **unico** file che importa `recharts` (riesporta
  `ResponsiveContainer`, `BarChart`, `Bar`, `LineChart`, `Line`, `ComposedChart`, `XAxis`, `YAxis`,
  `CartesianGrid`, `Tooltip`, `Legend`, `Cell` e `ReferenceLine as RechartsReferenceLine`, così il
  componente non si scontra col tipo `ReferenceLine` di `series.ts`).
- `chart-frame.tsx`: `data-testid="chart-frame"`; titolo, sottotitolo con l'unità, il grafico
  (altezza 240 px su mobile, 320 px da 768 px), la legenda e
  `<details><summary>Vedi i dati</summary><table>…</table></details>` con una riga per mese;
  riceve `columns` e `rows` già formattati con `format.ts` (`formatQuantity`, `formatEuroValue`,
  `formatUnitPriceValue`).
- `kpi-tile.tsx` — `KpiTile({ label, value, change })`, `data-testid="kpi-tile"`: `value` già
  formattato (`formatEuro` o `formatQuantity`); `change?: number | null` è la variazione
  percentuale di `percentChange`, mostrata col segno e una cifra decimale («+10,0 %», «−4,5 %»);
  `null` → «—»; assente → nessuna riga di variazione.
- `consumption-chart.tsx` — `ConsumptionChart({ points, unit, hasPhotovoltaic })`: `ComposedChart`
  con `stackOffset="sign"` e barre impilate `F1`, `F2`, `F3`, `F23`, `single` (colori
  `--color-band-*`, `single` usa `--color-band-single`), poi `fromReadings` (stesso stack,
  riempimento a righe con un `<pattern>` SVG e bordo, tutti e due `--color-readings`),
  `selfConsumption` (stack, `--color-pv-self`), linea `feedIn` (`--color-pv-feed-in`); i mesi
  `isEstimated` hanno opacità 0,55 e un `<pattern>` tratteggiato via `Cell`; legenda con «stimato»
  e «da letture, non ancora fatturato» solo se presenti; tooltip con `formatQuantity`; se un punto
  ha `isReadingsConversionAssumed`, sotto il grafico la nota «Coefficiente C non noto: i m³ delle
  autoletture sono convertiti con C = 1.».
- `unit-price-chart.tsx` — `UnitPriceChart({ points, unit, references?: ReferenceLine[], note? })`:
  `LineChart` con «Materia prima (senza IVA)» (`--color-price-commodity`) e «Costo totale per
  unità (IVA inclusa)» (`--color-price-total`); tooltip e asse con `formatUnitPriceValue`;
  `references` (tipo da `src/lib/charts/series.ts`) disegnate tratteggiate (la 08 le passa; qui
  l'array è vuoto); `note` è il testo sotto il grafico (l'acqua lo usa per D-36).
- `costs-chart.tsx` — `CostsChart({ points, mode: 'supply' | 'flat' | 'house' })`: `BarChart` con
  `stackOffset="sign"`, barre impilate per categoria (`supply`: le sette categorie + `feedIn`
  negativa; `flat`: solo `total`; `house`: le sette + `flat` «Canoni e tributi» + `feedIn`),
  colori `--color-cat-*`: i segmenti negativi (energia ceduta, sconti in «Altre partite», oneri
  compensativi, ricalcoli che in un mese sommano sotto zero) si impilano sotto lo zero, quelli
  positivi sopra; tooltip con `formatEuroValue` su ogni segmento, la riga «Energia ceduta» quando
  `feedIn` < 0 e «Totale» = `total` (al netto del credito, D-43).
- `year-over-year-chart.tsx` — `YearOverYearChart({ consumption, cost, unit, totals })` con
  `consumption: YearOverYearPoint[] | null` (null per le utenze a canone), `cost:
  YearOverYearPoint[]`, `unit: ConsumptionUnit | null`, `totals: { consumption: { last12: number |
  null; previous12: number | null; isComparable: boolean } | null; cost: { last12Cents: number;
  previous12Cents: number; isComparable: boolean } }` (da `rolling` e `isComparable` di § 4.1):
  barre affiancate «quest'anno» (`--color-yoy-current`) / «anno prima» (`--color-yoy-previous`),
  tooltip con `formatQuantity` o `formatEuroValue`; sopra, i riquadri `KpiTile` «Ultimi 12 mesi» —
  consumo e spesa per le forniture a contatore, la sola spesa per quelle a canone — con `change` =
  `percentChange(last12, previous12)` se `isComparable` e i due valori non sono nulli, altrimenti
  `null` («—»). Il commutatore
  «Consumo / Spesa» (solo contatori, default «Consumo») sceglie fra `consumption` e `cost` nello
  stato del componente; la pagina chiama `toYearOverYearSeries` due volte (`'consumption'` e
  `'cost'`).

### 4.4 Pagine

- `/forniture/[id]/page.tsx`: legge `?periodo` (`12` · `24` · `tutto`, default `24`; un valore
  diverso → `24`), `today = romeToday(Date.now())`, chiama `getSupplyDashboard`; mostra il
  selettore del periodo (link con `aria-current`), poi i grafici di A2 e sotto le sezioni della 03
  (bollette e letture). I punti li prepara la pagina con le funzioni di `series.ts`: per l'anno su
  anno `toYearOverYearSeries(yearOverYearMonths, endMonth, 'consumption')` (solo contatori) e
  `toYearOverYearSeries(yearOverYearMonths, endMonth, 'cost')`, con `endMonth = lastBilledMonth ??
  monthKeyOf(today)`. Una fornitura senza bollette mostra al posto dei grafici lo stato vuoto
  «Ancora nessuna bolletta: aggiungi la prima» con il link alla nuova bolletta. Un id altrui o
  inesistente → `NOT_FOUND` → `notFound()` (03).
- `/page.tsx` (Casa): senza case resta lo stato vuoto della 03 e `getHouseDashboard` non si chiama;
  senza `?casa=` la casa è la prima per nome (03); `?casa=` di una casa altrui o inesistente →
  `getHouseDashboard` lancia `NOT_FOUND` → `notFound()`. La pagina mostra: selettore della casa
  (03), selettore del periodo (i link del periodo conservano `?casa=`, quelli della casa
  conservano `?periodo=`), i due `KpiTile` «Spesa degli ultimi 12 mesi» (`rolling.last12` con
  `formatEuro`, `change` = `percentChange(last12, previous12)` se `rolling.isComparable`,
  altrimenti `null`) e «Spesa media mensile» (`averageMonthlyCents` con `formatEuro`, senza
  `change`), con sopra la riga «Ultimi 12 mesi fatturati: <mese iniziale> – <mese finale>»
  (`formatMonth`; con `houseEndMonth` nullo i due riquadri mostrano «—» e la riga non c'è); poi
  `CostsChart mode="house"` (al posto del grafico, quando nessuna fornitura della casa, archiviate
  comprese, ha un `lastBilledMonth`, lo stato vuoto «Ancora nessuna bolletta in questa casa»); poi
  **una sola card per fornitura non archiviata**: la card della 03 (`data-testid="supply-card"`, ultima bolletta,
  «stimata», pulsanti) con in più, da `lastBilled`, il consumo (`formatQuantity`) e il costo
  unitario totale (`totalUnitPriceMicros` con `formatUnitPrice`, «—» se nullo) per le forniture a
  contatore, la spesa del mese (`totalCents` con `formatEuro`) per quelle a canone, e il mese
  (`formatMonth`); con `lastBilled` nullo la card mostra «Nessun mese fatturato» al posto di
  questi dati. Nessun secondo elenco sotto le card (D-52).

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che per i grafici le pagine chiamano `dashboard.ts`
  per i dati e le funzioni pure di `src/lib/charts/series.ts` per i punti (le sezioni della 03
  restano coi loro servizi); i componenti dei grafici non conoscono il DB né il motore, ricevono
  punti già pronti. `src/lib` non importa da `src/components`: per questo `ReferenceLine` sta in
  `series.ts`.
- **AGENTS.md § 2.4 Isolation** — qui vuol dire che `getSupplyDashboard` e `getHouseDashboard`
  rileggono fornitura e casa con `userId` e un id altrui dà `NOT_FOUND` (pagina 404).
- **AGENTS.md § 2.5 Money and dates** — divisioni per 100 e 10⁶ solo in `series.ts` e in
  `format.ts`; i mesi restano `MonthKey`.
- **AGENTS.md § 7 UI** — Recharts solo attraverso `recharts.ts`; colori solo da token (via
  `var(--…)` nelle prop `fill`/`stroke`: `--color-cat-*`, `--color-band-*`, `--color-readings`,
  `--color-pv-self`, `--color-pv-feed-in`, `--color-price-commodity`, `--color-price-total`,
  `--color-yoy-current`, `--color-yoy-previous`); i grafici sono componenti client caricati dentro
  pagine server; `data-testid` su `chart-frame`, `kpi-tile` e `supply-card`.
- Con lo `stackOffset` di default di Recharts un valore negativo nello stesso stack parte dalla
  cima della pila e copre i segmenti positivi: i grafici impilati usano `stackOffset="sign"`.
- I tooltip ricevono euro e €/unità, non centesimi e micro-euro: `formatEuro(47.3)` darebbe
  «0,47 €»; si usano `formatEuroValue` e `formatUnitPriceValue`.
- Recharts 3 + React 19: serve `react-is@19.3.1` installato a fianco (peer dipendenza).
- `ResponsiveContainer` dentro un genitore senza altezza esplicita non disegna nulla: `chart-frame`
  fissa l'altezza.
- Un'ora legale nel mezzo non tocca nulla: i mesi vengono dal motore, che lavora su date.

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `series.test.ts` — `toConsumptionSeries`: un mese 200 kWh F1/F2/F3 80/60/60 → punti 80/60/60, `single` null; un mese con `readingsConsumption 50` → `fromReadings 50`; fotovoltaico → `selfConsumption` e `feedIn`; senza fotovoltaico → entrambi null; un mese con `isEstimated: true` → il punto ha `isEstimated: true`, uno ricalcolato (`isEstimated: false`) → `false`; un mese con `isReadingsConversionAssumed: true` → il punto lo riporta. | Fissare `isEstimated: false` nei punti → il caso stimato fallisce; non copiare `isReadingsConversionAssumed` → il caso del gas fallisce. |
| Unit | `series.test.ts` — `toUnitPriceSeries`: 100000 µ€ → 0,1. `toCostSeries`: un mese con `commodity 2000`, `feed_in -500`, `totalCents 1500` → `feedIn -5`, `total 15`. | Dividere per 1000 invece che per 10⁶ → 100 invece di 0,1; `total` come somma delle categorie senza `feed_in` → 20 invece di 15. |
| Unit | `series.test.ts` — `toYearOverYearSeries`: 24 mesi → 12 punti con `previous` = valore di 12 mesi prima e `label` = `formatMonth(month)`; con `'cost'` un mese senza bollette (`billedDays 0`, `totalCents 0`) → `current: null`, non 0; con `'consumption'` un mese con `consumption null` e `readingsConsumption 50` → `current: null`; un mese assente dalla serie → `null`. `percentChange(110, 100) === 10`, `(5, 0) === null`. | Restituire `totalCents / 100` anche con `billedDays 0` → 0 invece di null. |
| Unit | `format.test.ts`: `formatEuroValue(47.3)` contiene `47,30` ed `€`; `formatUnitPriceValue(0.1, 'kWh') === '0,1000 €/kWh'`. | Usare `formatEuro` sul valore in euro → `0,47 €`. |
| Integrazione | `dashboard.test.ts` — `getSupplyDashboard`: due utenti; una luce propria con 14 bollette mensili fino al mese scorso; con `range '12'` → 12 mesi in `months`, 24 in `yearOverYearMonths` con l'ultimo = il mese scorso, `lastBilledMonth` = il mese scorso, `rolling.previous12` identico con `range '12'` e `range '24'`, `isComparable` falso (i 12 mesi prima hanno meno di 12 mesi con bollette); fornitura altrui → `NOT_FOUND`; `all` parte dal mese della lettura più vecchia. | `rolling12` calcolato su `months` → `previous12` diverso fra `'12'` e `'24'`; `fromMonth` con `-12` per `'12'` → 13 mesi; ignorare `monthsWithBills` → `isComparable` vero. |
| Integrazione | `dashboard.test.ts` — `getHouseDashboard`: somma luce e internet nello stesso mese e mette l'internet in `flat`; una casa con una luce mensile da 1000 cent fatturata da 9 mesi fa al mese scorso e un'acqua trimestrale da 3000 cent a trimestre fatturata da 11 mesi fa a 3 mesi fa (tre bollette) → `houseEndMonth` = 3 mesi fa, `rolling.last12` = 16000 (7 mesi di luce + 9000 di acqua), `averageMonthlyCents` = 1778 (16000 ÷ 9 mesi fatturati), `rolling.isComparable` falso; una casa senza bollette → `houseEndMonth`, `rolling` e `averageMonthlyCents` null; la casa propria passa e quella di un secondo utente creato con `createTestUser` → `NOT_FOUND`. | `houseEndMonth` = il più recente fra gli ultimi mesi fatturati → `last12` 18000; dividere per 12 → 1333; togliere `userId` da `getHouse` → la casa di B si legge. |
| E2E | `dashboard.spec.ts` (seed A, sola lettura): `/forniture/<luce>` → quattro `chart-frame` con titolo; la legenda contiene «da letture, non ancora fatturato» (autoletture seed); con `?periodo=12` ogni `chart-frame` contiene un `<details>` con `<table>` di 12 righe; `/forniture/<acqua>` → il testo di D-36; `/forniture/<internet>` → due `chart-frame` e un `kpi-tile`; `/` → due `kpi-tile` e quattro `supply-card`. | Ignorare `?periodo` → 24 righe; togliere la `<table>` da `chart-frame` → l'asserzione sulle righe fallisce. |
| E2E | `a11y.spec.ts` esteso a `/` e `/forniture/[id]` (luce, acqua, internet di seed A; mobile e desktop, tema chiaro e scuro) → 0 violazioni. | Il `<summary>` di `chart-frame` senza testo → violazione `summary-name`. |
| E2E | `isolamento.spec.ts` (seed A e B, sola lettura): seed A apre `/forniture/<id di B>` e `/?casa=<id casa di B>` → 404; seed B le apre. | Togliere `userId` da `getHouse` → A vede la casa di B. |

`pnpm add recharts@3.10.1 react-is@19.3.1`.

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: tutta la suite precedente verde.
- **C — Comportamento nuovo**: suite verde; uno script usa e getta (su `local.db` con il seed)
  stampa per la «Luce» di seed A il mese `lastBilledMonth` di `getSupplyDashboard` e `rolling`, e
  per «Casa Fenicottero» `houseEndMonth`, `rolling`, `averageMonthlyCents`, i mesi con giorni
  fatturati della finestra e le quattro somme di `totalCents` delle forniture sui 12 mesi che
  finiscono a `houseEndMonth`. Esito atteso dichiarato prima: `lastBilledMonth` = il mese scorso;
  200 kWh, `F1 80 · F2 60 · F3 60`, materia 0,1000 €/kWh, totale (4730 cent ÷ 200) 0,2365 €/kWh;
  «Ultimi 12 mesi» della Luce 567,60 € (12 × 47,30 €) con variazione «—» (i 12 mesi prima hanno
  meno di 12 mesi con bollette); `houseEndMonth` = il più vecchio fra gli ultimi mesi fatturati
  delle quattro forniture; `rolling.last12` della casa = la somma delle quattro somme;
  `averageMonthlyCents` = `rolling.last12` ÷ i mesi con giorni fatturati stampati, arrotondato.
- **D — Sotto la UI**: lo script prova `getSupplyDashboard` di seed A con l'id di una fornitura di
  seed B e `getHouseDashboard` di seed A con l'id della casa di seed B → `NOT_FOUND` tutti e due.
- **F — Giro guidato** (al via dell'owner, sessione di seed A, una pagina per messaggio): (1) `/` —
  la casa si capisce in cinque secondi, e la riga «Ultimi 12 mesi fatturati» dice fin dove
  arrivano i riquadri? (2) `/forniture/<luce>` — consumi per fascia e mesi stimati
  si distinguono? (3) stesso URL — il costo unitario: le due linee si leggono senza legenda? (4)
  `/forniture/<gas>?periodo=tutto` — l'inverno salta all'occhio? (5) mobile 390 px — i grafici
  restano leggibili? Che cosa NON copre: i riferimenti di mercato (08), le bollette vere
  dell'owner (07).
- **G — Ripristino**: lo script si cancella.

## 8. Messa in esercizio

- Nessuna migrazione, nessuna variabile.
- Misura di chiusura: suite verde e collaudo annotato; la 05 rifà in produzione la dashboard
  `/forniture/<id>` con una bolletta inventata (100 kWh, 0,1100 €/kWh).

## 9. Documentazione

- `CLAUDE.md`: Latest; § Key Features (la riga della dashboard, con i quattro grafici);
  § Architecture Snapshot (`series.ts` e `components/charts`); § Not yet present: la riga dei
  grafici diventa «Daily charts, zoom, comparisons between supplies of different houses, forecasts
  of the next bill.».
- `doc/guide/app.md`: sezione «Dashboard e grafici» (servizio, serie, componenti, `KpiTile`, card
  della Casa estesa, regole dei colori, di `stackOffset="sign"`, dei formati in euro
  `formatEuroValue`/`formatUnitPriceValue` e della tabella alternativa) — la guida resta sotto le
  500 righe.
- `doc/guide/calcoli.md`: un paragrafo su «ultimo mese fatturato», sui 24 mesi che finiscono lì
  (anno su anno e riquadri, confronto valido solo con 12 mesi di bollette per parte), sulla
  finestra e sulla media della Casa (D-53, D-54) e sui totali al netto dell'energia ceduta (D-43).
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
- Controlla con un grep che i contratti C-3, C-4, C-5, C-6…C-13 e C-21 esistano con i nomi e le
  firme dell'indice
- Prima di scrivere il primo grafico carica la skill dataviz

Prima di tutto: `git pull` su `main`; la 03 è ritirata (2026-10-24, stato in § 5 dell'indice e in
CLAUDE.md → Latest), quindi non c'è uno stato da scrivere per lei.

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
