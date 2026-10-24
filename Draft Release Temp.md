# Draft release

> 2026-10-24 – 2026-10-24

- Added the look of the whole app: a savings-passbook design with aligned figures and clear tables, light and dark themes, and a five-item navigation bar at the bottom on phones and at the side on computers.

**Casa**

- Added the home page: the house's spending over its last 12 billed months with the monthly average, a chart of costs by category for the whole house, then for each supply its latest bill, its last billed month («set 2026 · 200 kWh · 0,2365 €/kWh») and one-tap buttons for a new bill or a meter reading. With more than one house, a selector picks which one to show.
- Added the period choice for the charts: 12 months, 24 months or everything, kept when you switch house.

**Bollette**

- Added bills typed by hand: the form starts from the usual lines of the utility (energy, network, system charges, taxes, VAT…) with the amounts left empty, shows the sums by category and a warning when the total does not add up, and lets any bill, flat fees included, be marked as estimated. On a phone each line is a card, on a computer a table.
- Added overlapping bills: when a new bill covers days already billed, you choose whether it adds up (an adjustment) or replaces the old one, which stays visible stamped «sostituita».
- Added the bill list, filterable by supply, and the bill page with its lines grouped by category, subtotals, and edit and delete.

**Letture**

- Added meter self-readings: one field per register (F1, F2 and F3 when the meter is banded), today's date by default and never a future one. A value lower than the last reading shows a warning and asks you to confirm before saving.

**Forniture**

- Added houses and supplies: electricity, gas, water, internet and phone, TARI, with the POD/PDR code tidied up when saved (spaces and dashes removed, letters in capitals) and solar panels for electricity. Supplies can be archived, and deleting a house first tells you how many supplies, bills and readings go with it.
- Added charts on each supply's page: consumption per month by band (estimated months hatched, readings not yet billed striped, solar self-consumption and energy fed into the grid), unit price for energy alone and all-in, costs by category with the fed-in credit below zero, and this year against the year before. Flat fees show costs and year over year only.
- Added the 12-month tiles: consumption and spending of the last 12 billed months, with the change against the 12 before («+10,0 % sui 12 mesi precedenti») only when both years have a bill every month.
- Added «Vedi i dati» under every chart: the same figures as a table, readable with a screen reader and on narrow screens.

**Impostazioni**

- Added the theme choice (system, light or dark) and account deletion, which asks for your password and a confirmation before erasing bills, readings and files.
- Added accounts with email and password: sign up, sign in and sign out, with sessions that last six months so the app rarely asks you to log in again.
- Added closable registration: each installation decides whether new accounts are accepted, and when it is closed the sign-up page says so and the server refuses new accounts too.
- Added private pages: everything except sign-in and sign-up needs an account, and after signing in you land back on the page you asked for.
