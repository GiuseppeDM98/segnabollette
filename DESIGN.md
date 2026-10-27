---
name: Segnabollette
description: The household bills, kept like a savings passbook.
colors:
  bg: "#eef1ed"
  surface: "#fbfcfa"
  surface-sunk: "#e4e9e4"
  ink: "#16181a"
  ink-soft: "#4b524e"
  ink-muted: "#5f6964"
  rule: "#cfd8d2"
  rule-strong: "#7a8a83"
  brand: "#24443c"
  on-brand: "#eef1ec"
  on-brand-soft: "#b9c7c0"
  action: "#24443c"
  action-hover: "#1a332d"
  on-action: "#f5f7f4"
  link: "#24443c"
  stamp: "#5b3f8c"
  stamp-wash: "#ece7f4"
  danger: "#a8281e"
  danger-wash: "#f7e6e3"
  on-danger: "#ffffff"
  focus: "#5b3f8c"
  selection: "#d9cfee"
  cat-commodity: "#2a78d6"
  cat-sale: "#eb6834"
  cat-network: "#1baf7a"
  cat-system: "#eda100"
  cat-excise: "#e87ba4"
  cat-vat: "#008300"
  cat-other: "#6250d6"
  cat-flat: "#e34948"
  cat-feed-in: "#7a8a83"
  band-f1: "#184f95"
  band-f2: "#2a78d6"
  band-f3: "#86b6ef"
  band-f23: "#5598e7"
  band-single: "#1baf7a"
  readings: "#eb6834"
  pv-self: "#008300"
  pv-feed-in: "#eda100"
  price-commodity: "#2a78d6"
  price-total: "#eb6834"
  yoy-current: "#2a78d6"
  yoy-previous: "#8f9a94"
  yoy-older: "#c4cac6"
  reference-wholesale: "#1baf7a"
  reference-arera: "#eda100"
  bg-dark: "#0f1a17"
  surface-dark: "#16241f"
  surface-sunk-dark: "#1d2e28"
  ink-dark: "#e6ece8"
  ink-soft-dark: "#b3c0b9"
  ink-muted-dark: "#8fa098"
  rule-dark: "#2c3d36"
  rule-strong-dark: "#6f8279"
  brand-dark: "#1f3d34"
  on-brand-dark: "#e6ece8"
  on-brand-soft-dark: "#a9bdb4"
  action-dark: "#8cc5ab"
  action-hover-dark: "#a3d4bd"
  on-action-dark: "#0f1a17"
  link-dark: "#9fd3bb"
  stamp-dark: "#b9a2e6"
  stamp-wash-dark: "#2a2340"
  danger-dark: "#f08a7e"
  danger-wash-dark: "#3a1f1c"
  on-danger-dark: "#0f1a17"
  focus-dark: "#b9a2e6"
  selection-dark: "#3d3360"
  cat-commodity-dark: "#3987e5"
  cat-sale-dark: "#d95926"
  cat-network-dark: "#199e70"
  cat-system-dark: "#c98500"
  cat-excise-dark: "#d55181"
  cat-vat-dark: "#008300"
  cat-other-dark: "#9085e9"
  cat-flat-dark: "#e66767"
  cat-feed-in-dark: "#6f8279"
  band-f1-dark: "#86b6ef"
  band-f2-dark: "#3987e5"
  band-f3-dark: "#1c5cab"
  band-f23-dark: "#2a78d6"
  band-single-dark: "#199e70"
  readings-dark: "#d95926"
  pv-self-dark: "#008300"
  pv-feed-in-dark: "#c98500"
  price-commodity-dark: "#3987e5"
  price-total-dark: "#d95926"
  yoy-current-dark: "#3987e5"
  yoy-previous-dark: "#6f8279"
  yoy-older-dark: "#465650"
  reference-wholesale-dark: "#199e70"
  reference-arera-dark: "#c98500"
typography:
  cover-title:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.333
  heading:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.555
  body:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.333
  label:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.4545
    letterSpacing: "0.1em"
  input:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  figure:
    fontFamily: "Courier Prime, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.4286
    letterSpacing: "0"
    fontFeature: "\"tnum\" 1"
  figure-amount:
    fontFamily: "Courier Prime, ui-monospace, monospace"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "0"
    fontFeature: "\"tnum\" 1"
  nav-label:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.4545
