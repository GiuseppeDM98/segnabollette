# 02 — Modello dei dati e motore dei calcoli

> **Stato**: scritta 2026-10-24. Pronta per l'implementazione dopo la lettura adversariale.
> **Branch**: `feature/02-data-engine` da `main`. **Dipende da**: 01 (in esercizio).
> **Indice**: [00-INDICE.md](00-INDICE.md) — decisioni D-3, D-5, D-6, D-22…D-27, D-29, D-31; scelte
> T-7, T-9, T-10, T-11, T-12, T-13, T-28, T-30, T-33, T-34; contratti C-2 (tabelle dell'app),
> C-6, C-7, C-8, C-9, C-10, C-11, C-12, C-13, C-21 (dati) — li crea; usa C-1, C-3, C-4, C-5.

## 1. Il problema oggi (prove)

1. Dopo la 01 esistono solo le tabelle di Better Auth; `deleteAllUserData` è vuota.
2. Una bolletta italiana non è «un totale e un consumo». Le bollette campione dell'owner (lette il
   2026-10-24 fuori dal repo, indice § 2.1) mostrano:
   - **voci con il loro periodo di competenza**: la bolletta del gas di un mese contiene un secondo
     blocco «Elementi di dettaglio» col **mese precedente** rifatturato, voce per voce, con coppie
     «Gas» / «Gas (voce di ricalcolo)» di **segno opposto** (quantità +n e −n, importi ±);
   - **voci con importo negativo** (componenti compensative, quota fissa oneri negativa);
   - **quote fisse annuali pro rata** («30/365 × €/anno»): la quantità è una frazione di anno;
   - **IVA a due aliquote** nella stessa bolletta (10% e 22%);
   - **prezzi unitari a 6 decimali** (0,015068 €/kWh), e un prezzo unitario stampato inaffidabile
     (0,000000 €/kWh accanto a un importo non nullo);
   - **letture per registro** (F1/F2/F3) a due date anche con un'offerta monoraria; gas in **mc**
     con il **coefficiente C** e i **Smc** fatturati arrotondati all'intero;
   - voci **fuori dal totale bolletta** (canone TV) che però entrano nel totale da pagare;
   - per l'internet/telefono: solo canone, IVA, periodo.
3. Le scelte dell'owner chiedono di reggere tutto con **una tabella per tutte le utenze** (tema),
   conguagli **per competenza** (D-23), consumi dal fatturato con le fasce dalle letture (D-25),
   ripartizione **uniforme per giorno** (D-27), materia prima **senza IVA** e totale **con IVA**
   (D-26), fotovoltaico con immessa e produzione (D-29).
4. Le foreign key sono spente su Turso remoto (01 § 1.5, T-34): ogni cancellazione deve essere
   esplicita.

## 2. Obiettivo e criteri di accettazione

Lo schema delle case, delle forniture, delle bollette con le loro voci e delle letture; i tipi e
gli schemi zod condivisi; il **motore dei calcoli puro** che produce le serie mensili per
fornitura e per casa; i repository isolati per utente; i servizi che confermano, modificano e
cancellano bollette e letture. Nessuna UI (la 03).

| # | Criterio | Prova |
|---|---|---|
| A1 | Le tabelle `houses`, `supplies`, `bills`, `bill_lines`, `meter_readings` esistono con il DDL di § 4.2, migrazione `drizzle/0001_*.sql` generata e committata. | `pnpm db:generate` senza diff dopo il commit; test di integrazione sui repository. |
| A2 | `confirmBill` salva bolletta, voci e letture in un solo `db.batch`; rifiuta una fornitura altrui (`NOT_FOUND`), un input non valido (`VALIDATION` con i problemi), una sovrapposizione senza decisione (`OVERLAP_DECISION_REQUIRED` con le bollette in `details`); con `replace` le bollette sovrapposte diventano `replaced`. | `bills.test.ts` (§ 6). |
| A3 | `deleteBill` cancella voci, letture della bolletta e la bolletta, e riporta a `confirmed` le bollette che quella aveva sostituito; `deleteSupply` e `deleteHouse` cancellano tutto ciò che sta sotto; con le foreign key accese nessuna cancellazione fallisce. | `bills.test.ts`, `houses-supplies.test.ts`. |
| A4 | `buildSupplyMonths` riparte importi e quantità per giorno sui mesi (somme esatte al centesimo), attribuisce i ricalcoli al mese di competenza, ricava le fasce dalle letture della bolletta, marca i mesi stimati non ricalcolati, calcola i due costi unitari, il consumo da letture dopo l'ultimo giorno fatturato (gas × C) e, col fotovoltaico, immessa, produzione, autoconsumo e consumo della casa. | `supply-months.test.ts` con i casi di § 6. |
| A5 | Ogni repository rispetta la firma `(db: Db, userId: string, …)` e un utente non legge né modifica le righe di un altro. | `scope.test.ts` (01) verde; coppie proprio/altrui in ogni test di servizio. |
| A6 | `deleteAllUserData` cancella le righe delle cinque tabelle; «elimina account» con dati presenti non fallisce. | `user-data.test.ts` e `create-auth.test.ts` (caso con una bolletta). |
| A7 | `pnpm db:seed` crea per i due utenti seed case, forniture, bollette e letture inventate (§ 4.9), idempotente. | Collaudo § 7. |

## 3. Decisioni

- **D-3** (luce, gas, acqua, a canone), **D-5** (case), **D-6** (nessun codice oltre
  l'identificativo), **D-22** (due costi unitari), **D-23** (competenza), **D-24** (sovrapposte:
  qui il lato server), **D-25** (consumi e fasce), **D-26** (IVA), **D-27** (uniforme per giorno),
  **D-29** (fotovoltaico), **D-31** (unità).
