/**
 * A hand-typed bill end to end, with a user of its own («Casa Capibara»): required amounts, the
 * live summary and its warnings, subtotals, gas with C and PCS, a flat fee marked estimated, an
 * overlapping bill that replaces the first, edit and delete.
 */
import { expect, type Page, test } from '@playwright/test';
import {
  createHouse,
  createSupply,
  enterBill,
  gotoReady,
  lineAmounts,
  SAVED_BILL_URL,
  signUpTestUser,
} from './helpers';

const HOUSE = 'Casa Capibara';
const JANUARY = { periodStart: '2025-01-01', periodEnd: '2025-01-31' };
/** Energia, vendita, rete, oneri, accise, IVA: round invented figures. */
const ELECTRICITY_AMOUNTS = ['10', '5', '4', '3', '2', '2,4'];

async function fillNewBill(page: Page, supplyId: string, amounts: string[], total: string) {
  await gotoReady(page, `/bollette/nuova?fornitura=${supplyId}`);
  await page.getByLabel('Dal', { exact: true }).fill(JANUARY.periodStart);
  await page.getByLabel('Al', { exact: true }).fill(JANUARY.periodEnd);
  for (const [index, amount] of amounts.entries()) await lineAmounts(page).nth(index).fill(amount);
  await page.getByTestId('bill-total').fill(total);
}

test('bolletta a mano: nuova, scheda, sovrapposizione, modifica, eliminazione', async ({
  page,
}) => {
  await signUpTestUser(page, 'capibara');
  await createHouse(page, HOUSE);
  const electricityId = await createSupply(page, HOUSE, { kind: 'Luce', label: 'Luce capibara' });

  await test.step('il modulo nuovo ha importi e totale vuoti e li chiede', async () => {
    await gotoReady(page, `/bollette/nuova?fornitura=${electricityId}`);
    const amounts = lineAmounts(page);
    await expect(amounts).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) await expect(amounts.nth(index)).toHaveValue('');
    await expect(page.getByTestId('bill-total')).toHaveValue('');

    const bands = page.getByTestId('bill-line').first().getByLabel('Fascia').locator('option');
    await expect(bands).toHaveText(['—', 'F1', 'F2', 'F3', 'F23', 'unica']);

    await fillNewBill(page, electricityId, ELECTRICITY_AMOUNTS.slice(0, 5), '26,40');
    const summary = page.getByRole('region', { name: 'Riepilogo' });
    await expect(summary).toContainText('Materia prima');
    await expect(summary).toContainText('10,00');
    await expect(page.getByTestId('computed-total')).toContainText('24,00');
    await expect(page.getByTestId('arithmetic-warnings')).toContainText(
      /Le voci sommano 24,00\s€, il totale stampato è 26,40\s€/,
    );
    await page.getByRole('button', { name: 'Salva bolletta' }).click();

    const vatLine = page.getByTestId('bill-line').nth(5);
    await expect(vatLine.getByTestId('field-error')).toHaveText('Importo obbligatorio');
    await expect(page).toHaveURL(/\/bollette\/nuova/);
    await gotoReady(page, '/bollette');
    await expect(page.getByTestId('bill-row')).toHaveCount(0);
  });

  const firstId = await test.step('la luce dal modello mostra i subtotali', async () => {
    const id = await enterBill(page, electricityId, {
      ...JANUARY,
      amounts: ELECTRICITY_AMOUNTS,
      total: '26,40',
    });
    const groups = page.getByTestId('line-group');
    await expect(groups).toHaveCount(6);
    await expect(groups.first()).toContainText('Materia prima');
    await expect(groups.first().getByTestId('group-subtotal')).toContainText('10,00');
    await expect(page.getByTestId('bill-total')).toContainText('26,40');
    return id;
  });

  await test.step('il gas tiene C e PCS', async () => {
    const gasId = await createSupply(page, HOUSE, { kind: 'Gas', label: 'Gas capibara' });
    await gotoReady(page, `/bollette/nuova?fornitura=${gasId}`);
    await page.getByLabel('Coefficiente C').fill('1,02');
    await page.getByLabel('Potere calorifico superiore (GJ/Smc)').fill('0,0385');
    for (const [index, amount] of ['10', '7', '6', '-1', '3', '4'].entries()) {
      await lineAmounts(page).nth(index).fill(amount);
    }
    await page.getByTestId('bill-total').fill('29');
    await page.getByRole('button', { name: 'Salva bolletta' }).click();
    await expect(page).toHaveURL(SAVED_BILL_URL);
    await expect(page.getByText('1,02', { exact: true })).toBeVisible();
    await expect(page.getByText('0,0385', { exact: true })).toBeVisible();
  });

  await test.step('internet con canone e IVA, stimata e con il totale che non torna', async () => {
    const telecomId = await createSupply(page, HOUSE, {
      kind: 'Internet e telefono',
      label: 'Internet capibara',
    });
    await fillNewBill(page, telecomId, ['20', '4,4'], '25');
    await page.getByLabel('Consumi stimati').check();
    await page.getByRole('button', { name: 'Salva bolletta' }).click();
    await expect(page).toHaveURL(SAVED_BILL_URL);
    await expect(page.getByText('Canone', { exact: true })).toBeVisible();
    await expect(page.getByTestId('line-group')).toHaveCount(2);
    await expect(page.getByTestId('line-group').filter({ hasText: 'IVA' })).toHaveCount(1);
    await expect(page.getByText('stimata', { exact: true })).toBeVisible();
    await expect(page.getByTestId('arithmetic-warnings')).toContainText(
      /Le voci sommano 24,40\s€, il totale stampato è 25,00\s€/,
    );
  });

  const secondId =
    await test.step('una seconda luce sullo stesso periodo sostituisce la prima', async () => {
      await fillNewBill(page, electricityId, ELECTRICITY_AMOUNTS, '26,40');
      const save = page.getByRole('button', { name: 'Salva bolletta' });
      await save.click();
      await expect(page.getByTestId('overlap-panel')).toBeVisible();
      await expect(save).toBeDisabled();
      await page.getByLabel('Sostituisce quella vecchia').check();
      await save.click();
      await expect(page).toHaveURL(SAVED_BILL_URL);
      const id = page.url().split('/').pop() ?? '';
      expect(id).not.toBe(firstId);

      await gotoReady(page, `/bollette/${firstId}`);
      await expect(page.getByText('sostituita', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Modifica' })).toHaveCount(0);
      await page.goto(`/bollette/${firstId}/modifica`);
      await expect(page).toHaveURL(`/bollette/${firstId}`);
      return id;
    });

  await test.step('modifica un importo della seconda', async () => {
    await gotoReady(page, `/bollette/${secondId}/modifica`);
    await lineAmounts(page).first().fill('11');
    await page.getByTestId('bill-total').fill('27,40');
    await page.getByRole('button', { name: 'Salva bolletta' }).click();
    await expect(page).toHaveURL(`/bollette/${secondId}`);
    await expect(page.getByTestId('bill-total')).toContainText('27,40');
  });

  await test.step('eliminata la seconda, la prima torna normale', async () => {
    await page.getByRole('button', { name: 'Elimina' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Elimina bolletta' }).click();
    await expect(page).toHaveURL(`/forniture/${electricityId}`);

    await gotoReady(page, `/bollette/${firstId}`);
    await expect(page.getByText('sostituita', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Modifica' })).toBeVisible();
  });
});
