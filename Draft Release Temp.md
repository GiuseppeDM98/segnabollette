# Draft release

> 2026-10-24 – 2026-10-26

- Added the look of the whole app: a savings-passbook design with aligned figures and clear tables, light and dark themes, and a five-item navigation bar at the bottom on phones and at the side on computers.
- Fixed the last month under every chart, whose final digit was cut off on phones.
- Fixed the mark of the active item in the bottom bar: it now sits inside the bar instead of looking like a piece of the page cutting into it.

**Casa**

- Added the home page: the house's spending over its last 12 billed months with the monthly average, a chart of costs by category for the whole house, then for each supply its latest bill, its last billed month («set 2026 · 200 kWh · 0,2365 €/kWh») and one-tap buttons for a new bill, an uploaded bill or a meter reading. With more than one house, a selector picks which one to show.
- Added the period choice for the charts: 12 months, 24 months or everything, kept when you switch house.

**Bollette**

- Added bills typed by hand: the form starts from the usual lines of the utility (energy, network, system charges, taxes, VAT…) with the amounts left empty, shows the sums by category and a warning when the total does not add up, and lets any bill, flat fees included, be marked as estimated. Amounts outside the bill, like the TV licence fee, appear under the total, followed by the amount to pay.
- Added meter readings on the bill the way it prints them: one row per date, with a column for each band (F1, F2, F3) or a single one. The form fits the space it has: cards in a narrow column or on a phone, tables at full width.
- Added bill upload: a PDF or up to 10 photos go to private file storage, and Claude reads every line, reading and period only when you press «Estrai», whose label shows the estimated cost («Estrai (circa 0,30 $)»). Nothing is saved until you check the result beside the document and press «Conferma».
- Added «Da rivedere»: uploads waiting for extraction, being read, ready to check or failed, with a count in the navigation and a link from the bill list. A file already uploaded is recognised, and an interrupted upload can be resumed.
- Added the files of a bill: the bill page lists its PDF or photos, opens them, and lets you attach more files to any bill, typed by hand included.
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
- Added this month's extraction spending: what Claude cost so far and how many bills it read, with the model in use.
- Added accounts with email and password: sign up, sign in and sign out, with sessions that last six months so the app rarely asks you to log in again.
- Added closable registration: each installation decides whether new accounts are accepted, and when it is closed the sign-up page says so and the server refuses new accounts too.
- Added private pages: everything except sign-in and sign-up needs an account, and after signing in you land back on the page you asked for.

**Import**

- Added «Importa più bollette»: choose up to 50 past bills at once, a PDF or a photo each, and the app skips files already stored or chosen twice, then shows what extracting the rest would cost («3 bollette pronte · 3 pagine PDF · 0 foto · costo stimato circa 0,90 $»). Extraction starts only at «Avvia estrazione» and runs two bills at a time from your browser, keeping the screen on.
- Added pausing and resuming: when Anthropic does not answer the queue stops with «Riprendi», and a batch left halfway, because the page was closed, waits in «Lotti in sospeso» with what finishing it would cost.
- Added the review of a batch from its oldest bill: each bill has «Conferma e passa alla prossima», which opens the next one until the batch is done.

**Deploy**

- Added a setup guide that takes you from the clone to your own deployment on Vercel, Turso and private file storage in Europe, with your own Anthropic API key and a spending limit, ending with registration closed after your account.
- Added a cleanup command that finds stored files no bill points to any more and deletes them on request.
- Added a production migration command that reads its database from a file of its own and refuses to run against a local database by mistake.
- Fixed automatic deployments: a merge into the main branch now builds production, while other branches are still skipped.