- **T-7** (centesimi, micro-euro, date `YYYY-MM-DD`), **T-9** (categorie e componenti), **T-10**
  (tutte le voci), **T-11** (niente numero di fattura), **T-12** (fornitore sulla bolletta),
  **T-13** (controlli come avvisi), **T-28** (registri `feed_in` e `production`), **T-30** (C
  dell'ultima bolletta), **T-33** (identificativo normalizzato), **T-34** (niente cascade).
- Adottate qui, ribaltabili:
  (a) la decisione `replace` sostituisce **tutte** le bollette confermate della fornitura il cui
  periodo si sovrappone (non una scelta per bolletta);
  (b) il **consumo** di un mese è la somma delle quantità delle voci `commodity` nell'unità di
  consumo della fornitura (kWh, Smc, m³), ripartita per giorno; le voci `network` con m³
  (fognatura, depurazione) non contano;
  (c) le **fasce dalle letture**: se una bolletta ha letture F1, F2 e F3 ad almeno due date
  ciascuna, le quote (Δ registro ÷ Σ Δ) si applicano alle sue voci `commodity` senza fascia;
  altrimenti quelle voci vanno in `single`;
  (d) un mese è **stimato** se contiene quantità `commodity` stimate e non di ricalcolo, e nessuna
  voce `commodity` di ricalcolo di una bolletta con fine periodo successiva copre quel mese;
  (e) per le **letture** vale una sola lettura per data e registro, con priorità
  `bill_actual` > `self` > `bill_estimated`, a parità la più recente (`createdAt`); un salto
  all'indietro di un registro (contatore sostituito) interrompe la serie e quell'intervallo non
  conta;
  (f) per la luce, il consumo da letture usa F1+F2+F3 se fra le letture scelte compare uno di quei
  registri, altrimenti `single`;
  (g) l'autoconsumo del mese = Σ sui giorni in cui ci sono sia produzione sia immessa di
  (produzione − immessa), minimo 0; il consumo della casa = consumo fatturato + autoconsumo, solo
  se entrambi esistono;
  (h) a livello di casa i costi si sommano per categoria; le utenze a canone finiscono in un'unica
  categoria `flat` («Canoni e tributi»);
  (i) `deleteHouse`, `deleteSupply` e `deleteBill` restituiscono già `{ documentPathnames: string[] }`
  (sempre vuoto qui: i file arrivano con la 06, che riempie l'array senza cambiare la firma);
  (j) i registri ammessi per tipo: luce `single`, `F1`, `F2`, `F3`, `feed_in` e `production` (questi
  due solo se la fornitura ha il fotovoltaico); gas e acqua `single`; a canone nessuno.

## 4. La soluzione

### 4.1 Tipi di dominio — `src/lib/domain/types.ts` (C-6)

```ts
/**
 * The vocabulary of bills shared by the schema, the engine, the forms and the extraction.
 *
 * WARNING: a value added to one of these lists must also be handled in:
 * - src/lib/engine/supply-months.ts (cost buckets, consumption units)
 * - src/components/bills/line-templates.ts and the labels in src/lib/format.ts
 * - src/lib/extraction/prompt.ts (category mapping table)
 */
export const SUPPLY_KINDS = ['electricity', 'gas', 'water', 'telecom', 'waste'] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];

export const METERED_KINDS = ['electricity', 'gas', 'water'] as const satisfies readonly SupplyKind[];
export type MeteredKind = (typeof METERED_KINDS)[number];

export function isMetered(kind: SupplyKind): kind is MeteredKind {
  return (METERED_KINDS as readonly SupplyKind[]).includes(kind);
}

export type ConsumptionUnit = 'kWh' | 'Smc' | 'm3';
export type ReadingUnit = 'kWh' | 'm3';

export function consumptionUnitOf(kind: MeteredKind): ConsumptionUnit {
  return kind === 'electricity' ? 'kWh' : kind === 'gas' ? 'Smc' : 'm3';
}

/** Gas meters count cubic metres; the bill converts them to Smc with the coefficient C. */
export function readingUnitOf(kind: MeteredKind): ReadingUnit {
  return kind === 'electricity' ? 'kWh' : 'm3';
}

export const LINE_CATEGORIES = ['commodity', 'sale', 'network', 'system', 'excise', 'vat', 'other', 'feed_in', 'outside'] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];
export type CostCategory = Exclude<LineCategory, 'outside'>;
export const COST_CATEGORIES = LINE_CATEGORIES.filter((c): c is CostCategory => c !== 'outside');

export const LINE_COMPONENTS = ['variable', 'fixed', 'power', 'lump'] as const;
export type LineComponent = (typeof LINE_COMPONENTS)[number];

export const QUANTITY_UNITS = ['kWh', 'Smc', 'm3', 'kW', 'day', 'month', 'year', 'unit'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const BANDS = ['single', 'F1', 'F2', 'F3', 'F23'] as const;
export type Band = (typeof BANDS)[number];

export const READING_REGISTERS = ['single', 'F1', 'F2', 'F3', 'feed_in', 'production'] as const;
export type ReadingRegister = (typeof READING_REGISTERS)[number];

export const READING_SOURCES = ['bill_actual', 'bill_estimated', 'self'] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

export type BillStatus = 'confirmed' | 'replaced';
export type BillSource = 'manual' | 'extraction';

/** A calendar day, 'YYYY-MM-DD'. Periods, readings and due dates are days, not instants. */
export type IsoDate = string;
/** A calendar month, 'YYYY-MM'. */
export type MonthKey = string;

/** POD/PDR/utility codes are printed with varying spaces and dashes; compare them normalized. */
export function normalizeSupplyIdentifier(raw: string): string {
  return raw.replace(/[\s\-.]/g, '').toUpperCase();
}

export function allowedRegisters(kind: SupplyKind, hasPhotovoltaic: boolean): ReadingRegister[] {
  if (kind === 'electricity') {
    return hasPhotovoltaic ? ['single', 'F1', 'F2', 'F3', 'feed_in', 'production'] : ['single', 'F1', 'F2', 'F3'];
  }
  return isMetered(kind) ? ['single'] : [];
}
```

### 4.2 Schema — `src/lib/db/schema/app.ts` (C-2)

```ts
/**
 * App tables. Foreign keys are declared without ON DELETE CASCADE on purpose: remote Turso does
 * not enforce them, so services delete children explicitly, and local databases (which do
 * enforce them) make a forgotten delete fail in tests.
 *
 * WARNING: every table with user_id must also be deleted in src/lib/services/user-data.ts.
 */
import { type AnySQLiteColumn, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';
import type {
  Band, BillSource, BillStatus, IsoDate, LineCategory, LineComponent, QuantityUnit,
  ReadingRegister, ReadingSource, SupplyKind,
} from '@/lib/domain/types';
import { users } from './auth';

const id = () => text('id').primaryKey().$defaultFn(() => nanoid());
const userId = () => text('user_id').notNull().references(() => users.id);
const createdAt = () => integer('created_at').notNull().$defaultFn(() => Date.now());
const updatedAt = () => integer('updated_at').notNull().$defaultFn(() => Date.now()).$onUpdate(() => Date.now());

export const houses = sqliteTable('houses', {
  id: id(),
  userId: userId(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('houses_user_id_idx').on(t.userId)]);

export const supplies = sqliteTable('supplies', {
  id: id(),
  userId: userId(),
  houseId: text('house_id').notNull().references(() => houses.id),
  kind: text('kind').$type<SupplyKind>().notNull(),
  label: text('label').notNull(),
  supplierName: text('supplier_name'),
  identifier: text('identifier'),
  hasPhotovoltaic: integer('has_photovoltaic', { mode: 'boolean' }).notNull().default(false),
  archivedAt: integer('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('supplies_user_id_idx').on(t.userId),
  index('supplies_house_id_idx').on(t.houseId),
  uniqueIndex('supplies_user_identifier_uq').on(t.userId, t.identifier),
]);

export const bills = sqliteTable('bills', {
  id: id(),
  userId: userId(),
  supplyId: text('supply_id').notNull().references(() => supplies.id),
  status: text('status').$type<BillStatus>().notNull().default('confirmed'),
  replacedByBillId: text('replaced_by_bill_id').references((): AnySQLiteColumn => bills.id),
  periodStart: text('period_start').$type<IsoDate>().notNull(),
  periodEnd: text('period_end').$type<IsoDate>().notNull(),
  issueDate: text('issue_date').$type<IsoDate>(),
  dueDate: text('due_date').$type<IsoDate>(),
  supplierName: text('supplier_name'),
  offerName: text('offer_name'),
  totalCents: integer('total_cents').notNull(),
  amountDueCents: integer('amount_due_cents'),
  conversionFactor: real('conversion_factor'),
  calorificValueGj: real('calorific_value_gj'),
  isEstimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
  source: text('source').$type<BillSource>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('bills_user_id_idx').on(t.userId),
  index('bills_supply_period_idx').on(t.supplyId, t.periodStart),
]);

export const billLines = sqliteTable('bill_lines', {
  id: id(),
  userId: userId(),
  billId: text('bill_id').notNull().references(() => bills.id),
  position: integer('position').notNull(),
  description: text('description').notNull(),
  category: text('category').$type<LineCategory>().notNull(),
  component: text('component').$type<LineComponent>().notNull(),
  periodStart: text('period_start').$type<IsoDate>().notNull(),
  periodEnd: text('period_end').$type<IsoDate>().notNull(),
  quantity: real('quantity'),
  quantityUnit: text('quantity_unit').$type<QuantityUnit>(),
  unitPriceMicros: integer('unit_price_micros'),
  amountCents: integer('amount_cents').notNull(),
  band: text('band').$type<Band>(),
  isRecalculation: integer('is_recalculation', { mode: 'boolean' }).notNull().default(false),
  isEstimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
  vatRateBp: integer('vat_rate_bp'),
}, (t) => [
  index('bill_lines_user_id_idx').on(t.userId),
  index('bill_lines_bill_id_idx').on(t.billId),
]);

export const meterReadings = sqliteTable('meter_readings', {
  id: id(),
  userId: userId(),
  supplyId: text('supply_id').notNull().references(() => supplies.id),
  billId: text('bill_id').references(() => bills.id),
  readOn: text('read_on').$type<IsoDate>().notNull(),
  register: text('register').$type<ReadingRegister>().notNull(),
  value: real('value').notNull(),
  source: text('source').$type<ReadingSource>().notNull(),
  createdAt: createdAt(),
}, (t) => [
  index('meter_readings_user_id_idx').on(t.userId),
  index('meter_readings_supply_read_on_idx').on(t.supplyId, t.readOn),
  index('meter_readings_bill_id_idx').on(t.billId),
]);
```

`uniqueIndex(user_id, identifier)`: in SQLite i `NULL` sono distinti in un indice unico, quindi
più forniture senza identificativo convivono (è voluto); il servizio controlla comunque il doppione
prima dell'inserimento per dare `DUPLICATE_IDENTIFIER` invece di un errore SQL.

Poi `pnpm db:generate` → `drizzle/0001_*.sql`.

### 4.3 Date, denaro, formati (C-7, C-8)

`src/lib/domain/dates.ts`:

```ts
/**
 * Calendar-day arithmetic on 'YYYY-MM-DD' strings, done at UTC midnight so that daylight saving
 * never makes a 23- or 25-hour day. Only romeToday touches a real instant and a time zone.
 */
import type { IsoDate, MonthKey } from './types';

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export function parseIsoDate(value: IsoDate): number {
  if (!isIsoDate(value)) throw new RangeError(`Not a calendar date: ${value}`);
  return Date.parse(`${value}T00:00:00Z`);
}

function toIsoDate(utcMs: number): IsoDate {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(parseIsoDate(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` comes first). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / DAY_MS);
}

/** Days in the closed interval [start, end]; 0 when end precedes start. */
export function daysInclusive(start: IsoDate, end: IsoDate): number {
  return Math.max(0, daysBetween(start, end) + 1);
}

export function monthKeyOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

function monthParts(month: MonthKey): [number, number] {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) throw new RangeError(`Not a month: ${month}`);
  return [year, mon];
}

