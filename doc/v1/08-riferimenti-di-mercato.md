# 08 — Riferimenti di mercato

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/08-market-references` da `main`. **Dipende da**: 07 (in esercizio; per
> l'ordine, non per codice).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-14, D-26, D-32…D-36; scelte T-1 (fflate,
> SheetJS), T-25, T-26, T-31; contratti C-2 (`referencePrices`), C-12 (`reference-prices.ts`), C-19
> — li crea; usa C-11, C-15.

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
| A2 | Lo script fallisce con un messaggio chiaro se: la pagina non linka i file attesi; un file atteso è HTML (404 di ARERA) invece di un xlsx; un foglio o un'intestazione mancano; due ambiti del gas hanno valori diversi; CMEM dell'HTML e dell'xlsx differiscono oltre 1e-6; un valore esce dagli intervalli. | Unit (un caso per ramo). |
| A3 | `pnpm riferimenti:pun -- <AnnoYYYY.zip> [--prod]` legge lo zip scaricato a mano, calcola per ogni mese media e F1/F2/F3/F23 con le ore, e li scrive in `reference_prices` del DB locale (o di produzione con `--prod`); stampa la tabella dei mesi. | Unit sul calcolo; collaudo con lo zip vero (fuori dal repo). |
| A4 | Il PUN non compare mai in un file tracciato: nessun `data/riferimenti/pun*`, nessuna fixture con valori GME. | `references-no-pun.test.ts` (grep sui file tracciati). |
| A5 | Il grafico del costo unitario di luce e gas mostra le linee di riferimento tratteggiate (§ 4.6), con didascalia e fonti; l'acqua resta senza confronto (testo della 04). | Unit `reference-lines.test.ts`; E2E. |
| A6 | Il confronto è mensile: trimestrali ARERA su tutti e tre i mesi; luce pesata sulle fasce dei consumi del mese; gas a €/GJ × PCS dell'ultima bolletta (0,03852 se manca). | Unit. |

## 3. Decisioni

- **D-14** (file committati, script lanciato dall'owner), **D-26** (materia senza IVA), **D-32**
  (PUN nel DB, zip a mano), **D-33** (vulnerabili, materia energia), **D-34** (CMEM + vendita gas
  vulnerabili), **D-35** (allineamento), **D-36** (acqua).
- **T-25** (formati e licenza), **T-26** (festività senza il 4 ottobre), **T-31** (solo sulla linea
  della materia prima, didascalia fissa).
- Adottate qui, ribaltabili:
  (a) i dati ARERA si conservano dal 2024 in avanti (quanto offrono i file e la pagina CMEM di
  oggi); la storia cresce perché lo script fonde i mesi;
  (b) per il gas si usa il PCS **dell'ultima bolletta confermata** della fornitura per tutti i mesi
  del grafico (non quello di ciascun mese);
  (c) i valori si salvano in **micro-euro interi** (µ€/kWh per la luce, µ€/GJ per il gas), come i
  prezzi delle voci;
  (d) il PUN del grafico pesa le fasce sui consumi del mese dell'owner (F1/F2/F3 se ci sono; F1/F23
  se la bolletta è bioraria; altrimenti la media mensile);
  (e) il riferimento ARERA dei vulnerabili luce usa `fascia unica` per un mese con consumo solo
  `single`, altrimenti F1 e F23 pesati (F2 + F3 → F23);
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

`scripts/import-pun.ts` (`"riferimenti:pun": "tsx --env-file-if-exists=.env.local scripts/import-pun.ts"`):
1. argomenti: il percorso dello zip (obbligatorio) e `--prod`;
2. con `--prod` carica `.env.turso-prod` come `migrate-prod.ts` (05) e usa `readProductionTarget`;
   altrimenti `EnvSchema` sulle variabili locali;
3. `unzipSync` di fflate; l'unica voce che finisce con `_60.xlsx` (zero o più di una → errore);
4. SheetJS `read` → foglio `Prezzi-Prices` (mancante → errore); riga 1: colonna A comincia con
   `Data`, colonna C è `PUN INDEX GME` (altrimenti errore con le intestazioni lette); righe
   successive: data `YYYYMMDD` (numero o testo) → `IsoDate`, ora intera 1–25, prezzo numero in
   (0, 5000) (fuori → errore con la riga);
5. `computePunMonthly`; controllo: per ogni mese `hours` di `single` = numero di righe del mese;
6. `upsertReferencePricesQuery` in un `db.batch` (serie `pun`, fonte `GME`, `importedAt = Date.now()`);
7. stampa una riga per mese nella forma `2026-09  media 100,00  F1 100,00 (242 h)  F2 100,00 (174 h)  F3 100,00 (304 h)  F23 100,00 €/MWh` (qui con numeri inventati: i valori GME non si trascrivono nel repo).

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
rows)` (`onConflictDoUpdate` sulla chiave) e `listReferencePrices(db, series)` — è l'eccezione già
dichiarata in `scope.test.ts` (01). `deleteAllUserData` non la tocca.

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
  /** GJ/Smc of the latest confirmed gas bill, or null. */
  calorificValueGj: number | null;
}): ReferenceLine[];
```

- Luce → due `ReferenceLine` (valori in €/kWh, cioè µ€ ÷ 10⁶):
  - `pun`: «PUN Index GME (all'ingrosso)», `source: 'Fonte: Gestore dei Mercati Energetici S.p.A.
    (dati importati per uso privato)'`; per mese con consumo > 0: se `consumptionByBand` ha F2 o F3
    > 0 → media di F1/F2/F3 pesata sulle quantità (F23 della bolletta, se c'è, pesa la banda `F23`
    del PUN); se ha solo F1/F23 → F1 e F23 pesati; altrimenti `single`; una banda richiesta
    assente nel PUN di quel mese → `null`.
  - `areraLuce`: «ARERA vulnerabili — materia energia», `source: 'Fonte: ARERA (CC BY-SA 4.0)'`;
    solo `single` → `single`; altrimenti F1 e F23 pesati (F2 + F3 + F23 del mese sotto F23).