rounded:
  xs: "2px"
  sm: "4px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "10": "40px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "0 14px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.on-action}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.action}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "0 14px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.action}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "0 14px"
    height: "44px"
  button-danger-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "0 14px"
    height: "44px"
  button-danger-outline-hover:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger}"
  button-quiet:
    textColor: "{colors.action}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "0 8px"
    height: "44px"
    width: "44px"
  button-quiet-hover:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.action}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.xs}"
    padding: "8px 12px"
    height: "44px"
  input-disabled:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
  input-figure:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.xs}"
    padding: "8px 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
    width: "min(26rem, calc(100% - 2rem))"
  cover-band:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.cover-title}"
    padding: "24px 16px 16px"
  column-header:
    textColor: "{colors.action}"
    typography: "{typography.label}"
    padding: "0 12px 6px"
  entry-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "12px"
  entry-line-hover:
    backgroundColor: "{colors.surface-sunk}"
  line-group-header:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    padding: "6px 12px"
  stamp:
    textColor: "{colors.stamp}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  nav-bar:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand-soft}"
    typography: "{typography.nav-label}"
    height: "64px"
  nav-bar-active:
    textColor: "{colors.on-brand}"
  side-bar:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand-soft}"
    typography: "{typography.body}"
    padding: "20px 12px"
    width: "224px"
  side-bar-item:
    textColor: "{colors.on-brand-soft}"
    rounded: "{rounded.xs}"
    padding: "0 12px"
    height: "44px"
  side-bar-item-active:
    textColor: "{colors.on-brand}"
---

# Design System: Segnabollette

> Recorded on 2026-10-24 from the shipped code: tokens in `src/app/globals.css`, the shared control
> classes in `src/components/ui/styles.ts`, the primitives in `src/components/ui/`, the shell in
> `src/components/shell/app-shell.tsx`, and the manual-entry screens (Casa, Bollette, bill page and
> form, Letture, Forniture, Impostazioni, sign-in and sign-up). Everything here is what the build
> does; the frontmatter is normative.

## Overview

**Creative North Star: "Libretto di risparmio"** — the Italian savings passbook.

Each house is a passbook. Every bill is one printed entry line: the date and the amount set by the
passbook printer in fixed columns, what it is written in plain sans-serif between them, the amount
flush right. A state (estimated, replaced, archived) is a rubber stamp on the line, in violet stamp
ink, never a coloured badge. The shell (bottom bar, sidebar, the house's cover band, the sign-in
band) is bottle-green book cloth with a faint woven texture; the page is pale green-grey security
paper. The dark theme is the closed book: cloth-dark ground, paper-light ink — designed, not
inverted.

Density is that of a bank statement read on a phone: compact lines, figures in aligned columns,
hierarchy by weight, tracking and rules rather than by size. Nothing competes with the numbers:
no shadows, no hero figures, no illustration. The one authored motion is the stamp landing.

**Key Characteristics:**
- Security-tinted paper page, bottle-green cloth shell, near-black print ink.
- Courier Prime for figures only; Libre Franklin for everything else.
- Hairline office rules; 2 px corners on controls, 4 px on panels; no shadows.
- Violet stamp ink reserved for states and non-blocking warnings; danger red reserved for errors and
  destructive actions.
- Light and dark both designed from the same token names.

## Colors

A cool, low-chroma paper-and-cloth palette with two inks of meaning (violet stamp, red danger)
and a separate, validated set of chart hues that never touch the interface chrome.

**Theme colours for the PWA manifest and the browser surface.** Light: `--color-bg` **#eef1ed**,
`--color-brand` **#24443c**. Dark: `--color-bg` **#0f1a17**, `--color-brand` **#1f3d34**.

### Interface tokens

