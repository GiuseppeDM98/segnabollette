# Calculations — the data model and the engine

> Domain guide (born 2026-10-24 with the data model). AGENTS.md § 3 keeps a stub that points
> here. Every rule names the file that implements it; when the code and this page disagree, the
> code is right and this page is fixed in the same change. All figures below are invented.

## 1. The model

One set of tables for every utility (`src/lib/db/schema/app.ts`, migration `drizzle/0001_*.sql`):

```
houses ─┬─ supplies ─┬─ bills ─── bill_lines
        │            │      └──── meter_readings (bill_id set: printed on the bill)
        │            └─────────── meter_readings (bill_id null: self readings)
```

- **Supply**: `kind` is `electricity | gas | water | telecom | waste`; the first three are
  *metered* (`METERED_KINDS`, `isMetered` in `src/lib/domain/types.ts`), the last two are flat
  fees (cost only, no consumption). `identifier` is the POD/PDR/utility code, normalized by
  `normalizeSupplyIdentifier` (upper case, no spaces, dashes or dots: `it 001 e 0000-0001` →
  `IT001E00000001`) and unique per user (`supplies_user_identifier_uq`; several supplies without
  an identifier coexist because SQLite treats NULLs as distinct). The supplier and the offer live
  on the bill: a change of supplier on the same POD/PDR is the same supply.
- **Bill**: billing period, totals, gas `conversionFactor` (C) and `calorificValueGj` (PCS),
  `status` `confirmed | replaced`, `source` `manual | extraction` (fixed at birth). No invoice
  number and no customer code are stored.
- **Bill line**: every printed line, not only the totals, each with **its own competence
  period**, quantity and unit, unit price, amount, band, `isRecalculation`, `isEstimated` and VAT
  rate.
- **Reading**: a cumulative counter value of one register on one day, with its `source`
  (`bill_actual`, `bill_estimated`, `self`).

Units (`src/lib/domain/money.ts`, `src/lib/domain/dates.ts`, `src/lib/format.ts`): money in
signed integer cents, unit prices in integer micro-euros (0,099000 €/kWh = 99000), quantities as
`real`, calendar days as `YYYY-MM-DD` with UTC-midnight arithmetic. Amounts are net of VAT except
the `vat` lines and the `outside` lines.

No foreign key cascades on these tables (AGENTS.md § 2.6): `deleteHouse`, `deleteSupply` and
`deleteBill` (`src/lib/services/houses-supplies.ts`, `bills.ts`) delete children first in one
`db.batch`, archived supplies and replaced bills included; `deleteAllUserData`
(`src/lib/services/user-data.ts`) does the same for a whole account.

## 2. Line taxonomy (`LINE_CATEGORIES`, `LINE_COMPONENTS` in `src/lib/domain/types.ts`)

| Category | What goes there | Invented example |
|---|---|---|
| `commodity` | The price of the energy, gas or water itself, per unit | «Energia» 200 kWh × 0,100000 € = 20,00 € |
| `sale` | The rest of the sale: marketing, dispatching, losses | «Commercializzazione» 6,00 € |
| `network` | Transport, distribution, metering; water sewerage and treatment | «Trasporto e gestione del contatore» 8,00 € |
| `system` | General system charges; water equalization components | «Oneri di sistema» −1,00 € (can be negative) |
| `excise` | Excise duties and surtaxes | «Accise» 4,00 € |
| `vat` | VAT, one line per rate | «IVA 10%» 4,30 € |
| `other` | Bonuses, interest, rounding, discounts | «Arrotondamento» 0,01 € |
| `feed_in` | Credit for energy fed into the grid (negative) | «Energia ceduta» −5,00 € |
| `outside` | Outside the bill total but in the amount due | «Canone TV» 9,00 € |

Component: `variable` (per unit consumed), `fixed` (per day/month/year, e.g. «30/365 × 40,00
€/anno»), `power` (per kW), `lump` (a plain amount). `CostCategory` is every category but
`outside`.

## 3. Checks before saving

- **Arithmetic** (`checkBillArithmetic` in `src/lib/domain/bill-checks.ts`) only warns: Σ lines
  except `outside` against the bill total and Σ of all lines against the amount due, tolerance
  `max(2, ⌈n/4⌉)` cents with n lines; quantity × unit price against each line's amount, tolerance
  max(1 cent, 1%). Printed unit prices are not reliable (a real bill prints 0,000000 €/kWh next
  to a non-zero excise amount), amounts are.
