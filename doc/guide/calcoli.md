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

## 5. Competence and recalculations (`src/lib/engine/supply-months.ts`)

`buildSupplyMonths` spreads **every line evenly over the days of its own period** and sums the
days into calendar months. Amounts are split with `allocateCentsByWeights` (largest remainder),
so each line's months add up to its exact cents; quantities are split pro rata as `real`.

A gas bill for September may re-bill August line by line: «Gas» +12 Smc and «Gas (voce di
ricalcolo)» −10 Smc, both with August as their period and `isRecalculation`. Those lines land in
August, which becomes 10 (estimated) + 12 − 10 = 12 Smc. Nothing in the engine looks at which
bill printed a line except for the estimate stamps below.

## 6. Consumption and bands

- **Consumption** of a month = Σ of the `commodity` quantities in the supply's consumption unit
  (`consumptionUnitOf`: kWh, Smc, m³), spread by day. Water `network` lines in m³ (sewerage,
  treatment) do not count.
- **Bands**: a commodity line with a `band` goes to that band. A line without a band takes the
  split of its bill's own readings (`bandSharesOfBill` in `src/lib/engine/bands.ts`): if F1, F2
  and F3 each have two dates and grew, the shares are Δ register ÷ Σ Δ (80/60/60 kWh → 40/30/30%);
  otherwise the line goes to `single`. Single-rate offers still print F1/F2/F3 readings: that is
  what makes the split possible.
- **`hasCommodityBands`** is true only when a commodity line in the consumption unit spread over
  the month has an F1/F2/F3/F23 band. A single-rate offer split from its readings stays false, so
  market references compare it with the single-rate price; the band split is shown, the offer is
  not called banded.

## 7. Estimated months

Each commodity line leaves at most one stamp, equal to the **end of its bill's period**, on the
months it touches (`stampMonth`):

- `isEstimated` with quantity > 0 (recalculation or not) → stamp «estimated»;
- a recalculation that is not estimated, or any line with quantity ≤ 0 (the reversal) → stamp
  «recalculated»;
- the others → none.

A month is estimated when it has an «estimated» stamp and no «recalculated» stamp **strictly
later**. A recalculation that is still estimated (+15 Smc estimated, −10 Smc reversal in the same
bill) leaves the month estimated: both stamps carry the same date.

## 8. Unit prices and the month total

- `costs`: the month's cents per `CostCategory`.
- `totalCents` = Σ of every cost category, **`feed_in` included**: the credit for fed-in energy
  lowers the total, and every total built on it (cost per unit, house spending, 12-month boxes,
  the sum of the categories) is net of it.
- `commodityUnitPriceMicros` = `costs.commodity` ÷ consumption: the price of the commodity
  alone, **net of VAT**, the one comparable with market references.
- `totalUnitPriceMicros` = `totalCents` ÷ consumption: everything paid per unit, VAT included.
- Both are null without a positive consumption (flat fees, unbilled months).

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
- **`readingsConsumption`**: the consumption measured on the days **after the last billed day**
  (the latest `periodEnd` of the confirmed bills); billed days already have their consumption.
  Electricity uses F1+F2+F3 when any of those registers is among the picked readings, otherwise
  `single`.
- **Gas** counts m³: they become Smc with the C from the latest confirmed bill that prints it, by
  `periodEnd`; 1, with `isReadingsConversionAssumed`, only when no confirmed bill prints it.

## 10. Photovoltaic

Supplies with `hasPhotovoltaic` (electricity only) also accept two cumulative registers:
`feed_in` (the exchange meter, energy sent to the grid) and `production` (the inverter). Per
month (`addPhotovoltaic`): `feedInKwh` and `productionKwh` from their daily growth;
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
readings after the last electricity bill; seed B «Casa Ornitorinco» with one electricity supply
and two bills. The first electricity bill is estimated and the second re-bills it with a
recalculation pair, so the oldest month ends up actual. The «Canone TV» (900 cents, `outside`)
is on the electricity bills from January to October, the ten instalments of the real fee.
Nothing is dated after the day of the seed.