| Token | Role | Light | Dark |
|---|---|---|---|
| `--color-bg` | Page ground (security paper / closed-book ground); `html` and `body` background | #eef1ed | #0f1a17 |
| `--color-surface` | Entry lines, fields, panels, dialogs, line cards | #fbfcfa | #16241f |
| `--color-surface-sunk` | Recesses: disabled fields, category group rows, row and button hover | #e4e9e4 | #1d2e28 |
| `--color-ink` | Body text and figures | #16181a | #e6ece8 |
| `--color-ink-soft` | Secondary text (supplier, period start, source, subtotal label) | #4b524e | #b3c0b9 |
| `--color-ink-muted` | Hints, empty dashes, a replaced bill's struck amount (still ≥ 4.5:1) | #5f6964 | #8fa098 |
| `--color-rule` | Hairline rules between lines and around panels and line cards | #cfd8d2 | #2c3d36 |
| `--color-rule-strong` | Field borders, the dialog border, the rule closing a category group | #7a8a83 | #6f8279 |
| `--color-brand` | Book cloth: bottom bar, sidebar, cover band, sign-in band | #24443c | #1f3d34 |
| `--color-on-brand` | Text, the active nav item, its tick and the focus ring on cloth | #eef1ec | #e6ece8 |
| `--color-on-brand-soft` | Inactive nav items on cloth | #b9c7c0 | #a9bdb4 |
| `--color-action` | Primary fill; secondary outline and text; quiet text; column-header ink and rule; checkbox and radio accent | #24443c | #8cc5ab |
| `--color-action-hover` | Primary button hover | #1a332d | #a3d4bd |
| `--color-on-action` | Text on the primary button | #f5f7f4 | #0f1a17 |
| `--color-link` | Inline links (underlined, 1 px, 0.2em offset) | #24443c | #9fd3bb |
| `--color-stamp` | Stamp ink («stimata», «sostituita», «archiviata»), warning text and outline; text caret | #5b3f8c | #b9a2e6 |
| `--color-stamp-wash` | Ground of the arithmetic warnings, the overlap choice, a reading warning | #ece7f4 | #2a2340 |
| `--color-danger` | Errors, invalid field borders, destructive buttons and the account-deletion panel | #a8281e | #f08a7e |
| `--color-danger-wash` | Ground of form errors; danger-outline hover | #f7e6e3 | #3a1f1c |
| `--color-on-danger` | Text on a filled destructive button | #ffffff | #0f1a17 |
| `--color-focus` | Focus ring on paper (2 px outline, 2 px offset) | #5b3f8c | #b9a2e6 |
| `--color-selection` | Text selection ground | #d9cfee | #3d3360 |

Measured text contrast (WCAG): ink on bg 15.6:1 light / 14.9:1 dark; ink-muted on surface-sunk
4.6:1 / 5.2:1 (its lowest pairing); on-brand-soft on cloth 6.1:1 / 6.0:1; on-brand on cloth
9.4:1 / 9.9:1; action on bg (column headers) 9.4:1 / 9.1:1; stamp on surface 8.1:1 / 7.2:1 and on
stamp-wash 6.8:1 / 6.6:1; danger on surface 6.8:1 / 6.6:1 and on danger-wash 5.8:1 / 6.2:1;
on-action on action 9.9:1 / 9.1:1; on-danger on danger 7.0:1 / 7.3:1.

### Primary
- **Bottle-Green Book Cloth** (`brand`): the shell only — bottom bar, sidebar, the cover band on
  Casa, the band above sign-in and sign-up — always through the `cloth` utility, which adds the
  diagonal weave and sets on-brand ink.