- **Fit with the supply** (`assertInputFitsSupply` in `src/lib/services/bills.ts`) blocks with a
  `VALIDATION` listing every Italian sentence at once: a metered supply needs at least one
  commodity line in its unit (kWh, Smc, m³) and no commodity quantity in another unit; readings
  only on the registers of `allowedRegisters(kind, hasPhotovoltaic)`; a flat fee has no readings
  and no kWh/Smc/m³ quantity; a `band` only on electricity; C and PCS only on gas.
- **Zod messages** are Italian: `src/lib/domain/bill-input.ts` sets `z.config(z.locales.it())`,
  and every `VALIDATION` carries `details: string[]` (`issue.message`, never the raw issues).
- **Self readings** (`createSelfReadings` in `src/lib/services/readings.ts`): metered supplies
  only, allowed registers only, never after `today` (the caller passes
  `romeToday(Date.now())`); bill dates stay free.
- **Houses and supplies** (`src/lib/services/houses-supplies.ts`): names and labels are trimmed,
  then must be 1–60 characters; a blank supplier name is stored as null; the label and
  photovoltaic errors come together in one `VALIDATION`, checked before the duplicate identifier
  (`DUPLICATE_IDENTIFIER`); the kind of a supply never changes; an empty patch writes nothing.

## 4. Overlapping and replaced bills (`src/lib/services/bills.ts`)

A bill whose period shares a day with a **confirmed** bill of the same supply
(`findOverlappingBills` over `listBillPeriods`) needs `overlapDecision`, otherwise
`OVERLAP_DECISION_REQUIRED` with the overlapping periods in `details`:

- `sum`: both stay confirmed (an adjustment bill adds to the months it covers);
- `replace`: **every** overlapping confirmed bill becomes `replaced` with
  `replaced_by_bill_id` = the new bill. A replaced bill stays archived but leaves the figures,
  and so do the readings it printed.

A replaced bill is never edited (`VALIDATION` «Una bolletta sostituita non si modifica…»): one
deletes it, or the bill that replaced it. Then:

| Action on R (the replacing bill) | What happens to the bills R had replaced |
|---|---|
| Delete R, R confirmed | back to `confirmed` (`restoreReplacedQuery`) |
| Delete R, R itself replaced by S | handed over to S, still `replaced` (`reassignReplacedQuery`) |
| Edit R's period | those the new period no longer touches come back `confirmed` in the same batch (`restoreBillsQuery`); the others stay replaced by R |

Editing replaces the lines and readings of the bill and updates only the fields that come from
`BillInput`: `source`, `status`, the replacement link and the supply never change.
`getBillDetail` returns the lines by `position` and the readings by day, then register
(`listBillReadings` in `src/lib/db/repositories/readings.ts`); `listBills` pages by 50, newest
`periodEnd` first.

## 5. Competence and recalculations (`src/lib/engine/supply-months.ts`)

`buildSupplyMonths` spreads **every line evenly over the days of its own period** and sums the
days into calendar months. Amounts are split with `allocateCentsByWeights` (largest remainder),
so each line's months add up to its exact cents; quantities are split pro rata as `real`.

A gas bill for September may re-bill August line by line: «Gas» +12 Smc and «Gas (voce di
ricalcolo)» −10 Smc, both with August as their period and `isRecalculation`. Those lines land in
August, which becomes 10 (estimated) + 12 − 10 = 12 Smc. The month a line lands in depends only on
its own period; the bill that printed it matters only for its status (a replaced bill leaves the
figures), the band split of § 6 and the estimate stamps of § 7.

## 6. Consumption and bands (`addBill` in `src/lib/engine/supply-months.ts`)

- **Consumption** of a month = Σ of the `commodity` quantities in the supply's consumption unit
  (`consumptionUnitOf`: kWh, Smc, m³), spread by day. Water `network` lines in m³ (sewerage,
  treatment) do not count.
- **Bands**: a commodity line with a `band` goes to that band. A line without a band takes the
  split of its bill's own readings (`bandSharesOfBill` in `src/lib/engine/bands.ts`): if F1, F2
  and F3 each have readings on two different days, none went down and together they grew, the
  shares are Δ register ÷ Σ Δ (80/60/60 kWh → 40/30/30%; a register that stayed still gets 0);
  otherwise the line goes to `single`. Single-rate offers still print F1/F2/F3 readings: that is
  what makes the split possible.
- **`hasCommodityBands`** is true only when a commodity line in the consumption unit spread over
  the month has an F1/F2/F3/F23 band. A single-rate offer split from its readings stays false, so
  market references compare it with the single-rate price; the band split is shown, the offer is
  not called banded.

## 7. Estimated months (`stampMonth`, `finishMonth` in `src/lib/engine/supply-months.ts`)

