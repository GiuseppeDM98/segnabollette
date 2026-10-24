/**
 * Settings: the theme with seed user A (only the cookie of this browser changes), and «Elimina
 * account» with a user of its own («Casa Koala»).
 */
import { expect, test } from '@playwright/test';
import {
  createHouse,
  createSupply,
  enterBill,
  gotoReady,
  SEED_A_STATE,
  signUpTestUser,
} from './helpers';

test.describe('tema', () => {
  test.use({ storageState: SEED_A_STATE });

  test('«Scuro» resta dopo il ricaricamento', async ({ page }) => {
    await gotoReady(page, '/impostazioni');
    await page.getByLabel('Scuro').check();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test('«Elimina account» cancella l’utente e torna ad /accedi', async ({ page }) => {
  const { email, password } = await signUpTestUser(page, 'koala');
  await createHouse(page, 'Casa Koala');
  const supplyId = await createSupply(page, 'Casa Koala', {
    kind: 'Internet e telefono',
    label: 'Internet koala',
  });
  await enterBill(page, supplyId, {
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    amounts: ['20', '4,4'],
    total: '24,40',
  });

  await gotoReady(page, '/impostazioni');
  const form = page.getByTestId('delete-account');
  await form.getByLabel('Password').fill(password);
  await form
    .getByLabel('Ho capito che bollette, letture e file vengono cancellati per sempre')
    .check();
  await form.getByRole('button', { name: 'Elimina account' }).click();
  await expect(page).toHaveURL('/accedi');

  await gotoReady(page, '/accedi');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Email o password non corretti.' }),
  ).toBeVisible();
});