- Gas → due linee (€/Smc): `cmem` «PSV — CMEM ARERA (all'ingrosso)» e `areraGasSale` «ARERA
  vulnerabili — vendita gas», entrambe `µ€/GJ ÷ 10⁶ × (calorificValueGj ?? 0,03852)`, fonte ARERA.
- Acqua e utenze a canone → `[]`.
- Una serie senza nessun valore nel periodo → la linea non si restituisce (niente legenda vuota).

`getSupplyDashboard` (04) aggiunge al risultato `references: ReferenceLine[]` (chiama
`loadReferenceSeries` e `referenceLinesFor` sui mesi mostrati) e `latestCalorificValueGj`; la
pagina passa `references` a `UnitPriceChart` e sotto il grafico, per luce e gas, la didascalia fissa
(T-31):

> «La tua materia prima è il solo prezzo dell'energia (o del gas) del tuo contratto, senza IVA. PUN
> e PSV sono prezzi all'ingrosso, senza perdite di rete, dispacciamento e margine del venditore:
> è normale che la tua materia prima stia un po' sopra. Il prezzo ARERA dei clienti vulnerabili
> comprende anche dispacciamento e perdite: è il riferimento più vicino a un'offerta completa.»

e le fonti delle linee mostrate. Se il PUN non è mai stato importato, sotto il grafico della luce:
«PUN non importato: vedi SETUP.md → Market references.» (il testo, non un link al repo).

### 4.7 Lo script ARERA — `scripts/update-riferimenti.ts` + `scripts/riferimenti/*.ts`

`"riferimenti:update": "tsx scripts/update-riferimenti.ts"`.

Funzioni pure (testate senza rete) in `scripts/riferimenti/parse-arera.ts`:

- `findAreraFileLinks(html: string): { luce: string; gas: string }` — gli `href` che finiscono con
  `/E<anno>-smt.xlsx` e `/G<anno>_stv.xlsx` (anno a 4 cifre; se ce n'è più di uno, il più recente);
  assoluti con base `https://www.arera.it`; mancanti → errore «La pagina ARERA non linka più …».
- `parseCmemHtml(html: string): Record<MonthKey, { eurPerMwh: number; eurPerGj: number; eurPerSmc: number }>`
  — per ogni `<table class="table-striped">`: l'anno dalla prima cella (`<strong>YYYY</strong>`), poi
  ogni riga con un mese italiano (`gennaio` … `dicembre`) e tre numeri (tag tolti, spazi tolti,
  virgola → punto); controllo |€/MWh ÷ 3,6 − €/GJ| ≤ 1e-6 (altrimenti errore con il mese).
- `parseLuceVulnerabili(workbook: XLSX.WorkBook): Record<MonthKey, { single; F1; F23 }>` — per ogni
  foglio il cui nome è `gen-mar|apr-giu|lug-set|ott-dic <anno>`: la prima riga con una cella
  `Materia energia` (colonna c); due righe sotto, le celle c, c+1, c+2 devono essere `fascia unica`,
  `fascia F1`, `fascia F23`; la riga dopo deve avere in colonna B `Quota energia (euro/kWh)`; i tre
  valori numerici vanno sui tre mesi del trimestre del nome del foglio. Ogni assenza → errore che
  nomina il foglio.
- `parseGasVulnerabili(workbook): Record<MonthKey, { eurPerSmc: number; coefficientP: number; cmemEurPerSmc: number }>`
  — per ogni foglio `gen|feb|…|dic <anno>`: P in B15 (numero in (0,03; 0,05)); tutte le righe con
  `Quota energia (euro/Smc)` in colonna B; per ciascuna, la riga dopo deve cominciare con `consumo
  Smc/anno: da 0 a 120`; il valore in colonna F (la cui intestazione, cercata salendo nella stessa
  colonna, contiene «Vendita») e il CMEMm in colonna C; i sei (o quanti sono) ambiti devono avere
  gli stessi due valori (differenza ≤ 1e-9), altrimenti errore con il mese.
- `mergeMonths(existing, incoming)` — unione per mese, i nuovi vincono; ordine crescente.
- `assertInRange(value, min, max, label)` — luce 0,01–2 €/kWh; gas 1–100 €/GJ.

`scripts/update-riferimenti.ts`: scarica (`fetch` con timeout 120 s e `User-Agent:
segnabollette-update/1.0`) la pagina indice, i due xlsx (risposta con `content-type` HTML o primi
byte diversi da `PK` → errore «file non trovato: ARERA ha risposto con una pagina»), la pagina CMEM;
parsa; controlla che per ogni mese presente in entrambi il CMEM dell'HTML (€/Smc) e quello
dell'xlsx coincidano entro 1e-6; converte in micro-euro (luce: € × 10⁶; gas: € ÷ P × 10⁶ con il P
del foglio; CMEM: €/GJ × 10⁶); fonde con i JSON esistenti; scrive ciascun file in un temporaneo e
lo rinomina; stampa i mesi aggiunti e quelli cambiati.

## 5. Vincoli e trappole

- **D-32 / WORKFLOW § 1.6** — qui vuol dire che nessun valore GME entra in un file tracciato, in un
  commit, in una PR o in un test: le fixture del PUN sono prezzi inventati (100, 200, 300 €/MWh).
- **AGENTS.md § 2.1 Layers** — l'app non importa fflate né SheetJS; `loadReferenceSeries` legge JSON
  statici e il repository; il confronto è puro.
- **AGENTS.md § 2.4 Isolation** — `reference-prices.ts` è l'unico repository senza `userId`, già
  eccezione nominata in `scope.test.ts`; non contiene dati di utenti.
- I nomi dei file ARERA cambiano ogni anno e quelli vecchi rispondono 404 **con una pagina HTML
  (status 200 su alcuni proxy)**: si controlla il contenuto, non solo lo status.
- I fogli ARERA hanno dimensioni diverse fra loro: le colonne si trovano per intestazione, mai per
  lettera fissa, tranne B (etichette) ed F/C del gas, controllate dall'intestazione.
- Lo zip GME pesa ~23 MB: lo script lo legge in memoria (va bene in locale, mai in una function).

## 6. Test

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `fasce.test.ts`: `easterSunday(2026) === '2026-04-05'`, `(2027) === '2027-03-28'`; lunedì 2026-09-07: ore 1–7 F3, 8 F2, 9–19 F1, 20–23 F2, 24 F3; sabato 2026-09-12: 8–23 F2, il resto F3; domenica tutte F3; 2026-12-08 (martedì, festa) tutte F3; Pasquetta 2026-04-06 tutte F3; ora 25 → F3. | Contare l'ora 8 in F1 → il lunedì ha 12 ore F1. |
| Unit | `pun.test.ts`: una settimana sintetica (7 giorni × 24 ore) con prezzo 100 nelle ore F1, 200 in F2, 300 in F3 → F1 100 (55 h), F2 200 (41 h), F3 300 (72 h), `single` e F23 come medie pesate sulle ore; valori in µ€/kWh (100 €/MWh → 100000); un giorno di 25 righe aggiunge un'ora F3. | Media delle medie giornaliere invece che media oraria → `single` sbagliato. |
| Unit | `parse-arera.test.ts`: HTML sintetico con due tabelle (2026, 2025) e spazi nei numeri → mesi giusti; €/GJ incoerente → errore; workbook sintetico costruito con `XLSX.utils.aoa_to_sheet` nella forma di § 1.4 (foglio `ott-dic 2026`, riga d'intestazione con «Materia energia» in una colonna diversa da C) → ottobre, novembre, dicembre con gli stessi tre valori; sottointestazione sbagliata → errore che nomina il foglio; gas con due ambiti uguali → valore; con due ambiti diversi → errore; `findAreraFileLinks` con `E2026-smt.xlsx` e `E2025-smt.xlsx` → il 2026. | Leggere sempre la colonna C per la luce → il caso con «Materia energia» spostata fallisce. |
| Unit | `reference-lines.test.ts`: luce con consumo F1/F2/F3 = 50/25/25 e PUN F1 100000, F2 200000, F3 300000 µ€ → 0,175 €/kWh; consumo solo `single` → media mensile; gas con PCS 0,0385 e CMEM 20.000.000 µ€/GJ → 0,77 €/Smc, senza PCS → 0,7704; mese senza consumo → `null`; acqua → `[]`. | Pesare per ore invece che per consumi → 0,2 invece di 0,175. |
| Unit | `references-no-pun.test.ts`: `git ls-files` non contiene file sotto `data/` con `pun` nel nome, e nessun file tracciato contiene la stringa `PUN INDEX GME` fuori da `scripts/import-pun.ts`, dai test e dalle spec. | Committare `data/riferimenti/pun.json` → fallisce. |
| Integrazione | `reference-prices.test.ts`: upsert due volte dello stesso mese → una riga col valore nuovo; `loadReferenceSeries` sul DB di test con una riga PUN → la serie contiene quel mese. | `onConflictDoNothing` → resta il valore vecchio. |
| E2E | `dashboard.spec.ts` esteso: il global setup inserisce righe PUN inventate in `e2e.db` per i mesi dei seed; `/forniture/<luce di seed A>` → nella tabella «Vedi i dati» del costo unitario le colonne «PUN Index GME (all'ingrosso)» e «ARERA vulnerabili — materia energia» con valori; la didascalia di T-31; `/forniture/<acqua>` → nessuna colonna di riferimento. | `references` non passato al grafico → colonne assenti. |

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: suite precedente verde; il grafico senza PUN importato funziona (solo ARERA).
- **C — Comportamento nuovo**:
  1. `pnpm riferimenti:update` (rete verso arera.it, **nessun costo**). Esito atteso dichiarato
     prima: i tre JSON scritti; CMEM settembre 2026 = 78,8021 €/MWh e 21.889.472 µ€/GJ; luce
     ottobre 2026 `single` 276440; gas settembre 2026 22.913.759 µ€/GJ. Il diff dei JSON si guarda
     insieme e si committa (dati ARERA, CC BY-SA).
  2. L'owner scarica **a mano** `Anno2026.zip` dalla pagina «Dati storici» MGP del GME (fuori dal
     repo) e lancia `pnpm riferimenti:pun -- <percorso>`. Esito atteso, dichiarato prima: per settembre 2026
     le ore 242 (F1), 174 (F2), 304 (F3), e i valori uguali al centesimo a quelli del PDF «Prezzo
     medio per fasce» di settembre 2026 del GME, che l'owner apre accanto (i valori si confrontano
     in chat e non si trascrivono in nessun file tracciato: D-32).
- **D — Sotto la UI**: uno script usa e getta stampa `referenceLinesFor` per la «Luce» di seed A sul
  DB locale; l'esito atteso si calcola a mano prima (media pesata sulle quote 40/30/30 dei seed).
- **F — Giro guidato** (al via dell'owner): (1) `/forniture/<luce>` — le linee tratteggiate si
  distinguono dalle tue? (2) la didascalia si capisce? (3) `/forniture/<gas>?periodo=tutto` — il
  PSV segue l'inverno? Non copre: la PWA (09).
- **G — Ripristino**: lo zip GME resta fuori dal repo (si può cancellare); lo script usa e getta si
  cancella; in produzione: `pnpm riferimenti:pun -- <zip> --prod` (messa in esercizio).

## 8. Messa in esercizio

- DDL: `drizzle/0003_*.sql` con `pnpm db:migrate:prod` prima del merge.
- Dopo il merge: `pnpm riferimenti:pun -- <Anno2025.zip> --prod` e `… <Anno2026.zip> --prod` (gli
  anni delle bollette dell'owner). I JSON ARERA arrivano col merge.
- Misura di chiusura: in produzione il grafico della luce mostra PUN e ARERA, quello del gas CMEM e
  vendita vulnerabili.
- Manutenzione (SETUP.md): una volta al mese `pnpm riferimenti:update` (commit dei JSON, PR) e, se
  si vuole il PUN aggiornato, lo zip dell'anno in corso con `--prod`.

## 9. Documentazione

- **`doc/guide/riferimenti.md`** (nasce qui, ≤ 250 righe): fonti, licenze (CC BY-SA per ARERA;
  GME solo uso privato e perché il PUN non è nel repo), formati dei file, gli algoritmi (fasce,
  medie, conversioni €/MWh → µ€/kWh, €/Smc → €/GJ con P), l'allineamento mensile, la didascalia, le
  trappole (nomi annuali, 404 come HTML, colonne per intestazione, 4 ottobre).
- `SETUP.md`: sezione *Market references* (ARERA automatici nel repo; PUN: scaricare a mano lo zip
  dal sito GME rispettandone le condizioni d'uso e lanciare `pnpm riferimenti:pun -- <zip> --prod`).
- `CLAUDE.md`: Latest; § Key Features (riferimenti); § Not yet present: 4 ottobre nelle fasce da
  verificare nel 2027; STG non vulnerabili (finisce il 31/03/2027, non usato); riferimento per
  l'acqua (non esiste una serie nazionale).
- `AGENTS.md`: § 2.4 nomina l'eccezione `reference-prices.ts`; § 11 Gotchas (ARERA 404 come HTML).
- `README.md`: § What it does (confronto col mercato) e la riga sulle licenze dei dati.

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

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto), doc/guide/calcoli.md, doc/guide/app.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/v1/00-INDICE.md per intero e poi la spec 08 INTERA
- Controlla con un grep che i contratti C-2, C-11, C-12, C-15 esistano con i nomi e le firme
  dell'indice (in particolare ReferenceLine e UnitPriceChart della 04)

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/08-market-references. Crea SESSION_NOTES.md.

Implementa la spec 08 esattamente come scritta: § 4 è la soluzione, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima; lo zip del GME lo
scarico io a mano), § 9 la documentazione. Il PUN non entra mai in un file tracciato. Non decidere
nulla che la spec ha già deciso; se trovi un punto che la spec non copre, fermati e chiedimelo con
AskUserQuestion. Le etichette della serie non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