Each commodity line leaves at most one stamp, equal to the **end of its bill's period**, on the
months it touches:

- `isEstimated` with quantity > 0 (recalculation or not) → stamp «estimated»;
- a recalculation that is not estimated, or any line with quantity ≤ 0 (the reversal) → stamp
  «recalculated»;
- the others → none.

A month is estimated when it has an «estimated» stamp and no «recalculated» stamp **strictly
later**. A recalculation that is still estimated (+15 Smc estimated, −10 Smc reversal in the same
bill) leaves the month estimated: both stamps carry the same date.

## 8. Unit prices and the month total (`finishMonth` in `src/lib/engine/supply-months.ts`)

- `costs`: the month's cents per `CostCategory`.
- `totalCents` = Σ of every cost category, **`feed_in` included**: the credit for fed-in energy
  lowers the total, and every total built on it (cost per unit, house spending, 12-month boxes,
  the sum of the categories) is net of it.
- `commodityUnitPriceMicros` = `costs.commodity` ÷ consumption: the price of the commodity
  alone, **net of VAT**, the one comparable with market references.
- `totalUnitPriceMicros` = `totalCents` ÷ consumption: everything paid per unit in the month
  alone, VAT included.
- Both are null without a positive consumption (flat fees, unbilled months).
- `totalUnitPrice12Micros` (`addTwelveMonthUnitPrice`): Σ `totalCents` ÷ Σ billed consumption of
  the **12 months ending at the month** (`UNIT_PRICE_WINDOW_MONTHS`), null unless each of the 12
  has billed days; built over the whole series, so it does not move with the range. This is the
  total per unit the charts and the «Casa» card show. A month alone swings with the fixed shares:
  invented example, gas at 80 Smc a month from October to March and 2 Smc from April to
  September, 50 cents a Smc plus 10 € fixed a month → September alone 5,50 €/Smc, its 12 months
  366,00 € ÷ 492 Smc = 0,7439 €/Smc, the figure to set against an offer. A first replacement
  (2026-10-27, the same day) hid months under a quarter of the median consumption: it left gaps
  and still showed summer peaks just above the threshold, so the owner chose the 12 months.

Example: 200 kWh for 20,00 €, VAT 2,00 €, fed-in credit −5,00 € → `totalCents` 1700,
commodity 0,100000 €/kWh, total 0,085000 €/kWh.

## 9. Readings (`src/lib/engine/readings.ts`)

- A reading on day d is the counter at the end of d: the growth between d1 and d2 belongs to the
  days after d1 up to d2, evenly (`dailyFromReadings`).
- One reading per day and register (`pickReadings`): `bill_actual` beats `self` beats
  `bill_estimated`; on a tie the latest entered (`createdAt`).
- A counter that goes down (a replaced meter) breaks the series: that interval counts for
  nothing instead of producing negative consumption.
- The engine uses the self readings and the readings of **confirmed** bills only: the readings of
  a replaced bill leave with it.
- **`readingsConsumption`** (`addReadingsConsumption` in `src/lib/engine/supply-months.ts`): the
  consumption measured on the days **after the last billed day** (the latest `periodEnd` of the
  confirmed bills); billed days already have their consumption.
  Electricity uses F1+F2+F3 when any of those registers is among the picked readings, otherwise
  `single`.
- **Gas** counts m³: they become Smc with the C from the latest confirmed bill that prints it, by
  `periodEnd`; 1, with `isReadingsConversionAssumed`, only when no confirmed bill prints it.

## 10. Photovoltaic (`addPhotovoltaic` in `src/lib/engine/supply-months.ts`)

Supplies with `hasPhotovoltaic` (electricity only) also accept two cumulative registers:
`feed_in` (the exchange meter, energy sent to the grid) and `production` (the inverter). Per
month: `feedInKwh` and `productionKwh` from their daily growth;
`selfConsumptionKwh` = Σ over the days that have both of (production − fed in), at least 0 for
the month; `houseConsumptionKwh` = billed consumption + self-consumption, only when both exist.
The fed-in credit on the bill is a `feed_in` line (§ 8).

## 11. The house (`src/lib/engine/house-months.ts`)

`buildHouseMonths` sums its supplies month by month: metered supplies by cost category, flat-fee
supplies (internet/phone, waste tax) into one bucket `flat` («Canoni e tributi»); `bySupply`
keeps each supply's total. `rolling12` and `yearOverYear` (`src/lib/engine/year-over-year.ts`)
compare the 12 months ending at a month with the 12 before, and a month with the same month a
year earlier.

## 12. Seed data (`scripts/seed-data.ts`, `scripts/seed.ts`)