- **Action Green** (`action`): what the owner can press or read as a heading of columns. In light
  it is the cloth green, so the primary button reads as a piece of the cover; in dark it turns to a
  pale mint (#8cc5ab) so it carries on the closed-book ground.

### Secondary
- **Violet Stamp Ink** (`stamp`): states printed on a line, non-blocking warnings, the focus ring
  on paper, the caret. Nothing decorative.

### Tertiary
- **Ledger Red** (`danger`): validation errors, failed saves, delete buttons and the
  account-deletion panel.

### Neutral
- **Security Paper** (`bg`), **Clean Leaf** (`surface`), **Sunk Leaf** (`surface-sunk`): the page
  and what sits on it.
- **Print Ink** (`ink`), **Soft Ink** (`ink-soft`), **Faded Ink** (`ink-muted`): three text
  strengths, ranked, all at or above 4.5:1 on every paper token.
- **Office Rule** (`rule`) and **Strong Rule** (`rule-strong`): the line grammar.

### Named Rules
**The Tokens Only Rule.** Tailwind's default palette is reset (`--color-*: initial`); only the
tokens above and in Charts exist. No literal colour in a component, ever (the logo SVG is the one
asset with baked-in values, equal to the tokens).

**The Closed Book Rule.** Dark comes only from redefining the same variables under
`[data-theme='dark']` and, for the `system` cookie, under `prefers-color-scheme: dark`. Never use
Tailwind's `dark:` variant: it ignores the theme cookie. A new token goes into `@theme` and into
both dark blocks, and into this file.

**The Stamp Ink Rule.** Violet is for states and non-blocking warnings only: the three stamps,
arithmetic warnings, the overlap choice, a reading that looks wrong (and the focus ring that shares
its ink). A violet button, heading or icon is a defect.

**The Red Means Danger Rule.** `danger` marks errors and destructive actions, nothing else; a
warning that does not block is stamp ink, not red.

## Charts

Chart colours are their own namespace: each token has one job, and the same job keeps the same
token on every chart. Text in charts (axes, ticks, labels, legends, the data table) uses the ink
tokens, never a series colour. Status colours (`stamp`, `danger`) are never series.

| Token | Job | Light | Dark |
|---|---|---|---|
| `--color-cat-commodity` | Cost category: materia prima (energy or gas) | #2a78d6 | #3987e5 |
| `--color-cat-sale` | Cost category: commercialisation / sale | #eb6834 | #d95926 |
| `--color-cat-network` | Cost category: transport and meter (network) | #1baf7a | #199e70 |
| `--color-cat-system` | Cost category: oneri di sistema | #eda100 | #c98500 |
| `--color-cat-excise` | Cost category: accise | #e87ba4 | #d55181 |
| `--color-cat-vat` | Cost category: IVA | #008300 | #008300 |
| `--color-cat-other` | Cost category: other charges | #6250d6 | #9085e9 |
| `--color-cat-flat` | Cost category: flat fee (internet/phone, TARI) | #e34948 | #e66767 |
| `--color-cat-feed-in` | Fed-in credit, drawn below zero with a hatch | #7a8a83 | #6f8279 |
| `--color-band-f1` | Consumption band F1 | #184f95 | #86b6ef |
| `--color-band-f2` | Consumption band F2 | #2a78d6 | #3987e5 |
| `--color-band-f3` | Consumption band F3 | #86b6ef | #1c5cab |
| `--color-band-f23` | Consumption band F23 | #5598e7 | #2a78d6 |
| `--color-band-single` | Single-rate consumption (monorario, gas, water) | #1baf7a | #199e70 |
| `--color-readings` | Consumption from readings not yet billed | #eb6834 | #d95926 |
| `--color-pv-self` | Photovoltaic self-consumption | #008300 | #008300 |
| `--color-pv-feed-in` | Photovoltaic energy fed into the grid | #eda100 | #c98500 |
| `--color-price-commodity` | Unit price line: commodity only | #2a78d6 | #3987e5 |
| `--color-price-total` | Unit price line: total per unit | #eb6834 | #d95926 |
| `--color-yoy-current` | Year over year: current year | #2a78d6 | #3987e5 |
| `--color-yoy-previous` | Year over year: previous year | #8f9a94 | #6f8279 |
| `--color-yoy-older` | Year over year by calendar year: every year before the previous one | #c4cac6 | #465650 |
| `--color-reference-wholesale` | Market reference: wholesale (PUN / PSV), dashed | #1baf7a | #199e70 |
| `--color-reference-arera` | Market reference: ARERA vulnerable-customer price, dashed | #eda100 | #c98500 |

- **Cost categories.** The eight categories `cat-commodity` → `cat-flat` take the validated
  categorical order: blue, orange, aqua, yellow, magenta, green, violet, red. Validated with the
  dataviz palette checks on the chart surface #fbfcfa (light) and #16241f (dark): all hard checks
  pass. In light, the network, system and excise marks sit below 3:1 on the surface (2.7, 2.1,
  2.6:1), so every chart ships direct labels or its data table — the app already requires a
  data-table alternative for every chart.
- **Fed-in credit** (`cat-feed-in`) is a neutral grey drawn below the zero line with a hatch
  texture, not a ninth hue.
- **Bands.** F1/F2/F3 are an ordinal blue ramp: F1 darkest in light, lightest in dark (the most
  prominent band keeps the most contrast against each ground). F23 sits between F2 and F3.
  Single-rate is aqua.
- **Readings not yet billed** are orange, distinct from any band.
- **Unit price.** Commodity blue, total orange. References: wholesale aqua and ARERA yellow, both
  dashed so they read as benchmarks, not as the owner's own series.
- **Year over year.** Current blue, previous neutral grey. Over 12 months, bars: the last 12
  billed months beside the same months a year earlier. Over 24 months and the whole history, one
  line per calendar year on a January–December axis: current year blue, the year before grey,
  every older year one lighter grey (`yoy-older`; two lighter greys side by side fall under the
  normal-vision floor, ΔE 7). Each line ends with its year written in ink (`ink-soft`), never in
  the line colour, so the older years sharing a grey are told apart; `yoy-older` sits below 3:1
  on the surface (1,6:1 light, 2,1:1 dark), relieved by those labels, the tooltip and the data
  table. Validated against `yoy-previous`: normal-vision ΔE 15,8 light, 15,1 dark.

**The One Job Rule.** A chart token means one thing. Reusing `cat-commodity` for an unrelated
series because "blue looks nice" breaks the reading across charts.

## Typography

**Body Font:** Libre Franklin (`--font-sans`, via `next/font`, with `system-ui, sans-serif`)
**Figure Font:** Courier Prime 400/700 (`--font-print`, via `next/font`, with `ui-monospace,
monospace`), applied through the `figures` utility (tabular numerals, no tracking)

**Character:** a sober American grotesque for every label and control, and the passbook printer's
typewriter face for the numbers that must line up. The pairing is the world: words in sans,
figures in print.

### Hierarchy
The scale is short: Tailwind's `text-2xs` (11 px, added in `@theme`), `text-xs` 12, `text-sm` 14,
`text-base` 16, `text-lg` 18, `text-2xl` 24. Body is 15 px / 1.45.

- **Cover title** (800, 24 px, 1.33): the house name on the cloth cover band (or the house
  selector set in the same style), and the app name on the sign-in band. The largest text in the
  app.
- **Heading** (700, 18 px): the page title and a dialog title. Section headings inside a page and
  form legends step down to 700 at 16 px.
- **Body** (400 with 600 for labels and names, 15 px, 1.45): field labels (600), entry text, button
  labels (700), sidebar items (700).
- **Body small** (400, 12 px): period start, supplier and kind under an entry, hints, field errors
  (600); 14 px for secondary cells (source, subtotal label, line-card labels).
- **Label** (700, 11 px, 0.1em tracking, uppercase): column headers (Data · Fornitura · Euro,
  Periodo, Voce, Registro · Valore · Fonte) and stamps (800). Tracking and the rule under it, not
  size, make it a header.
- **Nav label** (700, 11 px, no tracking, sentence case): the labels under the icons of the bottom
  bar.
- **Input** (16 px): every input, select and textarea — phones zoom into a field typed below
  16 px.
- **Figure** (Courier Prime 700, 14 px) and **Figure amount** (Courier Prime 700, 15 px): dates,
  amounts, quantities, readings, unit prices, POD/PDR identifiers, a line's number. Amounts flush
  right. Figures typed into a field take the same face, at the 16 px input size.

### Named Rules
**The Printer Rule.** Courier Prime sets figures only — dates, amounts, quantities, readings,
identifiers. Never a sentence, a label, a heading or a button.

**The Eleven Pixel Floor.** No functional text below 11 px (`text-2xs`).

**The No Giant Numbers Rule.** Rank by weight, tracking and rules, not by size. No balance hero,
no figure above 24 px; an amount is as large as the line it prints on.

## Layout

Mobile-first at 390 px; one column on paper with a 16 px page gutter. The spacing rhythm is
Tailwind's 4 px base, used in 4 / 8 / 12 / 16 / 24 px steps, with 20 px under a page title and
40 px closing a page.

**Page.** A page opens 24 px below the top with its title and, beside it, its actions (wrapping
under it on a phone); sections follow 24 px apart, each with its own 16 px heading and actions,
content 12 px below. The content column is capped at 1024 px and centred; sign-in and sign-up cap
it at 384 px.

**Entry grid.** Three columns: dates (96 px), description (flexible, truncating), amount (auto,
right-aligned), 12 px apart. The column header uses the same grid so figures fall under their
heading. A supply's actions sit under its entry, aligned with the description column from 640 px.
From 1024 px (`lg`) the column header and the entry list are capped at 768 px so the amount stays
near its label; the cover band above them stays full width.

**Tables.** Bill lines and readings are real tables on `surface`, inside a horizontally scrolling
region (the readings region is focusable so a keyboard can scroll it). Cells take 12 px sides (8 px
in the reading table below 640 px) and 8 px vertical padding; group and subtotal rows 6 px.

**Bill form lines.** Below 768 px each line is a card: its own bordered block, a two-column grid
of fields with visible labels, 12 px inside and 12 px apart. From 768 px (`md`) the same markup is
a table under one column header and the per-cell labels become screen-reader only.

**Shell.** Below 1024 px a cloth bottom bar, sticky at the bottom (64 px plus the safe-area inset),
holds five equal items: Casa, Bollette, Letture, Forniture, Impostazioni — a 20 px icon above its
label. From 1024 px (`lg`) the bar gives way to a 224 px cloth sidebar, sticky and full height, with
the logo (28 px) and the app name at the top and the same five items as rows. Every nav item is a
touch target of at least 44 px.

## Elevation & Depth

Flat. No shadows anywhere. Depth is conveyed by tone and line: cloth against paper for the shell,
`surface` on `bg` for the content, `surface-sunk` for recesses and hover, and hairline rules
between entries. The cloth's diagonal weave (`rgb(255 255 255 / 0.035)`, 2 px bands at 45°) is the
only texture, and it lives on shell surfaces only. The one overlay, the confirmation dialog,
separates itself with a strong-rule border and a backdrop of ink at 40 %, not a shadow.

**The Flat Page Rule.** No `box-shadow`, no blur, no glow. If something needs to stand apart, give
it a rule or a different paper tone.

## Shapes

Square office stationery, two radii. Controls take 2 px (`rounded-xs`): buttons, inputs and
selects, stamps, sidebar items, the house selector. Containers take 4 px (`rounded-sm`): panels,
form-error and warning boxes, the bill form's line cards on phones, the dialog. Entry lists and
tables are not rounded. Nothing rounder; no pills.

Lines are hairlines: 1 px `rule` between entries, down the sides of an entry list and around
panels; 1 px `rule-strong` around fields and the dialog, and closing each category group on the
bill page. Outlined buttons take a 1.5 px outline, stamps a 2 px one. The column header carries the
one heavier rule — a 2 px `action` underline, as a passbook prints under its headings.

Icons (`src/components/icons/`) are inline SVG on a 24-unit grid, one 1.75 stroke, round caps and
joins, `currentColor`, `aria-hidden`; they always sit next to a visible label. Default size 20 px
(nav, page title); 16 px beside a supply's name in an entry.

The logo (`public/brand/logo.svg`) is the passbook itself: cloth cover with its spine, the label
window with three printed lines, and a ticked circular stamp.

## Components

Every control is built from the class strings in `src/components/ui/styles.ts`, so a link and a
button that do the same job look the same.

### Buttons
- **Shape:** square-cornered (2 px), at least 44 px tall, 14 px sides, Franklin 700 at the body
  size (14 px where a row of them sits under an entry). Icon and label 8 px apart.
- **Primary:** `action` fill, `on-action` text; hover `action-hover`. One per form or page
  ("Salva", "Modifica", "Crea la casa").
- **Secondary:** `surface` ground, 1.5 px `action` outline, `action` text; hover `surface-sunk`
  ("Nuova bolletta", "Autolettura", "Annulla", "Aggiungi lettura").
- **Danger:** `danger` fill, `on-danger` text, no hover change: only the final confirmation of a
  destructive act (the dialog's confirm, "Elimina account").
- **Danger outline:** `surface` ground, 1.5 px `danger` outline, `danger` text; hover
  `danger-wash`. The button that opens a destructive confirmation ("Elimina" on a bill).
- **Quiet:** no ground, 8 px sides, at least 44 px wide, underlined `action` text; hover
  `surface-sunk`. Row-level actions inside tables and line cards (the bill form's Su · Giù ·
  Rimuovi row, 8 px apart); set in `danger` text when the act deletes.
- **Disabled:** 60 % opacity, not-allowed cursor.
- **Focus:** the global 2 px `focus` outline with 2 px offset; no other focus treatment.

### Inputs / Fields
- **Style:** `surface` ground, 1 px `rule-strong` border, 2 px corners, at least 44 px tall,
  8 px × 12 px padding, 16 px text. Selects use the same class.
- **Figure input:** the same field set in the `figures` face and right-aligned, for amounts,
  quantities, prices, readings, conversion factors.
- **Field:** label above (600), the control, then a 12 px `ink-muted` hint and a 12 px 600
  `danger` error, both wired to the control with `aria-describedby`.
- **Error:** `aria-invalid` turns the border `danger`. Errors that belong to the whole form sit at
  its top in a 4 px box: 1 px `danger` border, `danger-wash` ground, 600 `danger` text, one message
  or a bulleted list.
- **Disabled:** `surface-sunk` ground.
- **Checkbox and radio:** native controls at 20 px, tinted by the body's `action` accent colour,
  label to the right, the whole row a 44 px target.
- **Focus:** the global focus ring.

### Warnings
Arithmetic warnings, the overlap choice in the bill form and a reading lower than the previous one
are stamp ink on `stamp-wash`, 600: the boxes take a 1 px `stamp` border and 4 px corners, the
reading's inline note 2 px corners and no border. They never block saving, except the overlap
choice, which asks a decision before the save.

### Panels
`surface` ground, 1 px `rule` border, 4 px corners, 16 px inside: the bill's facts (a two-column
label/value list with the totals under a hairline), the readings of a bill, house and supply
panels. The account-deletion panel swaps the border to `danger` and heads itself in `danger`.

### Column header (signature)
Label type in `action` ink over a 2 px `action` rule, 6 px between the words and the rule, on the
same columns as the lines below it (`aria-hidden` over entry lists; real `<th>` cells in tables).
In light it reads as cloth green; in dark as the mint action ink.

### Entry line (signature)
One per bill (Bollette) or per supply (Casa), on `surface` inside an unrounded list with 1 px
`rule` sides and a 1 px `rule` below each line, 12 px inside. From 1024 px the list and its
column header stop at 768 px wide. Date column: the period start in 12 px `ink-soft` above the
period end in Courier 700 14 px (`gg/mm/aaaa`). Description column: the
supply's name in Franklin 600 with its 16 px kind icon, the kind and supplier under it in 12 px
`ink-soft`, stamps beneath. Amount column: Courier 700 flush right (`1.234,56`); a replaced bill's
amount is struck through in `ink-muted`. On Bollette the whole line is the link and hovers
`surface-sunk`; on Casa the name and the amount are separate links, a dash in `ink-muted` stands in
for a missing bill, and the supply's secondary actions ("Nuova bolletta", "Autolettura") sit
under the line.

### Stamp (signature)
A state printed on the line: uppercase Franklin 800 at 11 px with 0.1em tracking and no leading,
`stamp` ink in a 2 px `stamp` outline, transparent ground, 2 px corners, 2 px × 6 px padding,
rotated by `--stamp-tilt` (default -6°). Three states: «stimata», «sostituita», «archiviata». It
lands with `animate-stamp` — scale 1.08 → 1 and fade in, 160 ms, `cubic-bezier(0.16, 1, 0.3, 1)` —
only under `motion-safe`; with reduced motion it simply appears, already tilted. Stamps print at
full ink, never faded below their contrast.

**The One Motion Rule.** The stamp press is the only authored motion. No page transitions, no
hover lifts, no animated counters.

### Bill page
The title carries the supply's kind icon, its kind and the period. Stamps sit in a row under it,
with a link to the replacing bill when there is one. The facts panel follows, then the actions
(primary "Modifica", danger-outline "Elimina"). Lines are one table under a Voce · Euro column
header, one `tbody` per cost category: a `surface-sunk` group row with the category in 14 px 700,
then the lines (description, a band code in 12 px 700 `ink-soft`, a stamp when estimated, and under
it quantity × unit price or the recalculation period in 12 px `ink-soft` figures), then a subtotal
row — "Subtotale" in 14 px `ink-soft`, the amount in Courier 700 — closed by a `rule-strong` line.
A "Totale voci" foot row ends the table. Arithmetic warnings sit above it.

### Bill form
Fieldsets with 16 px legends (700): Bolletta, Totali, the per-kind facts (Gas), Voci,
Letture della bolletta. Each line is numbered in figures; on a phone it is a card, from 768 px a table row (see
Layout). The overlap choice appears as a stamp-ink panel with two radios. The form ends with the
primary submit and, after a failed submit, "Correggi i campi segnati in rosso." in 600 `danger`.

### Reading table
Columns Data · (Fornitura) · Registro · Valore · Fonte under the column header; dates and values
in Courier 700 (values right-aligned, never wrapping), the source ("autolettura", "da bolletta")
in 14 px `ink-soft`; a quiet danger "Elimina" on self-readings, through the dialog. Below 640 px
(`sm`) the table folds to Data · Registro · Valore: the Fornitura and Fonte columns hide, the
Registro cell reads «Fornitura · Registro» with the source as a 12 px `ink-soft` line under it.
Cells take 8 px sides below 640 px and 12 px from 640 px, 8 px vertical throughout.

### Confirmation dialog
A native modal `<dialog>` (focus trapped, Escape cancels), never `window.confirm`: centred, up to
416 px wide with 16 px margins on a phone, `surface` ground, 1 px `rule-strong` border, 4 px
corners, 16 px inside, ink backdrop at 40 %. Title in heading type, the body says exactly what goes
away (figures in Courier), then right-aligned buttons: secondary "Annulla" and the danger (or
primary) confirmation.

### Navigation
- **Bottom bar (below 1024 px):** cloth; items 64 px tall, icon above an 11 px 700 label.
  Inactive `on-brand-soft`; active `on-brand` with a 2 px × 32 px `on-brand` tick with rounded ends,
  6 px below the top edge (flush with the edge, the paper-coloured tick read as a piece of the page
  cutting into the cloth; 2026-10-25), and `aria-current="page"`.
- **Sidebar (1024 px and up):** cloth, 224 px; the logo and "Segnabollette" in 16 px 800 at the
  top, then rows of icon and 15 px 700 label, 44 px tall, 2 px corners. Inactive `on-brand-soft`,
  hover and active `on-brand`; the active row has a 2 px `on-brand` tick on its right edge, the
  edge facing the page, inset 8 px top and bottom.
- **Focus on cloth:** the global violet ring is 1.3:1 against light cloth, so every focusable on
  cloth (nav items, the sidebar logo link, the house selector on the cover band) draws its focus
  outline in `on-brand` instead.

### Cover band (signature)
The house's cover: a cloth band at the top of Casa, 24 px over and 16 px under, carrying the
house name in the cover-title style. With more than one house the name becomes a transparent
select in the same style, `on-brand`, 2 px corners. It holds the name and nothing else. The
sign-in and sign-up pages open with the same cloth: the 40 px logo beside "Segnabollette" in the
cover-title style, the form on paper below.

### Theme picker
A fieldset with a 16 px legend ("Tema") and three native radios (Segui il sistema, Chiaro,
Scuro) as 44 px rows; a choice saves at once and a failure reverts it and shows the form-error box.

## Do's and Don'ts

### Do:
- **Do** use only the tokens in this file; add a new one to `@theme`, to both dark blocks and here.
- **Do** build controls from the shared classes (`buttonClass`, `inputClass`, `figureInputClass`,
  `panelClass`, `columnHeaderClass`) rather than restating their utilities.
- **Do** set every date, amount, quantity, reading and identifier with the `figures` utility, and
  align amounts flush right.
- **Do** put the shell on cloth (`cloth` utility) and the content on paper, and draw focus in
  `on-brand` on cloth.
- **Do** keep text contrast at or above 4.5:1 in both themes, and give every chart direct labels
  or its data table.
- **Do** use 2 px corners on controls and 4 px on containers, and 1 px rules (the column-header
  underline, outlined buttons and stamps excepted).
- **Do** confirm a destructive act in the app's own dialog, saying what it removes.
- **Do** use the manifest colours #eef1ed / #24443c (light) and #0f1a17 / #1f3d34 (dark).

### Don't:
- **Don't** make it look like a supplier's app: no energetic green/orange branding, no light
  bulbs, no flames as brand, no happy-family photos.
- **Don't** make it a grey 2000s back office: no flat grey everywhere, no dense tables without
  hierarchy.
- **Don't** go cream-and-serif: the paper is cool green-grey and the type is sans plus Courier.
- **Don't** build white rounded cards with a blue balance hero.
- **Don't** put kicker or eyebrow labels above headings.
- **Don't** put coloured side borders thicker than 1 px on panels, lines or warnings (the 2 px
  active tick of a nav item is the shell's own mark, not a side border).
- **Don't** use shadows, Tailwind's `dark:` variant, or literal colours in components.
- **Don't** use violet for anything but states and non-blocking warnings, or red for anything but
  errors and destructive actions.
- **Don't** set prose, labels or buttons in Courier Prime, or any functional text below 11 px.
- **Don't** use real personal data in examples: invented figures and generic names only (Casa
  Fenicottero, Fenicottero Energia).