export function daysInMonth(month: MonthKey): number {
  const [year, mon] = monthParts(month);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

export function monthStart(month: MonthKey): IsoDate {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): IsoDate {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, mon] = monthParts(month);
  return new Date(Date.UTC(year, mon - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Every month from `from` to `to`, both included ('YYYY-MM' compares correctly as a string). */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let month = from; month <= to; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

/** The months a closed day interval touches, with the number of its days in each. */
export function eachMonthOverlap(start: IsoDate, end: IsoDate): Array<{ month: MonthKey; days: number }> {
  if (end < start) return [];
  const overlaps: Array<{ month: MonthKey; days: number }> = [];
  for (let month = monthKeyOf(start); month <= monthKeyOf(end); month = shiftMonth(month, 1)) {
    const from = start > monthStart(month) ? start : monthStart(month);
    const to = end < monthEnd(month) ? end : monthEnd(month);
    overlaps.push({ month, days: daysInclusive(from, to) });
  }
  return overlaps;
}

// 'en-CA' formats a date as YYYY-MM-DD; the Intl database owns Italy's DST rules.
const romeDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar day in Rome at an instant; pages pass Date.now(), pure code never reads the clock. */
export function romeToday(nowMs: number): IsoDate {
  return romeDateFormatter.format(new Date(nowMs));
}
```

`src/lib/domain/money.ts`:

```ts
/**
 * Integer money. Amounts are signed euro cents; unit prices are integer micro-euros per unit
 * (0,099000 €/kWh = 99000), because bills print six decimals. 1 cent = 10,000 micro-euros.
 */

/**
 * Split an integer amount over non-negative weights so that the parts add up exactly to it
 * (largest-remainder method; ties go to the earlier weight).
 */
export function allocateCentsByWeights(amountCents: number, weights: readonly number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (weights.length === 0) return [];
  if (totalWeight <= 0) throw new RangeError('allocateCentsByWeights: weights must sum to more than 0');
  const sign = amountCents < 0 ? -1 : 1;
  const absolute = Math.abs(amountCents);
  const exact = weights.map((w) => (absolute * w) / totalWeight);
  const parts = exact.map((value) => Math.floor(value));
  let remainder = absolute - parts.reduce((sum, p) => sum + p, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction) {
    if (remainder === 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    remainder -= 1;
  }
  return parts.map((part) => part * sign);
}

/** Price per unit in micro-euros, or null when there is no positive quantity to divide by. */
export function unitPriceMicros(cents: number, quantity: number | null): number | null {
  if (quantity === null || !(quantity > 0)) return null;
  return Math.round((cents * 10_000) / quantity);
}

/** A euro amount typed by a person ('12,34') → cents, or null. */
export function centsFromEuro(euro: number | null): number | null {
  return euro === null ? null : Math.round(euro * 100);
}

/** A unit price typed by a person ('0,099') → micro-euros, or null. */
export function microsFromEuro(euro: number | null): number | null {
  return euro === null ? null : Math.round(euro * 1_000_000);
}
```

(`centsFromEuro` e `microsFromEuro` ricevono un numero già letto da `parseDecimalInput`.)

`src/lib/format.ts` (l'unico punto di formattazione e lettura dei numeri):

```ts
import type { ConsumptionUnit, IsoDate, MonthKey, QuantityUnit } from '@/lib/domain/types';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const unitPrice = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const quantity = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
const day = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
const month = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', month: 'short', year: 'numeric' });

export const UNIT_LABELS: Record<QuantityUnit, string> = {
  kWh: 'kWh', Smc: 'Smc', m3: 'm³', kW: 'kW', day: 'giorni', month: 'mesi', year: 'anni', unit: 'pz',
};

export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

export function formatUnitPrice(micros: number, unit: ConsumptionUnit): string {
  return `${unitPrice.format(micros / 1_000_000)} €/${UNIT_LABELS[unit]}`;
}

export function formatQuantity(value: number, unit: QuantityUnit): string {
  return `${quantity.format(value)} ${UNIT_LABELS[unit]}`;
}

export function formatDate(date: IsoDate): string {
  return day.format(new Date(`${date}T00:00:00Z`));
}

export function formatMonth(key: MonthKey): string {
  return month.format(new Date(`${key}-01T00:00:00Z`));
}

/**
 * Read a decimal typed the Italian way or the dotted way: '1.234,56' and '1234,56' and '1234.56'
 * are all 1234.56. With a comma present, dots are thousands separators; without one, a dot is the
 * decimal point. Returns null for anything that is not a finite number.
 */
export function parseDecimalInput(text: string): number | null {
  const compact = text.replace(/\s/g, '');
  if (compact === '') return null;
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
```

### 4.4 Input della bolletta e controlli (C-9, C-10)

`src/lib/domain/bill-input.ts`:

```ts
/**
 * The one shape a bill takes on its way into the database, whether typed by hand or extracted
 * by Claude and reviewed. Amounts are net of VAT except the 'vat' lines themselves and the
 * 'outside' lines (printed as they are).
 */
import { z } from 'zod';
import { isIsoDate } from './dates';
import { BANDS, LINE_CATEGORIES, LINE_COMPONENTS, QUANTITY_UNITS, READING_REGISTERS } from './types';

const isoDate = z.string().refine(isIsoDate, { message: 'Data non valida' });
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const BillLineInputSchema = z
  .object({
    description: z.string().trim().min(1, 'Descrizione obbligatoria').max(200),
    category: z.enum(LINE_CATEGORIES),
    component: z.enum(LINE_COMPONENTS),
    periodStart: isoDate,
    periodEnd: isoDate,
    quantity: z.number().finite().nullable(),
    quantityUnit: z.enum(QUANTITY_UNITS).nullable(),
    unitPriceMicros: z.number().int().nullable(),
    amountCents: z.number().int(),
    band: z.enum(BANDS).nullable(),
    isRecalculation: z.boolean(),
    isEstimated: z.boolean(),
    vatRateBp: z.number().int().min(0).max(10_000).nullable(),
  })
  .refine((line) => line.periodStart <= line.periodEnd, {
    message: 'Il periodo della voce finisce prima di cominciare',
    path: ['periodEnd'],
  })
  .refine((line) => (line.quantity === null) === (line.quantityUnit === null), {
    message: 'Quantità e unità vanno indicate insieme',
    path: ['quantityUnit'],
  });

export const BillReadingInputSchema = z.object({
  readOn: isoDate,
  register: z.enum(READING_REGISTERS),
  value: z.number().finite().min(0),
  source: z.enum(['bill_actual', 'bill_estimated']),
});

export const BillInputSchema = z
  .object({
    supplyId: z.string().min(1),
    periodStart: isoDate,
    periodEnd: isoDate,
    issueDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),
    supplierName: optionalText(120),
    offerName: optionalText(120),
    totalCents: z.number().int(),
    amountDueCents: z.number().int().nullable(),
    conversionFactor: z.number().positive().max(2).nullable(),
    calorificValueGj: z.number().positive().max(0.1).nullable(),
    isEstimated: z.boolean(),
    lines: z.array(BillLineInputSchema).min(1, 'Serve almeno una voce').max(300),
    readings: z.array(BillReadingInputSchema).max(60),
    overlapDecision: z.enum(['sum', 'replace']).nullable(),
  })
  .refine((bill) => bill.periodStart <= bill.periodEnd, {
    message: 'Il periodo finisce prima di cominciare',
    path: ['periodEnd'],
  });

export type BillInput = z.infer<typeof BillInputSchema>;
export type BillLineInput = z.infer<typeof BillLineInputSchema>;
export type BillReadingInput = z.infer<typeof BillReadingInputSchema>;

export const SelfReadingInputSchema = z
  .object({
    supplyId: z.string().min(1),
    readOn: isoDate,
    values: z
      .array(z.object({ register: z.enum(READING_REGISTERS), value: z.number().finite().min(0) }))
      .min(1)
      .max(6),
  })
  .refine((input) => new Set(input.values.map((v) => v.register)).size === input.values.length, {
    message: 'Un registro compare due volte',
    path: ['values'],
  });

export type SelfReadingInput = z.infer<typeof SelfReadingInputSchema>;
```

`src/lib/domain/bill-checks.ts`:

```ts
/**
 * Arithmetic and overlap checks shown in the review. They warn and never block: every printed
 * line is rounded to the cent, and printed unit prices are not always reliable.
 */
import type { BillInput } from './bill-input';
import type { IsoDate } from './types';

export interface LineMismatch {
  index: number;
  expectedCents: number;
  amountCents: number;
}

export interface ArithmeticReport {
  /** Σ lines except 'outside' (VAT included): must match the bill total. */
  linesTotalCents: number;
  totalDifferenceCents: number;
  isTotalConsistent: boolean;
  /** Σ of every line: must match the amount due, when the bill prints one. */
  amountDueDifferenceCents: number | null;
  isAmountDueConsistent: boolean | null;
  lineMismatches: LineMismatch[];
}

/** Each of n lines can be off by half a cent: the tolerance grows with the line count. */
export function arithmeticTolerance(lineCount: number): number {
  return Math.max(2, Math.ceil(lineCount / 4));
}

export function checkBillArithmetic(input: Pick<BillInput, 'totalCents' | 'amountDueCents' | 'lines'>): ArithmeticReport {
  const counted = input.lines.filter((line) => line.category !== 'outside');
  const linesTotalCents = counted.reduce((sum, line) => sum + line.amountCents, 0);
  const totalDifferenceCents = linesTotalCents - input.totalCents;
  const allLinesCents = input.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const amountDueDifferenceCents = input.amountDueCents === null ? null : allLinesCents - input.amountDueCents;

  const lineMismatches: LineMismatch[] = [];
  input.lines.forEach((line, index) => {
    if (line.quantity === null || line.unitPriceMicros === null) return;
    const expectedCents = Math.round((line.quantity * line.unitPriceMicros) / 10_000);
    const tolerance = Math.max(1, Math.round(Math.abs(line.amountCents) * 0.01));
    if (Math.abs(expectedCents - line.amountCents) > tolerance) {
      lineMismatches.push({ index, expectedCents, amountCents: line.amountCents });
    }
  });

  return {
    linesTotalCents,
    totalDifferenceCents,
    isTotalConsistent: Math.abs(totalDifferenceCents) <= arithmeticTolerance(counted.length),
    amountDueDifferenceCents,
    isAmountDueConsistent:
      amountDueDifferenceCents === null ? null : Math.abs(amountDueDifferenceCents) <= arithmeticTolerance(input.lines.length),
    lineMismatches,
  };
}

export interface ExistingBillPeriod {
  id: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
}

/** Confirmed bills of the same supply whose billing period shares at least one day with this one. */
export function findOverlappingBills(
  bill: { periodStart: IsoDate; periodEnd: IsoDate; id?: string },
  existing: readonly ExistingBillPeriod[],
): ExistingBillPeriod[] {
  return existing.filter(
    (other) => other.id !== bill.id && other.periodStart <= bill.periodEnd && bill.periodStart <= other.periodEnd,
  );
}
```

(`findOverlappingBills` riceve solo bollette `confirmed`: il chiamante filtra.)

### 4.5 Il motore — `src/lib/engine/`

`src/lib/engine/types.ts`:

```ts
import type {
  Band, BillStatus, CostCategory, IsoDate, LineCategory, MonthKey, QuantityUnit, ReadingRegister,
  ReadingSource, SupplyKind,
} from '@/lib/domain/types';

export interface EngineLine {
  category: LineCategory;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  amountCents: number;
  band: Band | null;
  isRecalculation: boolean;
  isEstimated: boolean;
}

export interface EngineReading {
  readOn: IsoDate;
  register: ReadingRegister;
  value: number;
  source: ReadingSource;
  billId: string | null;
  createdAt: number;
}

export interface EngineBill {
  id: string;
  status: BillStatus;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  conversionFactor: number | null;
  lines: EngineLine[];
  readings: EngineReading[];
}

export interface SupplyMonthsInput {
  kind: SupplyKind;
  hasPhotovoltaic: boolean;
  bills: EngineBill[];
  /** Every reading of the supply: the bills' and the self readings. */
  readings: EngineReading[];
  fromMonth: MonthKey;
  toMonth: MonthKey;
}

export type CostBreakdown = Record<CostCategory, number>;

export interface SupplyMonth {
  month: MonthKey;
  /** Days of the month inside at least one confirmed bill's billing period. */
  billedDays: number;
  /** Billed consumption by competence, in the supply's consumption unit; null for flat kinds and unbilled months. */
  consumption: number | null;
  consumptionByBand: Partial<Record<Band, number>>;
  isEstimated: boolean;
  /** Consumption measured by readings on the days after the last billed day; null when none. */
  readingsConsumption: number | null;
  /** True when gas readings were converted with C = 1 because no bill gave a coefficient. */
  isReadingsConversionAssumed: boolean;
  costs: CostBreakdown;
  /** Everything paid for the supply in the month, VAT included, energy sold excluded. */
  totalCents: number;
  /** Commodity cents (net of VAT) per unit. */
  commodityUnitPriceMicros: number | null;
  /** totalCents per unit. */
  totalUnitPriceMicros: number | null;
  feedInKwh: number | null;
  productionKwh: number | null;
  selfConsumptionKwh: number | null;
  houseConsumptionKwh: number | null;
}

export function emptyCosts(): CostBreakdown {
  return { commodity: 0, sale: 0, network: 0, system: 0, excise: 0, vat: 0, other: 0, feed_in: 0 };
}
```

`src/lib/engine/readings.ts`:

```ts
/**
 * Readings → per-day consumption. A reading on day d is the counter at the end of day d, so the
 * difference between readings on d1 and d2 belongs to the days after d1 up to d2, spread evenly.
 */
import { addDays, daysBetween } from '@/lib/domain/dates';
import type { IsoDate, ReadingRegister, ReadingSource } from '@/lib/domain/types';
import type { EngineReading } from './types';

const SOURCE_PRIORITY: Record<ReadingSource, number> = { bill_actual: 0, self: 1, bill_estimated: 2 };

/** One reading per (day, register): actual beats self beats estimated; then the latest entered. */
export function pickReadings(readings: readonly EngineReading[]): EngineReading[] {
  const chosen = new Map<string, EngineReading>();
  for (const reading of readings) {
    const key = `${reading.readOn}|${reading.register}`;
    const current = chosen.get(key);
    if (
      !current ||
      SOURCE_PRIORITY[reading.source] < SOURCE_PRIORITY[current.source] ||
      (SOURCE_PRIORITY[reading.source] === SOURCE_PRIORITY[current.source] && reading.createdAt > current.createdAt)
    ) {
      chosen.set(key, reading);
    }
  }
  return [...chosen.values()].sort((a, b) => (a.readOn < b.readOn ? -1 : a.readOn > b.readOn ? 1 : 0));
}

/**
 * Per-day consumption of one register. A drop in the counter (a replaced meter) breaks the
 * series: that interval is skipped instead of producing negative consumption.
 */
export function dailyFromReadings(readings: readonly EngineReading[], register: ReadingRegister): Map<IsoDate, number> {
  const series = pickReadings(readings).filter((r) => r.register === register);
  const daily = new Map<IsoDate, number>();
  for (let i = 1; i < series.length; i++) {
    const previous = series[i - 1];
    const next = series[i];
    if (!previous || !next) continue;
    const days = daysBetween(previous.readOn, next.readOn);
    const delta = next.value - previous.value;
    if (days <= 0 || delta < 0) continue;
    for (let d = 1; d <= days; d++) daily.set(addDays(previous.readOn, d), delta / days);
  }
  return daily;
}
```

`src/lib/engine/bands.ts`:

```ts
import type { Band } from '@/lib/domain/types';
import type { EngineBill } from './types';

export type BandShares = Record<'F1' | 'F2' | 'F3', number>;

/**
 * The F1/F2/F3 split of a bill from its own readings: each register's growth over the bill's
 * readings, as a share of the total. Null unless all three registers have two dates and grew.
 * A single-rate offer still prints F1/F2/F3 readings, which is what makes the split possible.
 */
export function bandSharesOfBill(bill: Pick<EngineBill, 'readings'>): BandShares | null {
  const deltas: Partial<Record<'F1' | 'F2' | 'F3', number>> = {};
  for (const register of ['F1', 'F2', 'F3'] as const) {
    const values = bill.readings
      .filter((r) => r.register === register)
      .sort((a, b) => (a.readOn < b.readOn ? -1 : 1));
    const first = values[0];
    const last = values[values.length - 1];
    if (!first || !last || first.readOn === last.readOn) return null;
    const delta = last.value - first.value;
    if (delta < 0) return null;
    deltas[register] = delta;
  }
  const total = (deltas.F1 ?? 0) + (deltas.F2 ?? 0) + (deltas.F3 ?? 0);
  if (total <= 0) return null;
  return { F1: (deltas.F1 ?? 0) / total, F2: (deltas.F2 ?? 0) / total, F3: (deltas.F3 ?? 0) / total };
}

export function addToBand(target: Partial<Record<Band, number>>, band: Band, amount: number): void {
  target[band] = (target[band] ?? 0) + amount;
}
```

`src/lib/engine/supply-months.ts`:

```ts
/**
 * The monthly series of one supply, built from its confirmed bills and its readings.
 *
 * Design: every line is spread evenly over the days of its own competence period and summed into
 * calendar months. A recalculation line printed in September for August therefore lands in
 * August and corrects it, which is how Italian bills express adjustments (pairs of a line and its
 * "voce di ricalcolo" with opposite signs). Amounts are split with the largest-remainder method
 * so each line's months add up to its exact cents. Consumption is the commodity quantity in the
 * supply's unit; its F1/F2/F3 split comes from the line band or, failing that, from the bill's
 * own register readings.
 */
import { addDays, daysInclusive, eachMonthOverlap, monthKeyOf, monthRange } from '@/lib/domain/dates';
import { allocateCentsByWeights, unitPriceMicros } from '@/lib/domain/money';
import { type CostCategory, consumptionUnitOf, isMetered, type IsoDate, type MonthKey } from '@/lib/domain/types';
import { addToBand, bandSharesOfBill } from './bands';
import { dailyFromReadings, pickReadings } from './readings';
import { emptyCosts, type EngineBill, type SupplyMonth, type SupplyMonthsInput } from './types';

interface MonthAccumulator extends SupplyMonth {
  coveredDays: Set<IsoDate>;
  estimatedStamp: IsoDate | null;
  recalculatedStamp: IsoDate | null;
}

export function buildSupplyMonths(input: SupplyMonthsInput): SupplyMonth[] {
  const months = new Map<MonthKey, MonthAccumulator>();
  for (const month of monthRange(input.fromMonth, input.toMonth)) months.set(month, emptyMonth(month));
  const confirmed = input.bills.filter((bill) => bill.status === 'confirmed');

  for (const bill of confirmed) addBill(months, bill, input);
  if (isMetered(input.kind)) addReadingsConsumption(months, confirmed, input);
  if (input.kind === 'electricity' && input.hasPhotovoltaic) addPhotovoltaic(months, input);

  return [...months.values()].map(finishMonth);
}

function emptyMonth(month: MonthKey): MonthAccumulator {
  return {
    month,
    billedDays: 0,
    consumption: null,
    consumptionByBand: {},
    isEstimated: false,
    readingsConsumption: null,
    isReadingsConversionAssumed: false,
    costs: emptyCosts(),
    totalCents: 0,
    commodityUnitPriceMicros: null,
    totalUnitPriceMicros: null,
    feedInKwh: null,
    productionKwh: null,
    selfConsumptionKwh: null,
    houseConsumptionKwh: null,
    coveredDays: new Set(),
    estimatedStamp: null,
    recalculatedStamp: null,
  };
}

function addBill(months: Map<MonthKey, MonthAccumulator>, bill: EngineBill, input: SupplyMonthsInput): void {
  // Billing-period coverage: a day counted once even when two bills overlap.
  for (let day = 0; day < daysInclusive(bill.periodStart, bill.periodEnd); day++) {
    const date = addDays(bill.periodStart, day);
    months.get(monthKeyOf(date))?.coveredDays.add(date);
  }

  const shares = bandSharesOfBill(bill);
  const unit = isMetered(input.kind) ? consumptionUnitOf(input.kind) : null;

  for (const line of bill.lines) {
    if (line.category === 'outside') continue;
    const category: CostCategory = line.category;
    const overlaps = eachMonthOverlap(line.periodStart, line.periodEnd);
    const totalDays = overlaps.reduce((sum, o) => sum + o.days, 0);
    if (totalDays === 0) continue;
    const cents = allocateCentsByWeights(line.amountCents, overlaps.map((o) => o.days));
    const isConsumption =
      unit !== null && line.category === 'commodity' && line.quantity !== null && line.quantityUnit === unit;

    overlaps.forEach((overlap, index) => {
      const month = months.get(overlap.month);
      if (!month) return; // outside the requested range
      month.costs[category] += cents[index] ?? 0;
      if (!isConsumption || line.quantity === null) return;

      const quantity = (line.quantity * overlap.days) / totalDays;
      month.consumption = (month.consumption ?? 0) + quantity;
      if (line.band !== null) addToBand(month.consumptionByBand, line.band, quantity);
      else if (shares) {
        addToBand(month.consumptionByBand, 'F1', quantity * shares.F1);
        addToBand(month.consumptionByBand, 'F2', quantity * shares.F2);
        addToBand(month.consumptionByBand, 'F3', quantity * shares.F3);
      } else addToBand(month.consumptionByBand, 'single', quantity);

      if (line.isRecalculation) {
        if (!month.recalculatedStamp || bill.periodEnd > month.recalculatedStamp) month.recalculatedStamp = bill.periodEnd;
      } else if (line.isEstimated) {
        if (!month.estimatedStamp || bill.periodEnd > month.estimatedStamp) month.estimatedStamp = bill.periodEnd;
      }
    });
  }
}

/** Consumption measured by readings on the days after the last billed day. */
function addReadingsConsumption(months: Map<MonthKey, MonthAccumulator>, confirmed: EngineBill[], input: SupplyMonthsInput): void {
  const lastBilledDay = confirmed.reduce<IsoDate | null>((last, bill) => (!last || bill.periodEnd > last ? bill.periodEnd : last), null);
  const picked = pickReadings(input.readings);
  const usesBands = input.kind === 'electricity' && picked.some((r) => r.register === 'F1' || r.register === 'F2' || r.register === 'F3');
  const registers = usesBands ? (['F1', 'F2', 'F3'] as const) : (['single'] as const);

  let factor = 1;
  let isAssumed = false;
  if (input.kind === 'gas') {
    const withFactor = [...confirmed].filter((b) => b.conversionFactor !== null).sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];
    factor = withFactor?.conversionFactor ?? 1;
    isAssumed = !withFactor;
  }

  for (const register of registers) {
    for (const [day, amount] of dailyFromReadings(input.readings, register)) {
      if (lastBilledDay && day <= lastBilledDay) continue;
      const month = months.get(monthKeyOf(day));
      if (!month) continue;
      month.readingsConsumption = (month.readingsConsumption ?? 0) + amount * factor;
      month.isReadingsConversionAssumed = month.isReadingsConversionAssumed || isAssumed;
    }
  }
}

function addPhotovoltaic(months: Map<MonthKey, MonthAccumulator>, input: SupplyMonthsInput): void {
  const feedIn = dailyFromReadings(input.readings, 'feed_in');
  const production = dailyFromReadings(input.readings, 'production');
  for (const [day, kwh] of feedIn) {
    const month = months.get(monthKeyOf(day));
    if (month) month.feedInKwh = (month.feedInKwh ?? 0) + kwh;
  }
  for (const [day, kwh] of production) {
    const month = months.get(monthKeyOf(day));
    if (!month) continue;
    month.productionKwh = (month.productionKwh ?? 0) + kwh;
    const exported = feedIn.get(day);
    if (exported !== undefined) month.selfConsumptionKwh = (month.selfConsumptionKwh ?? 0) + (kwh - exported);
  }
}

function finishMonth(month: MonthAccumulator): SupplyMonth {
  const { coveredDays, estimatedStamp, recalculatedStamp, ...result } = month;
  result.billedDays = coveredDays.size;
  result.isEstimated = estimatedStamp !== null && !(recalculatedStamp !== null && recalculatedStamp > estimatedStamp);
  result.totalCents = Object.entries(result.costs)
    .filter(([category]) => category !== 'feed_in')
    .reduce((sum, [, cents]) => sum + cents, 0);
  result.commodityUnitPriceMicros = unitPriceMicros(result.costs.commodity, result.consumption);
  result.totalUnitPriceMicros = unitPriceMicros(result.totalCents, result.consumption);
  if (result.selfConsumptionKwh !== null) result.selfConsumptionKwh = Math.max(0, result.selfConsumptionKwh);
  result.houseConsumptionKwh =
    result.consumption !== null && result.selfConsumptionKwh !== null ? result.consumption + result.selfConsumptionKwh : null;
  return result;
}

```

`src/lib/engine/house-months.ts`:

```ts
import type { CostCategory, MonthKey, SupplyKind } from '@/lib/domain/types';
import { isMetered } from '@/lib/domain/types';
import type { SupplyMonth } from './types';

export type HouseCostCategory = CostCategory | 'flat';

export interface HouseMonth {
  month: MonthKey;
  totalCents: number;
  costs: Record<HouseCostCategory, number>;
  bySupply: Record<string, number>;
}

/** Sum the supplies of a house month by month; flat-fee supplies count as one 'flat' bucket. */
export function buildHouseMonths(supplies: ReadonlyArray<{ supplyId: string; kind: SupplyKind; months: SupplyMonth[] }>): HouseMonth[] {
  const result = new Map<MonthKey, HouseMonth>();
  for (const supply of supplies) {
    for (const month of supply.months) {
      const house = result.get(month.month) ?? {
        month: month.month,
        totalCents: 0,
        costs: { commodity: 0, sale: 0, network: 0, system: 0, excise: 0, vat: 0, other: 0, feed_in: 0, flat: 0 },
        bySupply: {},
      };
      if (isMetered(supply.kind)) {
        for (const [category, cents] of Object.entries(month.costs) as Array<[CostCategory, number]>) house.costs[category] += cents;
      } else {
        house.costs.flat += month.totalCents;
      }
      house.totalCents += month.totalCents;
      house.bySupply[supply.supplyId] = month.totalCents;
      result.set(month.month, house);
    }
  }
  return [...result.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}
```

`src/lib/engine/year-over-year.ts`:

```ts
import { shiftMonth } from '@/lib/domain/dates';
import type { MonthKey } from '@/lib/domain/types';
import type { SupplyMonth } from './types';

export function yearOverYear(months: readonly SupplyMonth[], month: MonthKey) {
  const byMonth = new Map(months.map((m) => [m.month, m]));
  return { current: byMonth.get(month) ?? null, previous: byMonth.get(shiftMonth(month, -12)) ?? null };
}

export interface PeriodTotals {
  consumption: number | null;
  totalCents: number;
  monthsWithBills: number;
}

/** The 12 months ending at endMonth against the 12 before them. */
export function rolling12(months: readonly SupplyMonth[], endMonth: MonthKey): { last12: PeriodTotals; previous12: PeriodTotals } {
  const sum = (from: MonthKey, to: MonthKey): PeriodTotals => {
    const inRange = months.filter((m) => m.month >= from && m.month <= to);
    const withConsumption = inRange.filter((m) => m.consumption !== null);
    return {
      consumption: withConsumption.length ? withConsumption.reduce((s, m) => s + (m.consumption ?? 0), 0) : null,
      totalCents: inRange.reduce((s, m) => s + m.totalCents, 0),
      monthsWithBills: inRange.filter((m) => m.billedDays > 0).length,
    };
  };
  return {
    last12: sum(shiftMonth(endMonth, -11), endMonth),
    previous12: sum(shiftMonth(endMonth, -23), shiftMonth(endMonth, -12)),
  };
}
```

`src/lib/engine/index.ts` riesporta `buildSupplyMonths`, `buildHouseMonths`, `yearOverYear`,
`rolling12`, `bandSharesOfBill`, `pickReadings`, `dailyFromReadings` e i tipi (C-11).

### 4.6 Repository (C-12) — `src/lib/db/repositories/`

Tutte le funzioni hanno `(db: Db, userId: string, …)`; `userId` in ogni `WHERE`. Le funzioni che
preparano una scrittura per un `db.batch` restituiscono la query **non eseguita** e hanno il
suffisso `Query`.

- `houses.ts`: `listHouses(db, userId)`, `getHouse(db, userId, houseId)` (`null` se manca),
  `insertHouseQuery(db, userId, values: { id: string; name: string })`,
  `renameHouseQuery(db, userId, houseId, name)`, `deleteHouseQuery(db, userId, houseId)`.
- `supplies.ts` (esporta `SupplyRow = typeof supplies.$inferSelect`; `houses.ts` esporta
  `HouseRow`, `bills.ts` `BillRow` e `BillLineRow`, `readings.ts` `ReadingRow`): `listSupplies(db, userId, { houseId?: string; includeArchived?: boolean })`,
  `getSupply(db, userId, supplyId)`, `getSupplyByIdentifier(db, userId, identifier)`,
  `insertSupplyQuery(db, userId, values)`, `updateSupplyQuery(db, userId, supplyId, patch)`,
  `deleteSuppliesQuery(db, userId, supplyIds: string[])`.
- `bills.ts`: `listBills(db, userId, { supplyId?: string; limit: number; offset: number })`
  (ordinate per `periodEnd` decrescente), `getBill(db, userId, billId)`,
  `listBillPeriods(db, userId, supplyId)` (solo `confirmed`: `{ id, periodStart, periodEnd }`),
  `listBillIdsOfSupplies(db, userId, supplyIds)`, `listEngineBills(db, userId, supplyId)` (bollette
  con voci e letture già nella forma `EngineBill`, due query: bollette+voci e letture),
  `insertBillQuery`, `updateBillQuery`, `insertBillLinesQuery(db, userId, billId, lines)`,
  `deleteBillLinesQuery(db, userId, billIds)`, `markReplacedQuery(db, userId, billIds, byBillId)`,
  `restoreReplacedQuery(db, userId, byBillIds)` (riporta a `confirmed` e azzera
  `replaced_by_bill_id`), `deleteBillsQuery(db, userId, billIds)`, `listBillLines(db, userId, billId)`.
- `readings.ts`: `listReadings(db, userId, { supplyId?: string; limit: number })`,
  `listEngineReadings(db, userId, supplyId)`, `insertReadingsQuery(db, userId, rows)`,
  `deleteReadingsOfBillsQuery(db, userId, billIds)`, `deleteReadingsOfSuppliesQuery(db, userId,
  supplyIds)`, `getReading(db, userId, readingId)`, `deleteReadingQuery(db, userId, readingId)`.

Un `db.batch([])` con lista vuota non si chiama: i servizi saltano la chiamata.

### 4.7 Servizi (C-13) — `src/lib/services/`

`houses-supplies.ts`:

- `createHouse(db, userId, { name })` → `{ houseId }` (nome 1–60 caratteri, `VALIDATION`).
- `renameHouse(db, userId, houseId, name)`; `NOT_FOUND` se la casa non è dell'utente.
- `deleteHouse(db, userId, houseId)` → `{ documentPathnames: string[] }`: in un batch, nell'ordine:
  letture delle forniture della casa, voci delle loro bollette, azzeramento di
  `replaced_by_bill_id` su quelle bollette, bollette, forniture, casa.
- `createSupply(db, userId, input: { houseId; kind; label; supplierName; identifier; hasPhotovoltaic })`
  → `{ supplyId }`: casa dell'utente (`NOT_FOUND`), etichetta 1–60, identificativo normalizzato
  (`normalizeSupplyIdentifier`, `null` se vuoto), doppione → `DUPLICATE_IDENTIFIER`;
  `hasPhotovoltaic` vero solo per la luce (`VALIDATION` altrimenti).
- `updateSupply(db, userId, supplyId, patch: { houseId?; label?; supplierName?; identifier?;
  hasPhotovoltaic? })`: il tipo non cambia mai; stessi controlli.
- `archiveSupply(db, userId, supplyId, { archived: boolean; now: number })`: `archivedAt = archived ? now : null`.
- `deleteSupply(db, userId, supplyId)` → `{ documentPathnames: string[] }`: come `deleteHouse` per
  una fornitura.

`bills.ts`:

```ts
export interface ConfirmBillOptions {
  source: BillSource;
  /** Present when an existing bill is being edited: its lines and readings are replaced. */
  billId?: string;
}

export async function confirmBill(db: Db, userId: string, rawInput: unknown, options: ConfirmBillOptions): Promise<{ billId: string; replacedBillIds: string[] }>;
```

Passi, nell'ordine:
1. `BillInputSchema.safeParse(rawInput)`; errore → `DomainError('VALIDATION', undefined, error.issues)`.
2. `getSupply` → `NOT_FOUND`. Se `options.billId`: `getBill` → `NOT_FOUND` se manca o se è di
   un'altra fornitura.
3. `assertInputFitsSupply(supply, input)` (funzione pura esportata dallo stesso file per i test):
   - fornitura a canone: nessuna lettura; nessuna voce con `quantityUnit` in `kWh | Smc | m3`;
   - fornitura a contatore: almeno una voce `commodity` con quantità nell'unità di consumo
     (`consumptionUnitOf`); ogni voce `commodity` con quantità usa quell'unità; ogni lettura usa un
     registro di `allowedRegisters(kind, hasPhotovoltaic)`;
   - `conversionFactor` e `calorificValueGj` solo per il gas (altrimenti devono essere `null`);
   - violazioni → `VALIDATION` con un elenco di messaggi italiani in `details`.
4. `findOverlappingBills(input + id, await listBillPeriods(...))`; se non vuoto e
   `input.overlapDecision === null` → `DomainError('OVERLAP_DECISION_REQUIRED', undefined, overlaps)`.
5. Batch: per la modifica `deleteBillLinesQuery` + `deleteReadingsOfBillsQuery` sul `billId` e
   `updateBillQuery`; per la nuova `insertBillQuery` con `id = nanoid()`; poi
   `insertBillLinesQuery` (posizione = indice), `insertReadingsQuery` (letture della bolletta con
   `billId`), e con `replace` `markReplacedQuery(overlaps, billId)`.
6. Restituisce `{ billId, replacedBillIds }` (vuoto con `sum` o senza sovrapposizioni).

- `deleteBill(db, userId, billId)` → `{ documentPathnames: string[] }`: batch con
  `restoreReplacedQuery([billId])`, `deleteReadingsOfBillsQuery`, `deleteBillLinesQuery`,
  `deleteBillsQuery`.
- `getBillDetail(db, userId, billId)` → `{ bill, supply, lines, readings }` o `NOT_FOUND`.
- `listBills(db, userId, { supplyId?, page })` → 50 per pagina.

`readings.ts`:
- `createSelfReadings(db, userId, rawInput)` → `{ readingIds }`: `SelfReadingInputSchema`,
  fornitura dell'utente e a contatore, registri ammessi (`allowedRegisters`), righe con
  `source: 'self'`, `billId: null`.
- `deleteReading(db, userId, readingId)`: solo `source === 'self'`, altrimenti `VALIDATION` («Le
  letture di una bolletta si cambiano modificando la bolletta.»).
- `listReadings(db, userId, { supplyId?, limit = 100 })`.

`user-data.ts` (sostituisce il corpo della 01):

```ts
export async function deleteAllUserData(db: Db, userId: string): Promise<void> {
  await db.batch([
    db.delete(meterReadings).where(eq(meterReadings.userId, userId)),
    db.delete(billLines).where(eq(billLines.userId, userId)),
    db.update(bills).set({ replacedByBillId: null }).where(eq(bills.userId, userId)),
    db.delete(bills).where(eq(bills.userId, userId)),
    db.delete(supplies).where(eq(supplies.userId, userId)),
    db.delete(houses).where(eq(houses.userId, userId)),
  ]);
}
```

### 4.8 Errori

`src/lib/errors.ts` non cambia (i codici servono già tutti).

### 4.9 Dati seed (C-21) — `scripts/seed-data.ts`

`seedDatabase` della 01 aggiunge, dopo gli utenti e solo se l'utente non ha case:

- **Seed A** — casa «Casa Fenicottero» con quattro forniture:
  - «Luce» (`electricity`, fornitore «Fenicottero Energia», identificativo `IT001E00000001`,
    senza fotovoltaico): 14 bollette mensili da 13 mesi fa al mese scorso (periodo dal primo
    all'ultimo del mese), ognuna con: `commodity` 200 kWh × 100000 µ€ = 2000 cent (offerta
    monoraria, `band: null`), `sale` fissa 600, `network` 800, `system` 500, `excise` 400, `vat`
    430, `outside` «Canone TV» 900 solo a gennaio; totale = somma; letture `bill_actual` F1/F2/F3
    all'ultimo giorno del mese precedente e del mese, che crescono di 80/60/60 kWh al mese (quote
    40% / 30% / 30%). Il mese più vecchio ha la voce `commodity` con `isEstimated: true`, e la
    bolletta successiva aggiunge per quel mese la coppia di ricalcolo (+200 kWh/+2000 cent e
    −200 kWh/−2000 cent con `isRecalculation: true`).
  - «Gas» (`gas`, «Fenicottero Energia», `00000000000001`): 14 bollette mensili con `commodity`
    50 Smc × 500000 µ€ = 2500 cent d'inverno (ott–mar) e 10 Smc × 500000 = 500 cent d'estate,
    `sale` 700, `network` 600, `system` −100, `excise` 300 (inverno) / 100 (estate), `vat` 400;
    `conversionFactor: 1`, `calorificValueGj: 0.03852`; letture `single` in m³ coerenti.
  - «Acqua» (`water`, «Ornitorinco Acque», nessun identificativo): 5 bollette trimestrali con
    `commodity` 30 m³ × 1000000 µ€ = 3000 cent, `network` 1500, `system` 200, `vat` 470.
  - «Internet» (`telecom`, «Quokka Telecomunicazioni»): 14 bollette mensili, «Canone» 2500 +
    «IVA» 550.
  - due autoletture `self` della luce (F1/F2/F3) a 10 e 20 giorni dopo l'ultima bolletta.
- **Seed B** — casa «Casa Ornitorinco» con una «Luce» (`IT001E00000002`) e 2 bollette mensili
  uguali a quelle di A.

Le date si calcolano da `romeToday(Date.now())` al momento del seed (gli script possono leggere
l'orologio; i moduli puri no). `scripts/seed-data.ts` esporta la funzione pura
`buildSeedBills(kind, months: MonthKey[]): BillInput[]` (testata in § 6) e `seed.ts` la usa con
`confirmBill`.

## 5. Vincoli e trappole

- **AGENTS.md § 2.1 Layers** — qui vuol dire che `src/lib/engine/*` e `src/lib/domain/*` non
  importano Drizzle, `next/*` né leggono l'orologio; i repository non decidono niente (niente
  controllo di sovrapposizione lì); i servizi ricevono `db` come primo parametro.
- **AGENTS.md § 2.4 Isolation** — ogni repository ha `(db, userId, …)` e `userId` in ogni WHERE,
  compresi gli `UPDATE` e i `DELETE` dei batch; `scope.test.ts` lo controlla.
- **AGENTS.md § 2.5 Money and dates** — niente `float` sul denaro; nessuna divisione per 100 nei
  componenti (sarà la 03 a usare `format.ts`); date di calendario come stringhe, mai `new Date()`
  locale per un periodo.
- **AGENTS.md § 2.6 Foreign keys** — nessun `onDelete` sulle tabelle dell'app; ordine dei batch
  da figlio a padre; `replaced_by_bill_id` azzerato prima di cancellare le bollette.
- Drizzle `db.batch` su libSQL è una transazione implicita: o tutto o niente. Le transazioni
  interattive (`db.transaction`) non si usano (lock di 5 s su Turso).
- `real` per le quantità: `0.1 + 0.2` non è `0.3`; i test sulle quantità usano `toBeCloseTo`, quelli
  sul denaro `toBe`.

## 6. Test

Tutti con numeri inventati e tondi (WORKFLOW § 1.6).

| Livello | Test | Mutazione che lo prova portante |
|---|---|---|
| Unit | `dates.test.ts`: `daysInclusive('2026-03-28','2026-03-30') === 3` attraverso il cambio dell'ora; `eachMonthOverlap('2026-01-20','2026-03-05')` → gen 12, feb 28, mar 5; `monthRange('2025-11','2026-02')` → 4 mesi; `romeToday(Date.parse('2026-03-31T22:30:00Z')) === '2026-04-01'`; `isIsoDate('2026-02-30') === false`. | Calcolare i giorni con l'ora locale → il caso del cambio d'ora fallisce. |
| Unit | `money.test.ts`: `allocateCentsByWeights(100, [1,1,1])` → `[34,33,33]` (somma 100); `(-100, [1,1,1])` → `[-34,-33,-33]`; `(7, [31,30])` → somma 7; pesi a somma 0 → errore; `unitPriceMicros(2000, 200) === 100000`; `unitPriceMicros(5, 0) === null`; `microsFromEuro(0.099) === 99000`. | Usare `Math.round` per ogni parte invece del resto più grande → la somma di `[1,1,1]` non è 100. |
| Unit | `format.test.ts`: `parseDecimalInput('1.234,56') === 1234.56`, `('1234.56') === 1234.56`, `('-3,5') === -3.5`, `('12a') === null`, `('') === null`; `formatEuro(123456)` contiene `1234,56` (anche come `1.234,56`) ed `€`; `formatUnitPrice(99000, 'kWh') === '0,0990 €/kWh'`. | Non togliere i punti quando c'è la virgola → il primo caso fallisce. |
| Unit | `bill-input.test.ts`: periodo invertito → errore su `periodEnd`; voce con quantità e senza unità → errore; `SelfReadingInputSchema` con due `F1` → errore. | Togliere la seconda `refine` della voce → il caso quantità senza unità passa. |
| Unit | `bill-checks.test.ts`: voci 1000 + 500 + 150 (IVA) + 900 (`outside`) con totale 1650 → coerente; totale 1660 → `totalDifferenceCents: -10`, incoerente (tolleranza 2); `amountDueCents` 2550 → coerente; voce 30/365 × 40.000.000 µ€/anno con importo 329 → nessuna discrepanza; 4 × 99000 µ€ con importo 1000 → discrepanza (atteso 40); sovrapposizioni: 01/09–30/09 contro 01/08–31/08 no, contro 15/09–14/10 sì, contro se stessa (stesso `id`) no. | Includere le voci `outside` nel totale bolletta → il primo caso diventa incoerente. |
| Unit | `readings.test.ts`: due letture `bill_actual` e `self` sulla stessa data e registro → resta `bill_actual`; due `self` → la più recente; 31/08=1000 e 30/09=1300 → 30 giorni da 10; contatore che scende → nessun giorno. | Invertire la priorità `self`/`bill_actual` → il primo caso fallisce. |
| Unit | `bands.test.ts`: letture F1 100→180, F2 100→160, F3 100→160 → quote 0,4/0,3/0,3; un registro con una sola data → `null`. | Usare il valore finale invece del delta → quote sbagliate. |
| Unit | `supply-months.test.ts` — **luce mensile**: una bolletta 01/09–30/09 con `commodity` 200 kWh/2000, `vat` 430 ecc. → settembre `consumption 200`, `commodityUnitPriceMicros 100000`, `totalUnitPriceMicros` = totale × 10.000 / 200, `billedDays 30`; letture F1/F2/F3 → `consumptionByBand` 80/60/60. | Ripartire per mese invece che per giorno → il caso bimestrale (sotto) fallisce. |
| Unit | `supply-months.test.ts` — **acqua bimestrale**: 01/01–28/02 con 59 m³/5900 cent → gennaio 31 m³/3100, febbraio 28 m³/2800. | Idem. |
| Unit | `supply-months.test.ts` — **gas con ricalcolo**: bolletta di agosto con 10 Smc stimati (`isEstimated`), bolletta di settembre con 20 Smc di settembre e, per agosto, +12/−10 Smc e +600/−500 cent di ricalcolo → agosto `consumption 12`, `isEstimated false`; senza la bolletta di settembre agosto è `isEstimated true`. | Attribuire le voci al periodo della bolletta invece che al loro → agosto resta 10. |
| Unit | `supply-months.test.ts` — **sostituita**: due bollette sovrapposte, una `replaced` → conta solo l'altra. | Non filtrare `status` → il consumo raddoppia. |
| Unit | `supply-months.test.ts` — **letture dopo l'ultima bolletta (gas)**: ultima bolletta fino al 30/09 con C = 1,02 e lettura 7000 m³ al 30/09; autolettura 7100 al 10/10 → ottobre `readingsConsumption ≈ 102`; senza C → 100 e `isReadingsConversionAssumed`. | Non escludere i giorni già fatturati → settembre riceve consumo da letture. |
| Unit | `supply-months.test.ts` — **fotovoltaico**: `feed_in` 0→300 e `production` 0→500 su settembre → `feedInKwh 300`, `productionKwh 500`, `selfConsumptionKwh 200`, `houseConsumptionKwh` = fatturato + 200. | Sommare la produzione all'immessa invece di sottrarre → 800. |
| Unit | `supply-months.test.ts` — **a canone**: «Canone» 2500 + «IVA» 550 → `totalCents 3050`, `consumption null`, prezzi `null`. | Calcolare il consumo anche per le utenze a canone → non è `null`. |
| Unit | `house-months.test.ts`: luce 3000 e internet 3050 nello stesso mese → `totalCents 6050`, `costs.flat 3050`. | Mettere il canone nelle categorie → `flat` resta 0. |
| Unit | `year-over-year.test.ts`: 24 mesi → `rolling12` somma i due anni separatamente; `yearOverYear('2026-09')` restituisce settembre 2025 come `previous`. | `shiftMonth(-11)` al posto di `-12` per il precedente → fallisce. |
| Integrazione | `bills.test.ts`: conferma (righe in `bills`, `bill_lines`, `meter_readings`); fornitura di un altro utente → `NOT_FOUND` (coppia: la propria passa); sovrapposizione senza decisione → `OVERLAP_DECISION_REQUIRED` con l'`id`; `replace` → la vecchia è `replaced`; `deleteBill` della nuova → la vecchia torna `confirmed`; modifica (`billId`) sostituisce voci e letture; gas con lettura `F1` → `VALIDATION`; internet con una voce in kWh → `VALIDATION`. | Togliere `userId` dal `WHERE` di `getSupply` → il caso «altro utente» conferma. |
| Integrazione | `houses-supplies.test.ts`: identificativo `it 001 e 0000-0001` salvato come `IT001E00000001`; doppione → `DUPLICATE_IDENTIFIER`; fotovoltaico sul gas → `VALIDATION`; `deleteHouse` con forniture, bollette e letture → nessun errore con le foreign key accese e nessuna riga rimasta; un'altra casa dello stesso utente intatta. | Togliere dal batch la cancellazione delle letture → la cancellazione fallisce (foreign key). |
| Integrazione | `readings.test.ts` (servizio): autolettura su una fornitura a canone → `VALIDATION`; `production` senza fotovoltaico → `VALIDATION`; cancellare una lettura `bill_actual` → `VALIDATION`. | Saltare `allowedRegisters` → passano. |
| Integrazione | `user-data.test.ts` e il caso aggiunto in `create-auth.test.ts`: un utente con una bolletta → `deleteAllUserData` e poi `deleteUser` non falliscono; le righe dell'altro utente restano. | Togliere `bill_lines` dal batch → foreign key. |
| Unit | `seed-data.test.ts`: `buildSeedBills('electricity', 14 mesi)` → 14 input validi per `BillInputSchema`, ognuno coerente per `checkBillArithmetic`. | Sbagliare il totale di una bolletta → `isTotalConsistent` falso. |

## 7. Collaudo guidato (WORKFLOW.md § 2)

- **A — Invarianza**: `pnpm test:e2e` della 01 resta verde (accesso, registrazione chiusa).
- **C — Comportamento nuovo**: i cinque comandi verdi. Poi `pnpm db:migrate && pnpm db:seed` su
  `local.db`. Esito atteso: «seed: 2 utenti, 2 case, 5 forniture, 49 bollette» (14 + 14 + 5 + 14 +
  2) al primo giro, «0 nuove» al secondo.
- **D — Sotto la UI**: uno script usa e getta (`tsx`, non tracciato) chiama
  `listEngineBills` + `listEngineReadings` + `buildSupplyMonths` per la «Luce» di seed A e stampa gli ultimi 3 mesi. Esito
  atteso, dichiarato prima: 200 kWh al mese, quote fasce 80/60/60, `commodityUnitPriceMicros
  100000`; il mese più vecchio non è stimato (c'è il ricalcolo). Lo stesso script prova
  `getSupply` di seed B con l'utente A → `null`.
- **E — Casi negativi**: coperti dai test di integrazione; si citano.
- **F — Giro guidato**: non c'è UI; `pnpm db:studio` per mostrare all'owner le tabelle con i dati
  seed (5 minuti, facoltativo).
- **G — Ripristino**: lo script usa e getta si cancella; i dati seed restano in `local.db` (servono
  alla 03).

## 8. Messa in esercizio

- DDL: `drizzle/0001_*.sql`, in locale con `pnpm db:migrate`; in produzione lo applica la 05.
- Variabili: nessuna nuova.
- Misura di chiusura: il collaudo § 7 C e D. In esercizio = PR mergiata + collaudo annotato.

## 9. Documentazione

- `CLAUDE.md`: Latest; § Architecture Snapshot (motore e modello: una riga ciascuno); § Key
  Features: la riga del modello e dei calcoli punta a `doc/guide/calcoli.md`; § Not yet present:
  via «App tables: born in spec 02».
- **`doc/guide/calcoli.md`** (nasce qui, ≤ 300 righe): la tassonomia delle voci con esempi
  inventati, la competenza e i ricalcoli, le fasce dalle letture, i mesi stimati, i due costi
  unitari, letture e gas × C, fotovoltaico, la casa e la categoria `flat`; ogni regola con il file
  che la implementa.
- `AGENTS.md`: § 3 (Domain model, stub di 8 righe che rimanda alla guida), § 2.5 confermato con i
  nomi reali (`format.ts`, `money.ts`, `dates.ts`).

## 10. Fuori ambito, dichiarato

- Pagine, moduli, componenti → **03**; grafici → **04**.
- File su Blob e `documentPathnames` pieni → **06**.
- Riferimenti di mercato → **08**.
- Profili di prelievo stagionali per il gas (scartati da D-27) → CLAUDE.md § Not yet present.
- Lo storico dei consumi stampato in bolletta (D-20) → nessun erede (decisione).

## 11. Prompt per implementarla

Modello: Claude Opus 5.5, effort high. Taglia: **L** (schema + motore + servizi + molti test).

```
Ciao, in questa sessione implemento la spec doc/v1/02-modello-dei-dati-e-motore-dei-calcoli.md.

Contesto, prima di toccare qualsiasi file:
- Leggi WORKFLOW.md (regole di sessione e collaudo; § 3 dice come si applicano qui)
- Leggi AGENTS.md (CLAUDE.md è già nel contesto)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue
- Leggi doc/v1/00-INDICE.md per intero (decisioni D-22…D-31, scelte T-7, T-9…T-13, T-28, T-30,
  T-33, T-34, contratti C-2, C-6…C-13, C-21, regole della serie) e poi la spec 02 INTERA
- Controlla con un grep che i contratti della 01 che la spec usa (C-1, C-3, C-4, C-5) esistano
  con quei nomi e quelle firme

Prima della prima modifica: `git branch --show-current` deve dire main; crea
feature/02-data-engine. Crea SESSION_NOTES.md.

Implementa la spec 02 esattamente come scritta: § 4 è il codice, § 6 i test con le mutazioni
che li provano portanti, § 7 il collaudo (fase per fase, esito atteso prima), § 9 la
documentazione (nasce doc/guide/calcoli.md). Non decidere nulla che la spec ha già deciso; se
trovi un punto che la spec non copre, fermati e chiedimelo con AskUserQuestion. Le etichette
della serie (D-N, T-N, C-N, «spec 02») non entrano nel codice.

Alla fine: riassumi il diff, scrivi lo stato nella riga «Stato» della spec e in § 5
dell'indice, aggiorna CLAUDE.md → Latest, poi chiedimi l'OK per il commit (uno solo).
```