`pnpm db:seed` gives the two seed users invented data through the same services the app uses,
only to a user without houses: seed A «Casa Fenicottero» with electricity, gas and internet over
the 14 months before the current one, water in 5 quarterly bills over 15 months, and two self
readings after the last electricity bill (one when seeded on the first of the month); seed B «Casa Ornitorinco» with one electricity supply
and two bills. The first electricity bill is estimated and the second re-bills it with a
recalculation pair, so the oldest month ends up actual. The «Canone TV» (900 cents, `outside`)
is on the electricity bills from January to October, the ten instalments of the real fee.
Nothing is dated after the day of the seed.

## 13. The dashboard windows (`src/lib/services/dashboard.ts`)

- **Series**: each supply is built once by `buildSupplyMonths`, from the earlier of the shown range's
  start and 23 months before its **oldest month** (the oldest `periodStart` of a confirmed bill's
  line or `readOn` of a reading, never later than the current month: bill dates are free, and a
  bill dated in the future must not empty «Tutto») up to the current month. On «Casa» that oldest
  month is the house's, the oldest across all its supplies, archived ones included: every supply
  is built over the same months, so the house has one entry per month. The range (12 or 24
  months ending this month, or everything from that oldest month) is a slice of it, so changing
  the range never changes the tiles.
- **Last billed month** of a supply: the latest month with `billedDays` ≥ half its days (a bill
  that touches a month by a few days does not make it the reference). The year-over-year chart and
  the supply's «Ultimi 12 mesi» tiles use the 24 months ending there (or this month without one);
  `rolling12` compares the 12 with the 12 before, and the change is shown only when **both** have
  12 months with bills (`isComparable`), otherwise «—» (the first year of data).
- **House window**: it ends at the **oldest** of the last billed months of the non-archived
  supplies, so every active supply is billed in the whole window (a water bill every quarter does
  not make the house look cheaper than its monthly bills); no such month → no window, tiles «—».
  `last12`/`previous12` sum `totalCents` of every supply, archived ones included (real spending);
  the change is shown when each of the 24 months has billed days in at least one supply.
- **Monthly average** of the house: `last12` ÷ the months of its window with billed days in at
  least one supply, rounded. Invented example: electricity 1000 cents a month billed from 9 months
  ago to last month, water 3000 cents a quarter from 11 months ago to 3 months ago → the window ends
  3 months ago, `last12` = 7 × 1000 + 3 × 3000 = 16000, average 16000 ÷ 9 = 1778.
- Every total is **net of the fed-in credit** (`totalCents`, § 8): house spending, tiles, the sum
  of the categories and the «Totale» of the cost chart.
- **Year over year by calendar year** (`toYearLinesSeries`, `src/lib/charts/series.ts`): over «24
  mesi» and «Tutto» the months **shown** become one line per calendar year on a January–December
  axis, newest year first; a year the range only touches keeps just its months inside it, a year
  with nothing billed is left out. Values as the bars: billed consumption only (readings after
  the last bill are not comparable), spending only in months with billed days. Over «12 mesi» the
  bars stay (the 12 months ending at the last billed month against the 12 before), and the
  «Ultimi 12 mesi» tiles never move with the range.

## 14. The household (`src/lib/engine/household.ts`, `src/lib/services/household.ts`)

- The people living in a house are a list of changes `{ validFrom, people }` typed on
  «Forniture» (table `household_sizes`, one change per house and day, people a whole number from
  1 to 20, never after today); each holds from its day until the day before the next. Before the
  first change the household is **unknown**, never assumed.
- `peopleOn(changes, day)`: the last change on or before the day. `buildHouseholdMonths(changes,
  months)`: for each month the people on its **last day** (the «Persone in casa» column of the cost
  table) and the changes that fall in it (the marks on the cost charts).
- `averagePeople(changes, from, to)`: every day weighs the same — 2 people for 9 months and 3 for
  3 months is 2,25 — and it is null unless **every** day of the period is known, so a per-person
  figure is never made from a household known only in part.
- The dashboards (`HouseholdView`, `src/lib/services/dashboard.ts`) take the average over the
  tiles' two windows, from the first day of their first month to the last day of their last: the
  supply's 12 months ending at its last billed month (or this month), the house's ending at
  `houseEndMonth` (no window, no average). The per-person tiles divide the 12-month consumption
  and spending by the average of those 12 months; their change compares with the 12 before
  divided by **their** average, shown only when the periods are comparable (§ 13) and both
  averages are known. Invented example: 2 people from 2024-01-01, 3 from 2026-04-01, window
  2025-10-01..2026-09-30 → (182 × 2 + 183 × 3) ÷ 365 = 2,50 people.
