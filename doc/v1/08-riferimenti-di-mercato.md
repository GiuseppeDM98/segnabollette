# 08 — Riferimenti di mercato

> **Stato**: scritta 2026-10-24; riletta in modo adversariale il 2026-10-24: 22 rilievi, 3
> decisioni (D-41, D-44, D-58). Pronta per l'implementazione.
> **Branch**: `feature/08-market-references` da `main` aggiornato dopo il merge della 07.
> **Dipende da**: 07 (in esercizio; per l'ordine, non per codice).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-14, D-26, D-32…D-36, D-41, D-44, D-58;
> scelte T-1 (fflate, SheetJS), T-25, T-26, T-31; contratti C-2 (`referencePrices`), C-12
> (`reference-prices.ts`), C-19 — li crea; usa C-1 (`EnvSchema`), C-4 (`createTestDb`), C-7, C-8
> (`microsFromEuro`, `formatUnitPriceValue`), C-11 (`SupplyMonth.hasCommodityBands`), C-12
> (aggiunge `getLatestCalorificValueGj` a `bills.ts`), C-13 (estende `SupplyDashboard`), C-15
> (`UnitPriceChart`; `ReferenceLine` in `src/lib/charts/series.ts`), C-22 (`loadProductionTarget`,
> 05); i token `--color-reference-wholesale` e `--color-reference-arera` della 03.

## 1. Il problema oggi (prove)

Fonti lette il 2026-10-24 (file scaricati in una cartella usa e getta della sessione di
pianificazione, mai nel repo).

1. **Il tema** chiede il confronto «contro i prezzi di riferimento del mercato (PUN per la luce,
   PSV per il gas, i prezzi ARERA del servizio di tutela/vulnerabili)». Dopo la 04 il grafico del
   costo unitario ha già il punto d'aggancio (`UnitPriceChart` con `references?: ReferenceLine[]`,
   oggi vuoto).
