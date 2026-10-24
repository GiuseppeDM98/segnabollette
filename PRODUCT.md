# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner of the deployment, and at most one friend if registration is opened (multi-user with
closable registration, closed by default). Each one tracks their own houses and supplies; nobody
sees anyone else's data. Use is **rare and in bursts**: a session when a bill arrives (one to
three a month), a meter self-reading now and then, the charts a few times a year. Every screen
must be obvious without remembering anything from the last visit.

Two scenes:

- **Phone, 390 px**: the paper bill in hand or the PDF just arrived by email; typing a bill or a
  meter reading, standing up, one thumb.
- **Computer**: reading the charts, checking whether the offer is still a good one, entering a
  long bill line by line.

## Product Purpose

Record every household utility bill — electricity, gas, water, and the flat-fee ones
(internet/phone, the waste tax TARI) — grouped by house, and understand over time how much is
consumed, what each unit really costs (the commodity alone and everything paid per unit), where
the money goes by category, and whether the offer is good against market references. Success:
the owner trusts the figures as much as a bank statement and can answer «sto pagando troppo?»
without opening a spreadsheet.

## Positioning

A tool on the owner's side, not a supplier's app: it has no offer to sell, it is self-hosted
(Vercel + Turso + private Blob, open source AGPL-3.0) and it compares the owner's prices with
neutral references (PUN Index GME, PSV/CMEM, ARERA prices for vulnerable customers). It reads a
bill **line by line with each line's own competence period**, so the recalculations Italian
bills print land in the month they belong to; it keeps two unit prices (commodity net of VAT,
total with VAT) and marks estimated months.

## Operating Context

- Bills are entered by hand (from a per-kind template of a few aggregated lines, adding detail
  lines on demand) or, later, uploaded as a PDF or photos that Claude extracts; **nothing is
  stored without the owner's confirmation** in a review screen, and manual entry is itself that
  confirmation.
- Self-readings fill the days between bills: date, one value per register (F1/F2/F3 or single;
  m³ for gas and water; fed-in and production with photovoltaic panels).
- Vocabulary exactly as printed on Italian bills: POD, PDR, Smc, m³, kWh, F1/F2/F3/F23, «materia
  prima», «oneri di sistema», «accise», «IVA», «conguaglio», «voce di ricalcolo», «stimata»,
  «rilevata», coefficiente C, potere calorifico superiore.
- Installable PWA (later): camera capture of a bill, offline queue for uploads and self-readings.

## Capabilities and Constraints

- UI in Italian only, no i18n. Theme follows the system, with a switch (system, light, dark);
  both light and dark are designed, not derived.
- Money in integer cents, unit prices to 6 decimals (micro-euros), quantities as printed; figures
  are formatted Italian style (`1.234,56 €`, `0,099000 €/kWh`, dates `gg/mm/aaaa`).
- A bill has 10–70 printed lines; manual entry starts from a short template.
- Arithmetic checks (lines vs total, quantity × price vs amount) are warnings, never blocks.
- Overlapping bills ask for a choice: «si somma» or «sostituisce»; a replaced bill stays archived.
- Charts (next session, Recharts) need colours for the cost categories, the time bands, readings
  not yet billed, photovoltaic, the two unit-price lines, current vs previous year, and two market
  references; every chart has a data-table alternative.
- Stack: Next.js 16 App Router, React 19, Tailwind 4 (tokens only, no default palette).
- Out of scope: supplier switching or offer comparison, smart-meter automation, sharing between
  users, paying bills.

## Brand Commitments

- Name: **Segnabollette**. No existing logo, colour or typeface: the identity is born with this
  design.
- Voice: second person singular («tu»), dry and precise, short sentences, the bill's own terms
  as printed; no jokes, no marketing.
- **Must not look like a utility supplier's app** (Enel, Eni, A2A and the like): it is the owner's
  own tool, on the owner's side.

## Evidence on Hand

- Invented seed data only (`pnpm db:seed`: «Casa Fenicottero» with electricity, gas, water and
  internet; «Casa Ornitorinco» with one electricity supply), round figures.
- The owner's real bills never enter the repository, screenshots included: any screenshot or
  example uses invented figures and generic names.
- No testimonials, users, metrics or press exist; none may be fabricated.

## Product Principles

1. **Figures first.** Every screen is read like a bank statement: aligned figures, clear tables,
  nothing that steals room from the numbers.
2. **Obvious on a rare visit.** Labels say what they are; no convention the owner must remember
  from last month.
3. **Nothing without confirmation.** The owner sees and confirms what is stored; warnings explain,
  never block.
4. **On the owner's side.** Neutral references, no selling, the owner's data stays in their own
  deployment.
5. **Faithful to the bill.** The bill's own words, periods and units; recalculations where they
  belong.

## Accessibility & Inclusion

WCAG 2.1 A/AA on every page, mobile and desktop, light and dark theme, checked with axe in the
end-to-end suite. Touch targets sized for one-thumb use on a phone.
