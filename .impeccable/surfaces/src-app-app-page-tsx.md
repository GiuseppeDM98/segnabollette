---
version: 1
slug: "src-app-app-page-tsx"
primary_target: "src/app/(app)/page.tsx"
related_targets: ["src/app/(app)/layout.tsx","src/app/(auth)/accedi/page.tsx"]
---

# Segnabollette app shell — surface brief

Scope: the whole authenticated app (shell, Casa, Forniture, Bollette list/detail/form, Letture,
Impostazioni) plus /accedi and /registrati. Visitor mode: **Operate**. Audience and task live in
PRODUCT.md; the moment the world is measured on is reading «Casa» at a glance.

Constraints: mobile-first 390 px, sidebar from 1024 px; light and dark both designed; tokens only
(no Tailwind default palette, no `dark:` variant); WCAG 2.1 AA with axe; functional text ≥ 11 px;
standard web controls; must not read as a supplier's app nor as a grey 2000s back office.

## Direction contract

THESIS: The house is a savings passbook: every bill is one printed entry line — date, what, amount flush right — and a state is a rubber stamp on the line. It refuses the category default of white rounded cards with a blue balance hero.

OWN-WORLD: Pale green-grey security-tinted page, bottle-green book cloth for the shell (bottom bar, sidebar, the Casa cover band), near-black print ink, violet stamp ink reserved for states (stimata, sostituita, avvisi). Libre Franklin for every label and control; Courier Prime, the passbook printer, for dates and amounts in fixed columns. Hairline office rules, square 2–4 px corners, no shadows. Dark theme is the closed book: cloth-dark ground, paper-light ink.

STORY: On a rare visit the owner sees the house as a passbook page, reads each supply's last entry like a bank line, spots a violet stamp where something is estimated or replaced, and acts with the one button the line offers (Nuova bolletta, Autolettura).

FIRST VIEWPORT: Casa at 390 px: cloth cover band with the house name as the page heading (a selector when > 1) and nothing else, no label above it; a column header (Data · Fornitura · Euro); one entry per active supply: period end date in Courier, kind + label + supplier in Franklin, amount flush right in Courier bold, stamp when estimated; each entry's actions under it; cloth bottom bar with five items, active in white with a top tick.

FORM: Libretto di risparmio, my top-ranked grounded candidate (1 of 7), chosen by the owner over the dealt «Bollettino». seed:10885ae94b1520c8. Signature move: the stamp — states print as rotated outlined violet caps that land with a short press (scale 1.08 → 1, 160 ms) when a bill is saved or a state appears.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
