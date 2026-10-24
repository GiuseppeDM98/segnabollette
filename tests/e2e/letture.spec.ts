/**
 * Self readings with a user of its own («Casa Tucano»): banded registers once a bill has banded
 * readings, the bill's readings cannot be deleted here, a lower value asks for confirmation.
 */
import { expect, test } from '@playwright/test';
import {
  createHouse,
  createSupply,
  gotoReady,
  lineAmounts,
  SAVED_BILL_URL,
  signUpTestUser,
} from './helpers';

const HOUSE = 'Casa Tucano';

test('autoletture a fasce, elenco e valore più basso', async ({ page }) => {
  await signUpTestUser(page, 'tucano');
  await createHouse(page, HOUSE);
  const supplyId = await createSupply(page, HOUSE, { kind: 'Luce', label: 'Luce tucano' });

  await test.step('una bolletta con letture F1, F2, F3', async () => {
    await gotoReady(page, `/bollette/nuova?fornitura=${supplyId}`);
    await page.getByLabel('Dal', { exact: true }).fill('2025-01-01');
    await page.getByLabel('Al', { exact: true }).fill('2025-01-31');
    for (const [index, amount] of ['10', '5', '4', '3', '2', '2,4'].entries()) {
      await lineAmounts(page).nth(index).fill(amount);
    }
    await page.getByTestId('bill-total').fill('26,40');
    for (const [index, [register, value]] of [
      ['F1', '1000'],
      ['F2', '800'],
      ['F3', '600'],
    ].entries()) {
      await page.getByRole('button', { name: 'Aggiungi lettura' }).click();
      const row = page.getByTestId('bill-reading').nth(index);
      await row.getByLabel('Registro').selectOption(register ?? '');
      await row.getByLabel('Valore').fill(value ?? '');
    }
    await page.getByRole('button', { name: 'Salva bolletta' }).click();
    await expect(page).toHaveURL(SAVED_BILL_URL);
  });

  const form = page.getByTestId('self-reading-form');

  await test.step('propone F1, F2, F3 e salva l’autolettura', async () => {
    await gotoReady(page, `/letture?fornitura=${supplyId}`);
    for (const register of ['F1', 'F2', 'F3']) {
      await expect(form.getByLabel(register, { exact: true })).toBeVisible();
    }
    await expect(form.getByLabel('Lettura', { exact: true })).toHaveCount(0);
    await form.getByLabel('F1', { exact: true }).fill('1100');
    await form.getByLabel('F2', { exact: true }).fill('900');
    await form.getByLabel('F3', { exact: true }).fill('700');
    await form.getByRole('button', { name: 'Salva', exact: true }).click();
    await expect(form.getByRole('status')).toHaveText('Autolettura salvata.');

    const selfRows = page.getByTestId('reading-row').filter({ hasText: 'autolettura' });
    await expect(selfRows).toHaveCount(3);
    await expect(selfRows.filter({ hasText: '1100 kWh' })).toHaveCount(1);
    const billRows = page.getByTestId('reading-row').filter({ hasText: 'da bolletta' });
    await expect(billRows).toHaveCount(3);
    await expect(billRows.getByRole('button', { name: 'Elimina' })).toHaveCount(0);
  });

  await test.step('un F1 più basso avvisa e chiede conferma', async () => {
    await form.getByLabel('F1', { exact: true }).fill('1050');
    await expect(form.getByTestId('lower-reading-warning')).toContainText(
      "Il valore è più basso dell'ultima lettura",
    );
    await form.getByRole('button', { name: 'Salva', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Salva comunque' }).click();
    await expect(form.getByRole('status')).toHaveText('Autolettura salvata.');
    await expect(
      page.getByTestId('reading-row').filter({ hasText: '1050 kWh' }).filter({ hasText: 'F1' }),
    ).toHaveCount(1);
  });
});
