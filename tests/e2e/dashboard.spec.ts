/**
 * The charts of seed user A, who only reads: the house dashboard on «Casa» and the four charts of
 * a supply, with the period selector and the data tables behind «Vedi i dati».
 */
import { expect, type Page, test } from '@playwright/test';
import { SEED_A_STATE, seedSupplyIds } from './helpers';

test.use({ storageState: SEED_A_STATE });

const WATER_NOTE = "Per l'acqua non esiste una serie nazionale di riferimento: nessun confronto.";

/** Every chart frame holds one table of `count` rows, one per month or bar. */
async function expectTablesOf(page: Page, count: number): Promise<void> {
  const frames = page.getByTestId('chart-frame');
  const total = await frames.count();
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index++) {
    const table = frames.nth(index).locator('details table');
    await expect(table).toHaveCount(1);
    await expect(table.locator('tbody tr')).toHaveCount(count);
  }
}

test('la fornitura a contatore mostra i quattro grafici, con le letture non ancora fatturate', async ({
  page,
}) => {
  const ids = await seedSupplyIds('seed-a@example.test');

  await page.goto(`/forniture/${ids.Luce}`);

  const frames = page.getByTestId('chart-frame');
  await expect(frames).toHaveCount(4);
  // An array checks the order too: consumption, unit price, costs, then year over year.
  await expect(frames.getByRole('heading', { level: 2 })).toHaveText([
    'Consumi per mese',
    'Costo unitario',
    'Costi per categoria',
    'Anno su anno',
  ]);
  await expect(frames.first().getByRole('list', { name: 'Legenda' })).toContainText(
    'da letture, non ancora fatturato',
  );
  await expect(page.getByTestId('kpi-tile')).toHaveCount(2);
});

test("l'ultima etichetta dei mesi resta dentro ogni grafico", async ({ page }) => {
  const ids = await seedSupplyIds('seed-a@example.test');

  for (const path of [`/forniture/${ids.Luce}`, '/']) {
    await page.goto(path);
    const overflows = await page.locator('svg.recharts-surface').evaluateAll((charts) =>
      charts.map((chart) => {
        const right = chart.getBoundingClientRect().right;
        // Month labels («gen 2026», or «gen» on the year lines) and the years ending those lines.
        const months = [...chart.querySelectorAll('text')].filter((text) =>
          /^(?:[a-z]{3}(?: \d{4})?|\d{4})$/.test(text.textContent?.trim() ?? ''),
        );
        return months.length === 0
          ? null
          : Math.max(...months.map((month) => month.getBoundingClientRect().right - right));
      }),
    );

    expect(overflows.length).toBeGreaterThan(0);
    // The line chart puts its last month on the plot's edge: the margin must hold half a label.
    for (const overflow of overflows) {
      expect(overflow).not.toBeNull();
      expect(overflow).toBeLessThanOrEqual(0);
    }
  }
});

test('con ?periodo=12 ogni grafico ha una tabella di 12 righe', async ({ page }) => {
  const ids = await seedSupplyIds('seed-a@example.test');

  await page.goto(`/forniture/${ids.Luce}?periodo=12`);
  await expectTablesOf(page, 12);
  await expect(page.getByRole('link', { name: '12 mesi' })).toHaveAttribute('aria-current', 'true');

  await page.goto(`/forniture/${ids.Luce}`);
  await expect(
    page.getByTestId('chart-frame').first().locator('details table tbody tr'),
  ).toHaveCount(24);
});

test('anno su anno segue il periodo: barre sui 12 mesi, una linea per anno su 24 e su tutto', async ({
  page,
}) => {
  const ids = await seedSupplyIds('seed-a@example.test');
  const yearOverYear = page.getByTestId('chart-frame').filter({ hasText: 'Anno su anno' });

  await page.goto(`/forniture/${ids.Luce}?periodo=12`);
  await expect(yearOverYear.getByRole('list', { name: 'Legenda' })).toContainText("quest'anno");
  await expect(yearOverYear.locator('details table tbody tr')).toHaveCount(12);

  for (const periodo of ['24', 'tutto']) {
    await page.goto(`/forniture/${ids.Luce}?periodo=${periodo}`);
    const legend = yearOverYear.getByRole('list', { name: 'Legenda' });
    await expect(legend).not.toContainText("quest'anno");
    const years = (await legend.getByRole('listitem').allTextContents()).map((text) => text.trim());
    expect(years.length).toBeGreaterThanOrEqual(2);
    for (const year of years) expect(year).toMatch(/^\d{4}$/);
    // Newest first: the first year is the current one.
    expect([...years].sort().reverse()).toEqual(years);
    // January to December, one row per month whatever the range.
    await expect(yearOverYear.locator('details table tbody tr')).toHaveCount(12);
    await expect(yearOverYear.locator('details table tbody tr').first()).toContainText('gen');
  }
  // The 12-month tiles do not move with the range.
  await expect(page.getByTestId('kpi-tile')).toHaveCount(2);
});

test('il gas chiama «Consumo» la serie senza fasce, non «Fascia unica»', async ({ page }) => {
  const ids = await seedSupplyIds('seed-a@example.test');

  await page.goto(`/forniture/${ids.Gas}`);

  const legend = page.getByTestId('chart-frame').first().getByRole('list', { name: 'Legenda' });
  await expect(legend).toContainText('Consumo');
  await expect(legend).not.toContainText('Fascia unica');
  // The total per unit is over 12 months: one month of summer gas is mostly fixed shares.
  const unitPrice = page.getByTestId('chart-frame').filter({ hasText: 'Costo unitario' });
  await expect(unitPrice.getByRole('list', { name: 'Legenda' })).toContainText('ultimi 12 mesi');
  // The two lines can cross: «Come si legge» says what each one is and why.
  await unitPrice.getByText('Come si legge').click();
  await expect(unitPrice.getByText('Perché le linee si incrociano')).toBeVisible();
  await expect(unitPrice.getByText(/diviso per i Smc consumati negli stessi mesi/)).toBeVisible();
});

test("l'acqua dice che non ha un riferimento nazionale", async ({ page }) => {
  const ids = await seedSupplyIds('seed-a@example.test');

  await page.goto(`/forniture/${ids.Acqua}`);

  await expect(page.getByText(WATER_NOTE)).toBeVisible();
});

test('una fornitura a canone mostra i costi e la spesa anno su anno', async ({ page }) => {
  const ids = await seedSupplyIds('seed-a@example.test');

  await page.goto(`/forniture/${ids.Internet}?periodo=12`);

  await expect(page.getByTestId('chart-frame')).toHaveCount(2);
  await expect(page.getByTestId('kpi-tile')).toHaveCount(1);
  await expectTablesOf(page, 12);
});

test('la Casa mostra i due riquadri, i costi della casa e una card per fornitura', async ({
  page,
}) => {
  await page.goto('/?periodo=12');

  await expect(page.getByTestId('kpi-tile')).toHaveCount(2);
  await expect(page.getByText('Ultimi 12 mesi fatturati:')).toBeVisible();
  await expect(page.getByTestId('supply-card')).toHaveCount(4);
  await expect(page.getByTestId('supply-last-month')).toHaveCount(4);
  await expectTablesOf(page, 12);
});
