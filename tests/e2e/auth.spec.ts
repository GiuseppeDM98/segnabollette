/**
 * Sign-up, sign-out, sign-in and the protected area, on the open-signup server.
 *
 * The test signs up its own user (the seed users are read-only for Playwright); the steps share
 * that user, so they run in order within one project.
 */
import { expect, type Page, test } from '@playwright/test';

const PASSWORD = 'password-capibara-1';

test.describe.configure({ mode: 'serial' });

test.describe('accesso', () => {
  // One address per project run, so mobile and desktop never collide on the same email.
  const email = `nuovo-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

  test('senza sessione / porta ad /accedi con next', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/accedi?next=%2F');
    // Positive control of signup-closed.spec.ts: with signup open the link is there.
    await expect(page.getByRole('link', { name: 'Registrati' })).toBeVisible();
  });

  test('registra un utente nuovo e arriva sulla Casa', async ({ page }) => {
    await page.goto('/registrati');
    await page.getByLabel('Nome').fill('Capibara');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crea account' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Ciao, Capibara' })).toBeVisible();
  });

  test('esce e rientra tornando a next', async ({ page }) => {
    await signIn(page, '/accedi?next=/', email, PASSWORD);
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: 'Esci' }).click();
    await expect(page).toHaveURL('/accedi');

    await signIn(page, '/accedi?next=/', email, PASSWORD);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Ciao, Capibara' })).toBeVisible();
  });

  test('con la password sbagliata mostra un errore che non dice quale campo', async ({ page }) => {
    await signIn(page, '/accedi', email, 'password-sbagliata-1');

    // Filtered: Next's route announcer is a second, empty role="alert" on every page.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Email o password non corretti.' }),
    ).toBeVisible();
    await expect(page).toHaveURL('/accedi');
  });

  test('ignora un next esterno dopo l’accesso', async ({ page }) => {
    await signIn(page, '/accedi?next=//evil.example', email, PASSWORD);

    await expect(page).toHaveURL('/');
  });

  test('un cookie di sessione inventato non apre l’area protetta', async ({ page, baseURL }) => {
    await page
      .context()
      .addCookies([{ name: 'better-auth.session_token', value: 'fake', url: baseURL ?? '' }]);

    await page.goto('/');

    // Exactly /accedi, without next: the proxy let the cookie through and the layout redirected.
    await expect(page).toHaveURL('/accedi');
  });

  test('registrare di nuovo la stessa email dà il messaggio generico', async ({ page }) => {
    await page.goto('/registrati');
    await page.getByLabel('Nome').fill('Capibara');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crea account' }).click();

    await expect(
      page.getByRole('alert').filter({ hasText: 'Registrazione non riuscita. Riprova.' }),
    ).toBeVisible();
    await expect(page).toHaveURL('/registrati');
  });
});

async function signIn(page: Page, path: string, email: string, password: string) {
  await page.goto(path);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
}
