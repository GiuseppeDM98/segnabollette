/**
 * Houses and supplies from the UI, with a user of its own («Casa Quokka»): the identifier is
 * normalized, panels only on electricity, archived supplies leave the home page, a house delete
 * says what it removes.
 */
import { expect, test } from '@playwright/test';
import { createHouse, createSupply, gotoReady, housePanel, signUpTestUser } from './helpers';

const HOUSE = 'Casa Quokka';

test('case e forniture: crea, archivia, riattiva, elimina', async ({ page }) => {
  await signUpTestUser(page, 'quokka');
  await createHouse(page, HOUSE);

  const electricityId = await test.step('luce con identificativo normalizzato', async () => {
    const id = await createSupply(page, HOUSE, {
      kind: 'Luce',
      label: 'Luce quokka',
      supplier: 'Quokka Energia',
      identifier: 'it 001 e 0000-0042',
    });
    await gotoReady(page, `/forniture/${id}`);
    await expect(page.getByTestId('supply-identifier')).toHaveText('IT001E00000042');
    return id;
  });

  await test.step('il gas non propone il fotovoltaico', async () => {
    await gotoReady(page, '/forniture');
    const panel = housePanel(page, HOUSE);
    await panel.getByRole('button', { name: 'Nuova fornitura' }).click();
    const form = panel.getByTestId('supply-form');
    await expect(form.getByLabel('Impianto fotovoltaico')).toBeVisible();
    await form.getByLabel('Tipo').selectOption({ label: 'Gas' });
    await expect(form.getByLabel('Impianto fotovoltaico')).toHaveCount(0);
    await form.getByLabel('Nome').fill('Gas quokka');
    await form.getByRole('button', { name: 'Crea fornitura' }).click();
    await expect(panel.getByRole('link', { name: 'Gas quokka' })).toBeVisible();
  });

  await test.step('la Casa ha una card per fornitura', async () => {
    await gotoReady(page, '/');
    await expect(page.getByTestId('supply-card')).toHaveCount(2);
  });

  await test.step('archiviata, la luce lascia la Casa; riattivata, torna', async () => {
    await gotoReady(page, `/forniture/${electricityId}`);
    await page.getByRole('button', { name: 'Archivia' }).click();
    await expect(page.getByRole('button', { name: 'Riattiva' })).toBeVisible();
    await gotoReady(page, '/');
    await expect(page.getByTestId('supply-card')).toHaveCount(1);

    await gotoReady(page, `/forniture/${electricityId}`);
    await page.getByRole('button', { name: 'Riattiva' }).click();
    await expect(page.getByRole('button', { name: 'Archivia' })).toBeVisible();
    await gotoReady(page, '/');
    await expect(page.getByTestId('supply-card')).toHaveCount(2);
  });

  await test.step('eliminare la casa dice che cosa sparisce', async () => {
    await gotoReady(page, '/forniture');
    await housePanel(page, HOUSE).getByRole('button', { name: 'Elimina' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('deletion-summary')).toHaveText(
      'Eliminerai 2 forniture, 0 bollette e 0 letture.',
    );
    await dialog.getByRole('button', { name: 'Elimina casa' }).click();
    await expect(page.getByRole('heading', { name: HOUSE })).toHaveCount(0);
    await gotoReady(page, '/');
    await expect(page.getByRole('heading', { name: 'Comincia creando la tua casa' })).toBeVisible();
  });
});
