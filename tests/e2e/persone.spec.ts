/**
 * The people in a house over time, with a user of its own («Casa Vombato»): typed on «Forniture»,
 * a second change on the same day refused, the change marked on the house cost chart and in its
 * data table, the spending per person on «Casa».
 */
import { expect, test } from '@playwright/test';
import {
  createHouse,
  createSupply,
  enterBill,
  gotoReady,
  housePanel,
  signUpTestUser,
} from './helpers';

const HOUSE = 'Casa Vombato';
/** Energia, vendita, rete, oneri, accise, IVA: round invented figures. */
const ELECTRICITY_AMOUNTS = ['10', '5', '4', '3', '2', '2,4'];

/** The first and last day of last month, as the date inputs take them. */
function lastMonth(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

test('persone in casa: inserite, segnate sui costi, spesa per persona', async ({ page }) => {
  await signUpTestUser(page, 'vombato');
  await createHouse(page, HOUSE);
  const supplyId = await createSupply(page, HOUSE, { kind: 'Luce', label: 'Luce vombato' });
  const period = lastMonth();

  await test.step('due cambi, in ordine di data; lo stesso giorno due volte no', async () => {
    await gotoReady(page, '/forniture');
    const household = housePanel(page, HOUSE).getByTestId('household');
    for (const [from, people] of [
      [period.periodStart, '3'],
      ['2022-03-10', '2'],
    ] as const) {
      await household.getByLabel('Dal', { exact: true }).fill(from);
      await household.getByLabel('Persone', { exact: true }).fill(people);
      await household.getByRole('button', { name: 'Aggiungi' }).click();
      await expect(household.getByLabel('Persone', { exact: true })).toHaveValue('');
    }
    const entries = household.getByTestId('household-entry');
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText('dal 10/03/2022 · 2 persone');
    await expect(entries.last()).toContainText('3 persone');

    await household.getByLabel('Dal', { exact: true }).fill('2022-03-10');
    await household.getByLabel('Persone', { exact: true }).fill('4');
    await household.getByRole('button', { name: 'Aggiungi' }).click();
    await expect(household.getByRole('alert')).toContainText("c'è già un numero di persone");
    await expect(entries).toHaveCount(2);
  });

  await test.step('la Casa segna il cambio sui costi e dà la spesa per persona', async () => {
    await enterBill(page, supplyId, { ...period, amounts: ELECTRICITY_AMOUNTS, total: '26,40' });
    await gotoReady(page, '/?periodo=12');

    const costs = page.getByTestId('chart-frame').filter({ hasText: 'Costi per categoria' });
    await expect(costs.locator('svg').getByText('3 persone')).toBeVisible();
    await expect(costs.locator('details thead')).toContainText('Persone in casa');
    await expect(costs.locator('details tbody tr').last()).toContainText('3');

    const perPerson = page.getByTestId('kpi-tile').filter({ hasText: 'Spesa per persona' });
    await expect(perPerson).toBeVisible();
    await expect(perPerson).toContainText('persone in media');
  });

  await test.step('un cambio si elimina', async () => {
    await gotoReady(page, '/forniture');
    const household = housePanel(page, HOUSE).getByTestId('household');
    await household.getByRole('button', { name: /^Elimina: dal 10\/03\/2022/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina', exact: true }).click();
    await expect(household.getByTestId('household-entry')).toHaveCount(1);
  });
});
