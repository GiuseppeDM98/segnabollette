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

test('il gas chiama «Consumo» la serie senza fasce, non «Fascia unica»', async ({ page }) => {
  const ids = await seedSupplyIds('seed-a@example.test');

  await page.goto(`/forniture/${ids.Gas}`);

  const legend = page.getByTestId('chart-frame').first().getByRole('list', { name: 'Legenda' });
  await expect(legend).toContainText('Consumo');
  await expect(legend).not.toContainText('Fascia unica');
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