2. **PUN Index GME** (dal 1° gennaio 2025 al posto del PUN; ARERA 304/2024/R/eel). Pagina «Dati
   storici» MGP:
   `https://www.mercatoelettrico.org/it-it/Home/Esiti/Elettricita/MGP/Statistiche/DatiStorici`; un
   zip per anno (`Anno2026.zip`, ~23 MB) con `Anno 2026_MM_60.xlsx` (orario; il `_MM_` cambia a ogni
   aggiornamento) e `…_15.xlsx` (quarti d'ora). Foglio `Prezzi-Prices`, riga 1 d'intestazione:
   `Data/Date (YYYYMMDD)`, `Ora /Hour`, `PUN INDEX GME`, poi le zone. Ore 1–24, **25** il giorno del
   ritorno all'ora solare, 23 righe il giorno del passaggio all'ora legale. €/MWh. Media mensile e
   fasce **si calcolano**: l'agente di ricerca ha riprodotto esattamente (valori e ore) i PDF
   «Prezzo medio per fasce» di gennaio, marzo, agosto e settembre 2026 con il calendario di § 4.3.
   **Condizioni d'uso GME** (`https://www.mercatoelettrico.org/it-it/Home/CondizioniUtilizzo/`):
   § 5 licenza personale «per uso meramente informativo e di carattere privato», attribuzione
   «Fonte: Gestore dei Mercati Energetici S.p.A.»; § 6 vietata la pubblicazione; **§ 6 bis vietata
   l'estrazione automatica** (bot, scraper) «per qualsiasi finalità». → D-32: zip scaricato a
   mano dall'owner, valori nel database del deploy, mai nel repo.
3. **CMEM** (ARERA; la media mensile del PSV day-ahead per i clienti vulnerabili gas):
   `https://www.arera.it/area-operatori/prezzi-e-tariffe/valore-cmemm-vulnerabili`, HTML statico;
   una `<table class="table-striped">` per anno (2026, 2025, 2024), prima riga
   `<td><strong>2026</strong></td><td><strong>Euro/MWh</strong></td><td><strong>Euro/GJ</strong></td><td><strong>Euro/Smc*</strong></td>`,
   poi una riga per mese dal più recente (`<td>settembre</td>` e tre celle con il numero dentro uno
   `<span>`, virgola decimale, a volte con spazi). Pubblicato entro i primi 2 giorni lavorativi del
   mese dopo. «*… potere calorifico superiore di riferimento pari a 0,038520 GJ/Smc»; €/GJ = €/MWh ÷
   3,6.
4. **ARERA vulnerabili luce**: `https://www.arera.it/area-operatori/prezzi-e-tariffe` linka
   `/fileadmin//area_operatori/prezzi_e_tariffe/E2026-smt.xlsx` (il nome cambia ogni anno; quelli
   degli anni passati rispondono 404 con una pagina HTML). Un foglio per trimestre (`ott-dic 2026`,
   `lug-set 2026`, … fino a `lug-set 2024`); nel foglio, il primo blocco è «Abitazioni di
   residenza anagrafica»: una riga d'intestazione con `Materia energia` in una colonna (C), due righe
   sotto le sottointestazioni `fascia unica`, `fascia F1`, `fascia F23` in C, C+1, C+2, e la riga
   `Quota energia (euro/kWh)` subito dopo con i valori (Q4 2026: 0,27644 · 0,27379 · 0,27781 €/kWh =
   PE + PD + PPE). Trimestrale, fissato in anticipo; l'etichetta del secondo blocco del foglio di Q4
   è sbagliata («1 luglio – 30 settembre»): si usa il **nome del foglio**.
5. **ARERA vulnerabili gas**: `G2026_stv.xlsx`, un foglio per mese (`set 2026`, `ago 2026`, …);
   cella B15 = coefficiente P (0,03852 GJ/Smc); sei ambiti geografici, ciascuno con una riga
   `Quota energia (euro/Smc)` seguita dalla riga `consumo Smc/anno: da 0 a 120` che in colonna F
   (intestazione «Vendita di gas naturale») porta CMEM + CCR + QVD (settembre 2026: 0,882638 €/Smc);
   in colonna C lo stesso CMEMm dell'HTML.
6. **Licenza ARERA** (`https://www.arera.it/termini-e-condizioni-uso-del-sito`): riuso con
   indicazione della fonte, **CC BY-SA 4.0** → i file derivati in `data/riferimenti/` sono CC BY-SA
   4.0, non AGPL, con «Fonte: ARERA».
7. **Acqua**: nessuna serie nazionale usabile (tariffe per ATO in delibere e PDF) → D-36.
8. **4 ottobre**: festa nazionale dal 2026 (L. 151/2025); nel 2026 è domenica, nel 2027 lunedì; non
   è verificato se il calendario delle fasce ARERA lo conti → T-26.

## 2. Obiettivo e criteri di accettazione

| # | Criterio | Prova |
|---|---|---|
| A1 | `pnpm riferimenti:update` scarica dalla pagina ARERA i file dell'anno, legge CMEM (HTML), «Materia energia» dei vulnerabili luce e «Vendita di gas naturale» dei vulnerabili gas, controlla coerenza e intervalli, e **fonde** i mesi nuovi nei JSON di `data/riferimenti/` (i mesi già presenti si sovrascrivono: le revisioni passano), con scrittura atomica. | Unit sui parser con fixture sintetiche; collaudo § 7 C (esecuzione reale). |
| A2 | Lo script fallisce con un messaggio chiaro se: la pagina non linka i file attesi; un file atteso è HTML (404 di ARERA) invece di un xlsx; un foglio o un'intestazione mancano; un workbook non ha nessun foglio riconosciuto; un foglio del gas non ha nessun ambito; due ambiti del gas hanno valori diversi; CMEM dell'HTML e dell'xlsx differiscono oltre 1e-6; un valore esce dagli intervalli. Ogni ramo sta in una funzione pura di `scripts/riferimenti/parse-arera.ts`. | Unit (un caso per ramo, `parse-arera.test.ts`). |
| A3 | `pnpm riferimenti:pun -- <AnnoYYYY.zip> [--prod]` legge lo zip scaricato a mano, calcola per ogni mese completo media e F1/F2/F3/F23 con le ore, e li scrive in `reference_prices` di `local.db` (o di produzione con `--prod`; senza `--prod` rifiuta un URL che non comincia con `file:`); un mese con meno ore delle attese non si scrive; stampa la tabella dei mesi. | Unit sul calcolo (`pun.test.ts`) e sulla lettura dello zip (`parse-pun.test.ts`, zip sintetico); collaudo con lo zip vero (fuori dal repo). |
| A4 | Il PUN non compare mai in un file del repo (tracciato o non ignorato): nessun `data/riferimenti/pun*`, nessuna fixture con valori GME. | `scripts/references-no-pun.test.ts`. |
| A5 | Il grafico del costo unitario di luce e gas mostra le linee di riferimento tratteggiate con i loro token di colore (§ 4.6), una colonna per linea nella tabella «Vedi i dati», la didascalia e le fonti; l'acqua resta senza confronto (testo della 04). | Unit `reference-lines.test.ts` e `series.test.ts`; E2E. |
| A6 | Il confronto è mensile (D-35, D-44): trimestrali ARERA su tutti e tre i mesi; un mese della luce senza voci `commodity` a fasce (`hasCommodityBands` falso) contro PUN media mensile e ARERA fascia unica, anche se le letture danno F1/F2/F3; con voci a fasce, PUN e ARERA pesati sulle bande dei consumi del mese; gas a €/GJ × PCS della bolletta confermata più recente che lo riporta (0,03852 se nessuna). | Unit; integrazione per il PCS. |

## 3. Decisioni

- **D-14** (file committati, script lanciato dall'owner), **D-26** (materia senza IVA), **D-32**
  (PUN nel DB, zip a mano), **D-33** (vulnerabili, materia energia), **D-34** (CMEM + vendita gas
  vulnerabili), **D-35** (allineamento), **D-36** (acqua).
- **D-41** (commit unico e PR prima del merge; dopo il merge, nella stessa sessione, gli import
  `--prod` e la misura di chiusura in produzione; l'esito in `SESSION_NOTES.md`, che resta, per il
  commit della 09).
- **D-44** (D-35 alla lettera: un mese della luce senza nessuna voce `commodity` a fasce si
  confronta con il PUN media mensile e con ARERA fascia unica, anche quando le letture danno
  F1/F2/F3; il dato è `SupplyMonth.hasCommodityBands` della 02).
- **D-58** (il PUN importato è visibile a tutti gli utenti del deploy; SETUP.md avverte chi apre le
  iscrizioni a terzi che deve valutare le condizioni d'uso del GME).
- **T-25** (formati e licenza), **T-26** (festività senza il 4 ottobre), **T-31** (solo sulla linea
  della materia prima, didascalia fissa).
- Adottate qui, ribaltabili:
  (a) i dati ARERA si conservano dal 2024 in avanti (quanto offrono i file e la pagina CMEM di
  oggi); la storia cresce perché lo script fonde i mesi;
  (b) per il gas si usa, per tutti i mesi del grafico, il PCS **della bolletta `confirmed` più
  recente (per `period_end`) che lo riporta** (non quello di ciascun mese; stessa regola del
  coefficiente C nel motore); 0,03852 GJ/Smc se nessuna lo riporta;
  (c) i valori si salvano in **micro-euro interi** (µ€/kWh per la luce, µ€/GJ per il gas), come i
  prezzi delle voci;
  (d) luce, mese con `hasCommodityBands` falso (offerta monoraria: nessuna voce `commodity` contata
  nel consumo ha fascia F1/F2/F3/F23, anche se le letture della bolletta danno le quote F1/F2/F3)
  → PUN media mensile (`single`) e ARERA `fascia unica` (D-44);
  (e) luce, mese con `hasCommodityBands` vero → PUN e ARERA pesati sulle bande di
  `consumptionByBand` con quantità > 0: il PUN banda per banda (`single`, F1, F2, F3, F23), ARERA
  con `single` → fascia unica, F1 → F1, F2, F3 e F23 → F23 (D-44);
  (f) senza consumo in un mese, nessun punto di riferimento in quel mese (si confronta solo dove
  c'è una materia prima da confrontare).

## 4. La soluzione

### 4.1 Dipendenze

```bash
pnpm add -D fflate@0.8.3 https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

(SheetJS dal tarball ufficiale: il registro npm è fermo alla 0.18.5 —
https://docs.sheetjs.com/docs/getting-started/installation/nodejs, letta 2026-10-24.) Solo gli
script le importano: l'app legge JSON e DB.

### 4.2 Dati committati — `data/riferimenti/`

- `README.md`: «Data in this folder is derived from ARERA publications and licensed CC BY-SA 4.0
  (https://creativecommons.org/licenses/by-sa/4.0/). Source: ARERA — Autorità di Regolazione per
  Energia Reti e Ambiente. Updated with `pnpm riferimenti:update`. The PUN Index GME is never stored
  here: see SETUP.md.»
- `arera-luce-vulnerabili.json`:

```json
{
  "source": "ARERA — condizioni economiche per i clienti vulnerabili (energia elettrica), Materia energia",
  "url": "https://www.arera.it/area-operatori/prezzi-e-tariffe",
  "license": "CC BY-SA 4.0",
  "attribution": "Fonte: ARERA",
  "fetchedAt": "2026-10-24",
  "unit": "microEUR/kWh",
  "months": { "2026-10": { "single": 276440, "F1": 273790, "F23": 277810 } }
}
```

- `arera-gas-cmem.json`: stessa testata, `"unit": "microEUR/GJ"`, `months: { "2026-09": { "microsPerGj": 21889472, "eurPerMwh": 78.8021 } }`.
- `arera-gas-vulnerabili.json`: stessa testata, «Vendita di gas naturale (CMEM + CCR + QVD)»,
  `"unit": "microEUR/GJ"`, `months: { "2026-09": { "microsPerGj": 22913759 } }`
  (= round(0,882638 ÷ 0,038520 × 10⁶)).

Gli esempi sopra sono i valori reali pubblicati da ARERA (non dati dell'owner); il primo
`pnpm riferimenti:update` della sessione scrive i file veri.

### 4.3 Calendario delle fasce — `src/lib/references/fasce.ts` (C-19)

```ts
/**
 * ARERA time bands (delibera 181/2006) on GME hour numbering: hour h covers (h-1, h], so hour 9 is
 * 08:00-09:00. F1: Monday-Friday hours 9-19. F2: Monday-Friday hours 8 and 20-23, Saturday hours
 * 8-23. F3: Monday-Saturday hours 1-7 and 24, Sundays and national holidays all day. Hour 25 (the
 * day clocks go back) counts as 24.
 *
 * Verified 2026-10-24: these rules reproduce the GME monthly "prezzo medio per fasce" PDFs
 * (January, March, August, September 2026), values and hour counts.
 * Not included: 4 October (a national holiday from 2026): whether ARERA's band calendar counts it is
 * unverified; check against the October 2027 GME PDF.
 */
import { addDays, parseIsoDate } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';

export type Fascia = 'F1' | 'F2' | 'F3';

const FIXED_HOLIDAYS = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isNationalHoliday(date: IsoDate): boolean {
  if (FIXED_HOLIDAYS.includes(date.slice(5))) return true;
  return date === addDays(easterSunday(Number(date.slice(0, 4))), 1);
}

export function fasciaOfHour(date: IsoDate, hour: number): Fascia {
  const weekday = new Date(parseIsoDate(date)).getUTCDay(); // 0 = Sunday
  const h = Math.min(hour, 24);
  if (weekday === 0 || isNationalHoliday(date)) return 'F3';
  if (h <= 7 || h === 24) return 'F3';
  if (weekday === 6) return 'F2';
  return h >= 9 && h <= 19 ? 'F1' : 'F2';
}
```

### 4.4 PUN — `src/lib/references/pun.ts` e `scripts/import-pun.ts`

```ts
// src/lib/references/pun.ts
export interface HourlyPrice {
  date: IsoDate;
  hour: number;
  eurPerMwh: number;
}

export type PunBand = 'single' | 'F1' | 'F2' | 'F3' | 'F23';

export interface PunMonthly {
  month: MonthKey;
  band: PunBand;
  /** micro-euro per kWh: €/MWh × 1000 */
  valueMicros: number;
  hours: number;
}

/** Hour-weighted monthly means: the whole month, each band, and F2 and F3 together. */
export function computePunMonthly(prices: readonly HourlyPrice[]): PunMonthly[];
```

Regole: si raggruppa per `monthKeyOf(date)`; ogni ora conta una volta (media semplice, le ore
hanno lo stesso peso); `single` = tutte le ore del mese; `F23` = le ore F2 e F3 insieme;
`valueMicros = Math.round(media €/MWh × 1000)`; risultato ordinato per mese e banda nell'ordine
`single, F1, F2, F3, F23`.

Funzioni pure (testate senza rete e senza file veri) in `scripts/riferimenti/parse-pun.ts`:

```ts
/** Reads the hourly PUN Index GME prices from the GME yearly zip. */
export function parsePunZip(zip: Uint8Array): HourlyPrice[];

/** Hours a day has on the Italian clock: 23 on the last Sunday of March, 25 on the last Sunday of October, otherwise 24. */
export function expectedHoursOfDay(date: IsoDate): number;

/** Keeps the months that have every expected hour; throws on a repeated (date, hour) or on a month with more rows than expected hours. */
export function splitCompleteMonths(prices: readonly HourlyPrice[]): { complete: HourlyPrice[]; incompleteMonths: MonthKey[] };
```

- `parsePunZip`: `unzipSync` di fflate con `filter` sui soli nomi che finiscono con `_60.xlsx`
  (zero o più di uno → errore che elenca i nomi); SheetJS `read` → foglio `Prezzi-Prices`
  (mancante → errore); riga 1: colonna A comincia con `Data`, colonna C è `PUN INDEX GME`
  (altrimenti errore con le intestazioni lette); righe successive: data `YYYYMMDD` (numero o testo)
  → `IsoDate`, ora intera 1–25, prezzo numero in (0, 5000) (fuori → errore con la riga).
- `splitCompleteMonths`: le ore attese di un mese sono la somma di `expectedHoursOfDay` sui suoi
  giorni; una coppia (data, ora) ripetuta → errore che nomina la data e l'ora; un mese con più
  righe delle ore attese → errore che nomina il mese; un mese con meno righe (l'ultimo dello zip
  dell'anno in corso, o un mese con un giorno mancante) va in `incompleteMonths` e le sue righe non
  entrano in `complete`.

`scripts/import-pun.ts` (`"riferimenti:pun": "tsx --env-file-if-exists=.env.local scripts/import-pun.ts"`):
1. argomenti da `process.argv.slice(2)` scartando un `--` letterale: `--prod` ovunque compaia;
   esattamente un altro argomento, il percorso dello zip (zero o più di uno → errore «uso: pnpm
   riferimenti:pun -- <AnnoYYYY.zip> [--prod]»);
2. con `--prod` usa `loadProductionTarget()` di `scripts/production-target.ts` (05, C-22) e stampa
   l'host del database; altrimenti `EnvSchema` sulle variabili di `.env.local` e rifiuta di girare
   se `TURSO_DATABASE_URL` non comincia con `file:` («per la produzione usa --prod»); mai variabili
   esportate nella shell;
3. `parsePunZip` sui byte del file;
4. `splitCompleteMonths`;
5. `computePunMonthly(complete)`;
6. `upsertReferencePricesQuery` in un `db.batch` (serie `pun`, fonte `GME`, `importedAt = Date.now()`);
7. stampa una riga per mese scritto nella forma `2026-09  media 100,00  F1 100,00 (242 h)  F2 100,00 (174 h)  F3 100,00 (304 h)  F23 100,00 €/MWh` (qui con numeri inventati: i valori GME non si trascrivono nel repo) e una riga `2026-10  incompleto, non importato` per ogni mese di `incompleteMonths`.

### 4.5 Tabella `reference_prices` (C-2) e repository (C-12)

```ts
export const referencePrices = sqliteTable('reference_prices', {
  series: text('series').$type<'pun'>().notNull(),
  month: text('month').$type<MonthKey>().notNull(),
  band: text('band').$type<PunBand>().notNull(),
  valueMicros: integer('value_micros').notNull(),
  hours: integer('hours').notNull(),
  source: text('source').notNull(),
  importedAt: integer('imported_at').notNull(),
}, (t) => [primaryKey({ columns: [t.series, t.month, t.band] })]);
```

Migrazione `drizzle/0003_*.sql`. È l'unica tabella **senza `user_id`** (dato di mercato, non
dell'utente): `src/lib/db/repositories/reference-prices.ts` — `upsertReferencePricesQuery(db,
rows)` e `listReferencePrices(db, series)` — è l'eccezione già dichiarata in `scope.test.ts` (01).
`deleteAllUserData` non la tocca.

`upsertReferencePricesQuery(db, rows)` è un solo insert; ogni riga in conflitto prende i suoi
valori nuovi (`excluded.*`), mai quelli di una riga fissa:

```ts
db.insert(referencePrices)
  .values(rows)
  .onConflictDoUpdate({
    target: [referencePrices.series, referencePrices.month, referencePrices.band],
    set: {
      valueMicros: sql`excluded.value_micros`,
      hours: sql`excluded.hours`,
      source: sql`excluded.source`,
      importedAt: sql`excluded.imported_at`,
    },
  });
```

### 4.6 Lettura e confronto — `src/lib/references/` (C-19)

```ts
// series.ts
export interface ReferenceSeries {
  pun: Record<MonthKey, Partial<Record<PunBand, number>>>;          // µ€/kWh
  areraLuce: Record<MonthKey, { single: number; F1: number; F23: number }>; // µ€/kWh
  cmem: Record<MonthKey, number>;                                    // µ€/GJ
  areraGasSale: Record<MonthKey, number>;                            // µ€/GJ
}

/** Committed ARERA files (static JSON imports) plus the PUN rows of this deployment's database. */
export async function loadReferenceSeries(db: Db): Promise<ReferenceSeries>;
```

```ts
// reference-lines.ts
export const STANDARD_CALORIFIC_VALUE_GJ = 0.03852;

export function referenceLinesFor(args: {
  kind: SupplyKind;
  months: readonly SupplyMonth[];
  series: ReferenceSeries;
  /** GJ/Smc of the most recent confirmed gas bill that states it, or null. */
  calorificValueGj: number | null;
}): ReferenceLine[];
```

`ReferenceLine` è il tipo della 04 in `src/lib/charts/series.ts` (`import type`); i suoi `values`
sono €/unità per contratto, quindi `reference-lines.ts` converte da µ€ (÷ 10⁶): è il terzo e ultimo
posto, dopo `format.ts` e `series.ts`, che converte in unità di visualizzazione (§ 5).

- Luce → due `ReferenceLine` (valori in €/kWh): `pun` «PUN Index GME (all'ingrosso)», `source:
  'Fonte: Gestore dei Mercati Energetici S.p.A. (dati importati per uso privato)'`, e `areraLuce`
  «ARERA vulnerabili — materia energia», `source: 'Fonte: ARERA (CC BY-SA 4.0)'`. Per ogni mese con
  `consumption > 0`:
  - `hasCommodityBands` falso (offerta monoraria, D-44) → `pun` = il PUN `single` del mese e
    `areraLuce` = la `single` (fascia unica) ARERA del mese, qualunque cosa dica
    `consumptionByBand` (le quote F1/F2/F3 ricavate dalle letture non pesano);
  - `hasCommodityBands` vero → pesano solo le bande di `consumptionByBand` con quantità > 0;
    valore = Σ quantità × prezzo della banda ÷ Σ quantità; per `pun` ogni banda prende la banda
    omonima del PUN (`single` → `single`, `F1` → `F1`, `F2` → `F2`, `F3` → `F3`, `F23` → `F23`),
    per `areraLuce` `single` → `single`, `F1` → `F1`, `F2`, `F3` e `F23` → `F23`; nessuna banda con
    quantità > 0 → `null`;
  - in tutti e due i casi, un prezzo che serve e manca (banda assente nel PUN di quel mese, mese
    assente nella serie ARERA) → `null`.
- Gas → due linee (€/Smc): `cmem` «PSV — CMEM ARERA (all'ingrosso)» e `areraGasSale` «ARERA
  vulnerabili — vendita gas», entrambe `µ€/GJ ÷ 10⁶ × (calorificValueGj ?? 0,03852)` per i mesi con
  `consumption > 0`, `source: 'Fonte: ARERA (CC BY-SA 4.0)'`; mese assente nella serie → `null`.
- Acqua e utenze a canone → `[]`.
- Una serie senza nessun valore nel periodo → la linea non si restituisce (niente legenda vuota).
- Ordine delle linee restituite: luce `pun`, `areraLuce`; gas `cmem`, `areraGasSale`.

`src/lib/db/repositories/bills.ts` (02) aggiunge
`getLatestCalorificValueGj(db, userId, supplyId): Promise<number | null>`: `calorific_value_gj`
della bolletta `confirmed` della fornitura dell'utente con `calorific_value_gj` non nullo e
`period_end` più recente, `null` se non ce n'è (stessa regola del coefficiente C nel motore).

`getSupplyDashboard` (04) aggiunge a `SupplyDashboard` `latestCalorificValueGj: number | null`
(`getLatestCalorificValueGj`, chiamata solo per il gas; `null` per gli altri tipi) e
`references: ReferenceLine[]` (`loadReferenceSeries(db)`, poi `referenceLinesFor` con `kind` della
fornitura, `months` mostrati e `calorificValueGj: latestCalorificValueGj`).

`src/components/charts/unit-price-chart.tsx` (04) cambia così:
- per ogni elemento di `references`, nell'ordine ricevuto, una `Line` con `dataKey` uguale a
  `key`, nome in legenda = `label`, `dot={false}`, `connectNulls={false}`; le linee `pun` e `cmem`
  (all'ingrosso) hanno `stroke="var(--color-reference-wholesale)"` e `strokeDasharray="6 4"`, le
  linee `areraLuce` e `areraGasSale` `stroke="var(--color-reference-arera)"` e
  `strokeDasharray="2 3"`; il componente sceglie lo stile da `key`;
- i punti ricevono un campo per ogni `key` da una nuova funzione pura di
  `src/lib/charts/series.ts`:
  `withReferences(points: UnitPricePoint[], references: ReferenceLine[]): Array<UnitPricePoint & { [referenceKey: string]: string | number | null }>`
  (per ogni punto e ogni linea, `values[point.month] ?? null`);
- la tabella «Vedi i dati» ha una colonna per linea, dopo quelle della 04: intestazione = `label`,
  celle `formatUnitPriceValue(valore, unit)` (C-8, 04), «—» se `null`;
- `note` accetta anche un array di testi (`note?: string | readonly string[]`): un array si mostra
  con un paragrafo per elemento; l'acqua continua a passare il testo della 04.

La pagina `/forniture/[id]` passa `references` a `UnitPriceChart` e, per luce e gas, una `note` con,
nell'ordine: la didascalia fissa di T-31, una riga per ciascuna `source` delle linee restituite
(senza doppioni), e la frase sul PUN nel caso descritto sotto. La didascalia (T-31):

> «La tua materia prima è il solo prezzo dell'energia (o del gas) del tuo contratto, senza IVA. PUN
> e PSV sono prezzi all'ingrosso, senza perdite di rete, dispacciamento e margine del venditore:
> è normale che la tua materia prima stia un po' sopra. Il prezzo ARERA dei clienti vulnerabili
> comprende anche dispacciamento e perdite: è il riferimento più vicino a un'offerta completa.»

Se la fornitura è luce e fra le linee restituite manca `pun` (PUN mai importato, o senza valori
nei mesi mostrati), la `note` aggiunge in fondo: «PUN non importato per i mesi mostrati: vedi
SETUP.md → Market references.» (il testo, non un link al repo).

### 4.7 Lo script ARERA — `scripts/update-riferimenti.ts` + `scripts/riferimenti/*.ts`

`"riferimenti:update": "tsx scripts/update-riferimenti.ts"`.

Funzioni pure (testate senza rete) in `scripts/riferimenti/parse-arera.ts`:

- `findAreraFileLinks(html: string): { luce: string; gas: string }` — gli `href` che finiscono con
  `/E<anno>-smt.xlsx` e `/G<anno>_stv.xlsx` (anno a 4 cifre; se ce n'è più di uno, il più recente);
  assoluti con base `https://www.arera.it`; mancanti → errore «La pagina ARERA non linka più …».
- `parseCmemHtml(html: string): Record<MonthKey, { eurPerMwh: number; eurPerGj: number; eurPerSmc: number }>`
  — per ogni `<table class="table-striped">`: l'anno dalla prima cella (`<strong>YYYY</strong>`), poi
  ogni riga con un mese italiano (`gennaio` … `dicembre`) e tre numeri (tag tolti, spazi tolti,
  virgola → punto); controllo |€/MWh ÷ 3,6 − €/GJ| ≤ 2e-5 (l'€/MWh è stampato con 4 decimali:
  l'arrotondamento vale fino a 1,4e-5 €/GJ; oltre → errore con il mese).
- `parseLuceVulnerabili(workbook: XLSX.WorkBook): Record<MonthKey, { single; F1; F23 }>` — per ogni
  foglio il cui nome è `gen-mar|apr-giu|lug-set|ott-dic <anno>`: la prima riga con una cella
  `Materia energia` (colonna c); due righe sotto, le celle c, c+1, c+2 devono essere `fascia unica`,
  `fascia F1`, `fascia F23`; la riga dopo deve avere in colonna B `Quota energia (euro/kWh)`; i tre
  valori numerici vanno sui tre mesi del trimestre del nome del foglio. Ogni assenza → errore che
  nomina il foglio. Nessun foglio con un nome riconosciuto → errore che nomina il file.
- `parseGasVulnerabili(workbook): Record<MonthKey, { eurPerSmc: number; coefficientP: number; cmemEurPerSmc: number }>`
  — per ogni foglio `gen|feb|…|dic <anno>`: P in B15 (numero in (0,03; 0,05)); tutte le righe con
  `Quota energia (euro/Smc)` in colonna B (nessuna → errore che nomina il foglio); per ciascuna, la
  riga dopo deve cominciare con `consumo Smc/anno: da 0 a 120`; il valore in colonna F (la cui
  intestazione, cercata salendo nella stessa colonna, contiene «Vendita») e il CMEMm in colonna C;
  tutti gli ambiti trovati (sei nel file di oggi, § 1.5) devono avere gli stessi due valori
  (differenza ≤ 1e-9), altrimenti errore con il mese. Nessun foglio con un nome riconosciuto →
  errore che nomina il file.
- `assertXlsxResponse(contentType: string | null, bytes: Uint8Array)` — `content-type` che contiene
  `html` o primi due byte diversi da `PK` → errore «file non trovato: ARERA ha risposto con una
  pagina».
- `assertCmemMatches(htmlCmem, xlsxCmem)` — per ogni mese presente in entrambi, differenza in €/Smc
  oltre 1e-6 → errore con il mese.
- `mergeMonths(existing, incoming)` — unione per mese, i nuovi vincono; ordine crescente.
- `assertInRange(value, min, max, label)` — luce 0,01–2 €/kWh; gas 1–100 €/GJ.

`scripts/update-riferimenti.ts`: scarica (`fetch` con timeout 120 s e `User-Agent:
segnabollette-update/1.0`) la pagina indice, i due xlsx (ciascuno passa da `assertXlsxResponse`), la
pagina CMEM; parsa; `assertCmemMatches` fra il CMEM dell'HTML (€/Smc) e quello dell'xlsx;
`assertInRange` su ogni valore; converte in micro-euro interi con `microsFromEuro` di
`src/lib/domain/money.ts` (luce: `microsFromEuro(€/kWh)`; gas: `microsFromEuro(€/Smc ÷ P)` con il P
del foglio; CMEM: `microsFromEuro(€/GJ)`); fonde con i JSON esistenti (`mergeMonths`); scrive
`JSON.stringify(dati, null, 2) + '\n'` (chiavi dei mesi in ordine crescente) in un temporaneo nella
stessa cartella e lo rinomina, così dopo la scrittura `pnpm lint` resta verde senza `lint:fix`;
stampa i mesi aggiunti e quelli cambiati.

## 5. Vincoli e trappole

- **D-32 / WORKFLOW § 1.6** — qui vuol dire che nessun valore GME entra in un file tracciato, in un
  commit, in una PR o in un test: le fixture del PUN sono prezzi inventati (100, 200, 300 €/MWh).
- **AGENTS.md § 2.1 Layers** — l'app non importa fflate né SheetJS; `loadReferenceSeries` legge JSON
  statici e il repository; il confronto è puro.
- **AGENTS.md § 2.4 Isolation** — `reference-prices.ts` è l'unico repository senza `userId`, già
  eccezione nominata in `scope.test.ts`; non contiene dati di utenti. La sola lettura nuova di dati
  dell'utente, `getLatestCalorificValueGj`, ha la sua coppia proprio/altrui in `bills.test.ts`.
- **AGENTS.md § 2.5 Money** — qui vuol dire che `src/lib/references/reference-lines.ts` è il terzo e
  ultimo posto che converte in unità di visualizzazione (i valori di `ReferenceLine` sono €/unità
  per contratto della 04); nessun altro file della 08 divide per 10⁶; i componenti formattano con
  `formatUnitPriceValue`.
- **D-58** — il PUN in `reference_prices` è globale: lo vede ogni utente del deploy. Con le
  iscrizioni chiuse (01) è solo l'owner; SETUP.md avverte chi le apre a terzi (§ 9).
- I nomi dei file ARERA cambiano ogni anno e quelli vecchi rispondono 404 **con una pagina HTML
  (status 200 su alcuni proxy)**: si controlla il contenuto, non solo lo status.
- I fogli ARERA hanno dimensioni diverse fra loro: le colonne si trovano per intestazione, mai per
  lettera fissa, tranne B (etichette, e P in B15 con il suo intervallo), F del gas (controllata
  dall'intestazione «Vendita») e C del gas (controllata dal confronto con il CMEM dell'HTML entro
  1e-6).
- Lo zip GME pesa ~23 MB: lo script lo legge in memoria (va bene in locale, mai in una function).

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `fasce.test.ts`: `easterSunday(2026) === '2026-04-05'`, `(2027) === '2027-03-28'`; lunedì 2026-09-07: ore 1–7 F3, 8 F2, 9–19 F1, 20–23 F2, 24 F3; sabato 2026-09-12: 8–23 F2, il resto F3; domenica tutte F3; 2026-12-08 (martedì, festa) tutte F3; Pasquetta 2026-04-06 tutte F3; ora 25 → F3. | Contare l'ora 8 in F1 → il lunedì ha 12 ore F1. |
| Unit | `pun.test.ts`: la settimana dal lunedì 2026-09-07 alla domenica 2026-09-13 (nessuna festa, un solo mese; 7 giorni × 24 ore) con prezzo 100 €/MWh nelle ore F1, 200 in F2, 300 in F3 → F1 100 (55 h), F2 200 (41 h), F3 300 (72 h), `single` e F23 come medie pesate sulle ore; valori in µ€/kWh (100 €/MWh → 100000); la stessa settimana con la domenica 2026-09-13 di 25 righe → F3 73 h. | Media delle medie giornaliere invece che media oraria → `single` sbagliato. |
| Unit | `scripts/riferimenti/parse-pun.test.ts` — **zip**: zip sintetico costruito in memoria con `XLSX.write` e `zipSync` di fflate, prezzi inventati (100, 200, 300 €/MWh): due giorni → 48 `HourlyPrice`, data numerica e testuale entrambe lette; zip senza `_60.xlsx` o con due → errore; foglio rinominato → errore; colonna C diversa da `PUN INDEX GME` → errore con le intestazioni; ora 26 o prezzo 6000 → errore con la riga. | Accettare qualunque intestazione in C → il caso dell'intestazione sbagliata passa. |
| Unit | `parse-pun.test.ts` — **mesi completi**: `expectedHoursOfDay('2026-03-29') === 23`, `('2026-10-25') === 25`, `('2026-09-07') === 24`; settembre 2026 con un giorno mancante (696 righe) → in `incompleteMonths` e nessuna sua riga in `complete`; ottobre 2026 completo (745 righe, il 25 con 25) → tutto in `complete`; una riga (data, ora) ripetuta → errore. | Confrontare il numero di righe del mese con le ore di `single` del mese stesso (il controllo che non fallisce mai) invece che con le ore attese → settembre incompleto passa. |
| Unit | `parse-arera.test.ts`: HTML sintetico con due tabelle (2026, 2025) e spazi nei numeri → mesi giusti; €/GJ incoerente di 0,0001 → errore, di 0,00001 → passa; workbook sintetico costruito con `XLSX.utils.aoa_to_sheet` nella forma di § 1.4 (foglio `ott-dic 2026`, riga d'intestazione con «Materia energia» in una colonna diversa da C) → ottobre, novembre, dicembre con gli stessi tre valori; sottointestazione sbagliata → errore che nomina il foglio; workbook senza fogli riconosciuti → errore; gas con due ambiti uguali → valore; con due ambiti diversi → errore; foglio gas senza ambiti → errore; `findAreraFileLinks` con `E2026-smt.xlsx` e `E2025-smt.xlsx` → il 2026, senza link → errore; `assertXlsxResponse('text/html', …)` e byte `<!DOCTYPE` → errore, byte `PK` con `content-type` xlsx → passa; `assertCmemMatches` con 0,000002 €/Smc di differenza → errore; `assertInRange(3, 0.01, 2, 'luce')` → errore. | Leggere sempre la colonna C per la luce → il caso con «Materia energia» spostata fallisce. |
| Unit | `reference-lines.test.ts` — **pesatura**: luce con `hasCommodityBands` vero, consumo F1/F2/F3 = 50/25/25 e PUN F1 100000, F2 200000, F3 300000 µ€/kWh → 0,175 €/kWh; `single` 100 + F1 100 con PUN `single` 200000 e F1 100000 → 0,15; F1 −10 e F2 50 → solo F2, 0,2; ARERA (valori inventati `single` 220000, F1 300000, F23 200000) con 50/25/25 → 0,25; banda F2 assente nel PUN del mese → `null`; gas con PCS 0,0385 e CMEM 20.000.000 µ€/GJ → 0,77 €/Smc, senza PCS → 0,7704; mese senza consumo → `null`; acqua → `[]`. | Media semplice delle tre fasce invece che pesata sui consumi → 0,2 invece di 0,175. |
| Unit | `reference-lines.test.ts` — **monoraria (D-44)**: luce con `hasCommodityBands` falso e `consumptionByBand` F1/F2/F3 = 80/60/60 (dalle letture), PUN `single` 200000, F1 100000, F2 200000, F3 300000 → `pun` 0,2 (non 0,19) e `areraLuce` 0,22 (non 0,24). | Ignorare `hasCommodityBands` e pesare sempre `consumptionByBand` → 0,19 e 0,24. |
| Unit | `src/lib/charts/series.test.ts` esteso: `withReferences` con due punti e una linea `pun` che ha un valore solo nel primo mese → primo punto `pun` = il valore, secondo `null`. | Riempire i buchi con l'ultimo valore noto della linea → il secondo punto ha il valore del primo. |
| Unit | `scripts/references-no-pun.test.ts`: `git ls-files --cached --others --exclude-standard` non contiene file sotto `data/` con `pun` nel nome, e nessuno di quei file contiene la stringa `PUN INDEX GME` fuori da `scripts/riferimenti/parse-pun.ts`, dai `*.test.ts`, da `doc/v1/` e da `doc/guide/riferimenti.md`. | Creare `data/riferimenti/pun.json` (anche senza `git add`) → fallisce. |
| Integrazione | `reference-prices.test.ts`: upsert di due mesi con valori diversi, poi di nuovo degli stessi due mesi con altri valori → due righe, ognuna col suo valore nuovo; `loadReferenceSeries` sul DB di test con una riga PUN → la serie contiene quel mese. | `set` con i valori della prima riga invece di `excluded.*` → il secondo mese ha il valore del primo. |
| Integrazione | `bills.test.ts` esteso: due bollette gas `confirmed` dell'utente A (PCS 0,0390 la più vecchia, nullo la più recente) e una `replaced` con PCS 0,0400 e `period_end` più recente di tutte → `getLatestCalorificValueGj` = 0,0390; la stessa fornitura letta con l'id dell'utente B → `null`. | Togliere il filtro sullo stato → 0,0400. |
| E2E | `dashboard.spec.ts` esteso (seed A, sola lettura): `tests/e2e/global-setup.ts` (01), dopo il seed, inserisce in `e2e.db` con `upsertReferencePricesQuery` righe PUN inventate per ogni mese da 15 mesi fa al mese corrente (`single` 200000, F1 100000, F2 200000, F3 300000, F23 250000 µ€/kWh, fonte `test`); `/forniture/<luce di seed A>` → nella tabella «Vedi i dati» del costo unitario le colonne «PUN Index GME (all'ingrosso)» e «ARERA vulnerabili — materia energia» con valori, e nella colonna PUN del mese scorso «0,2000 €/kWh» (`formatUnitPriceValue`) (la luce del seed è monoraria: `single`); la didascalia di T-31 e le due fonti; nessuna frase «PUN non importato»; `/forniture/<gas di seed A>` → le colonne «PSV — CMEM ARERA (all'ingrosso)» e «ARERA vulnerabili — vendita gas»; `/forniture/<acqua>` → nessuna colonna di riferimento. | `references` non passato al grafico → colonne assenti. |

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite precedente verde; con `local.db` senza PUN importato il grafico della
  luce di seed A mostra la sola linea ARERA e sotto la frase «PUN non importato per i mesi mostrati:
  vedi SETUP.md → Market references.».
- **C — Comportamento nuovo**:
  1. `pnpm riferimenti:update` (rete verso arera.it, **nessun costo**). Esito atteso dichiarato
     prima: i tre JSON scritti; CMEM settembre 2026 = 78,8021 €/MWh e 21.889.472 µ€/GJ; luce
     ottobre 2026 `single` 276440; gas settembre 2026 22.913.759 µ€/GJ; `pnpm lint` verde subito
     dopo. Il diff dei JSON si guarda insieme e si committa (dati ARERA, CC BY-SA).
  2. `pnpm riferimenti:pun` senza argomenti → «uso: pnpm riferimenti:pun -- <AnnoYYYY.zip>
     [--prod]» e nessuna scrittura.
  3. L'owner scarica **a mano** `Anno2026.zip` dalla pagina «Dati storici» MGP del GME (fuori dal
     repo) e lancia `pnpm riferimenti:pun -- <percorso>` (senza `--prod`: scrive `local.db`). Esito
     atteso, dichiarato prima: per settembre 2026 le ore 242 (F1), 174 (F2), 304 (F3), e i valori
     uguali al centesimo a quelli del PDF «Prezzo medio per fasce» di settembre 2026 del GME, che
     l'owner apre accanto (i valori si confrontano in chat e non si trascrivono in nessun file
     tracciato: D-32); l'ultimo mese dello zip, non ancora finito, stampato «incompleto, non
     importato» e assente da `reference_prices`.
- **D — Sotto la UI**: uno script usa e getta stampa `referenceLinesFor` per la «Luce» di seed A sul
  DB locale. Esito atteso, calcolato prima: la «Luce» del seed è monoraria (`band: null`, quindi
  `hasCommodityBands` falso, D-44), per cui in ogni mese con consumo `pun` = il PUN `single` del
  mese stampato al passo C3 ÷ 1000 (€/kWh) e `areraLuce` = la `single` del trimestre in
  `arera-luce-vulnerabili.json` ÷ 10⁶, senza pesatura sulle quote 40/30/30 delle letture; i mesi
  senza PUN importato → `null`. I valori GME si confrontano in chat.
- **F — Giro guidato** (al via dell'owner): (1) `/forniture/<luce>` — le linee tratteggiate si
  distinguono dalle tue? (2) la didascalia si capisce? (3) `/forniture/<gas>?periodo=tutto` — il
  PSV segue l'inverno? Non copre: la PWA (09).
- **G — Ripristino**: lo zip GME resta fuori dal repo (serve ancora agli import `--prod` di § 8);
  lo script usa e getta si cancella; `local.db` tiene il PUN importato (è il DB di sviluppo
  dell'owner).

## 8. Messa in esercizio

Ordine (D-41):
1. DDL: `drizzle/0003_*.sql` con `pnpm db:migrate:prod` **prima** del merge (all'OK dell'owner).
2. Gate verdi, commit unico e PR; stato della spec «implementata il <data>, branch `feature/08-market-references`» (riga «Stato» e
   indice § 5).
3. Merge della PR (lo fa l'owner) → deploy di produzione; i JSON ARERA arrivano col merge.
4. Nella stessa sessione, dopo il deploy verde: l'owner lancia `pnpm riferimenti:pun --
   <Anno2025.zip> --prod` e `pnpm riferimenti:pun -- <Anno2026.zip> --prod` (gli anni delle
   bollette dell'owner; lo script stampa l'host di produzione prima di scrivere).
5. Misura di chiusura, in produzione: il grafico della luce mostra PUN e ARERA, quello del gas CMEM
   e vendita vulnerabili, e nessuna frase «PUN non importato».
6. Esito, gotchas e stato «in esercizio» in `SESSION_NOTES.md`, che a fine sessione **resta** (non
   tracciato): entra nel commit della 09, che comincia scrivendolo.

Manutenzione (SETUP.md): una volta al mese, su un branch `feature/riferimenti-<AAAA-MM>` creato da
`main` aggiornato, `pnpm riferimenti:update`, un commit dei soli JSON e una PR verso `main` (il nome
segue la regola dei branch di WORKFLOW.md § 3; `vercel.json` salta comunque la build di ogni branch
che non è di produzione); per il PUN aggiornato, lo zip dell'anno in corso con `--prod` (i mesi
già importati si sovrascrivono, l'ultimo incompleto resta fuori fino all'import successivo).

## 9. Documentazione

- **`doc/guide/riferimenti.md`** (nasce qui, ≤ 250 righe): fonti, licenze (CC BY-SA per ARERA;
  GME solo uso privato e perché il PUN non è nel repo), formati dei file, gli algoritmi (fasce,
  medie, mesi completi del PUN, conversioni €/MWh → µ€/kWh, €/Smc → €/GJ con P), l'allineamento
  mensile (D-44: monoraria contro media e fascia unica, multioraria pesata sulle bande), la
  didascalia, le trappole (nomi annuali, 404 come HTML, colonne per intestazione, 4 ottobre).
- `SETUP.md`: sezione *Market references*: ARERA automatici nel repo, aggiornati una volta al mese
  su `feature/riferimenti-<YYYY-MM>` (§ 8); PUN: scaricare a mano lo zip dal sito GME
  rispettandone le condizioni d'uso e lanciare `pnpm riferimenti:pun -- <zip> --prod` (legge
  `.env.turso-prod`); l'avviso di D-58: «The imported PUN is visible to every user of this
  deployment. GME licenses it for private use only: before opening sign-ups to anyone else, check
  the GME terms of use (https://www.mercatoelettrico.org/it-it/Home/CondizioniUtilizzo/).».
- `CLAUDE.md`: Latest; § Key Features (riferimenti) invariata salvo i dettagli nuovi; § Not yet
  present: le voci su 4 ottobre, STG, «cliente tipo», PCS per mese, acqua e scaricamento automatico
  del PUN ci sono già e restano; si toglie «riferimenti 08» dall'elenco delle guide non ancora nate.
- `AGENTS.md`: § 2.4 c'è già (nessuna modifica); § 2.5 dice «(the chart series in
  `src/lib/charts/series.ts` and the reference lines in `src/lib/references/reference-lines.ts`
  are the only other places that convert to display units)»; § 11 Gotchas: «<data> — ARERA serves
  a removed yearly file as an HTML page (status 200 behind some proxies): check the bytes, not the
  status».
- `README.md`: § What it does e § Data sources and licences ci sono già; si toglie «(from spec
  08)».
- `WORKFLOW.md` § 3: la riga *Market references* (`riferimenti:pun` con `--prod`, che legge
  `.env.turso-prod`, altrimenti `local.db`), § *The isolated environment* (produzione solo
  attraverso `.env.turso-prod`) e § *Branches* (`feature/riferimenti-<YYYY-MM>` per
  l'aggiornamento mensile) lo dicono già: si controlla che corrispondano a ciò che lo script fa, e
  si corregge solo una differenza.
- Nel commit di questa sessione entra anche l'esito del collaudo in produzione della 07 (da
  `SESSION_NOTES.md`): stato «in esercizio» della 07 nella sua riga «Stato» e nell'indice § 5,
  CLAUDE.md → Latest, e in `doc/guide/estrazione.md` l'esito dell'import (bollette importate, costo
  reale contro stima).

## 10. Fuori ambito, dichiarato

- Scaricamento automatico del PUN (vietato dalle condizioni GME) → nessun erede, salvo
  un'autorizzazione scritta del GME (CLAUDE.md § Not yet present).
- Servizio a tutele graduali (STG), prezzi per ambito del gas oltre la vendita, PCS per mese →
  CLAUDE.md § Not yet present.
- Il «cliente tipo» ARERA (spesa totale con le imposte) → CLAUDE.md § Not yet present.

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **M**.

```
Ciao, in questa sessione implemento la spec doc/v1/08-riferimenti-di-mercato.md.

Prima di tutto: scrivi l'esito del collaudo in produzione della spec precedente da
SESSION_NOTES.md (stato «in esercizio» della 07 nella sua riga Stato e nell'indice § 5, CLAUDE.md
→ Latest, e l'esito dell'import delle mie bollette — bollette importate, costo reale contro stima —
in doc/guide/estrazione.md), poi crea il branch: `git switch main`, `git pull` (main aggiornato
dopo il merge della 07), `git branch --show-current` deve dire main; crea
feature/08-market-references. In SESSION_NOTES.md, tolti i blocchi della 07 già scritti, annota
questa sessione.

Contesto, prima di toccare qualsiasi altro file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), doc/guide/calcoli.md, doc/guide/app.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi DESIGN.md (token dei grafici) e doc/guide/estrazione.md
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 08 INTERA
- Controlla con un grep che i contratti C-1, C-2, C-4, C-7, C-8, C-11, C-12, C-13, C-15, C-22
  esistano con i nomi e le firme dell'indice (in particolare SupplyMonth.hasCommodityBands della
  02, il tipo ReferenceLine in src/lib/charts/series.ts, UnitPriceChart, getSupplyDashboard e
  formatUnitPriceValue della 04, loadProductionTarget in scripts/production-target.ts della 05,
  i token --color-reference-wholesale e --color-reference-arera in DESIGN.md e nel CSS, e
  tests/e2e/global-setup.ts della 01)

Implementa la spec 08 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima; lo zip del GME lo
scarico io a mano), § 9 la documentazione. Il PUN non entra mai in un file del repo: nei test solo
prezzi inventati (100, 200, 300 €/MWh), i valori veri si confrontano in chat. Non decidere nulla
che la spec ha già deciso; se trovi un punto che la spec non copre, fermati e chiedimelo con
AskUserQuestion. Le etichette della serie non entrano nel codice.

Alla fine, nell'ordine di § 8: `pnpm db:migrate:prod` al mio OK; gate verdi; riassumi il diff,
scrivi lo stato «implementata il <data>, branch `feature/08-market-references`» nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, chiedimi l'OK per il commit (uno solo) e apri la PR.
Il merge lo faccio io; dopo il deploy verde, nella stessa sessione, lancio gli import del PUN con
--prod e facciamo insieme la misura di chiusura in produzione. Esito, gotchas e stato «in
esercizio» li scrivi in SESSION_NOTES.md, che resta (non tracciato) per il commit della 09.
```
