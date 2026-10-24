/**
 * Closed signup on the :3101 server: the page says so and the server itself refuses, so a client
 * that skips the page creates no user either.
 */
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../../src/lib/db/create-db';
import { users } from '../../src/lib/db/schema/auth';

const CLOSED = 'http://localhost:3101';

test('la pagina di registrazione dice che le iscrizioni sono chiuse', async ({ page }) => {
  await page.goto('/registrati');

  await expect(page.getByRole('heading', { name: 'Le iscrizioni sono chiuse' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Accedi' })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('la pagina di accesso non propone la registrazione', async ({ page }) => {
  await page.goto('/accedi');

  await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrati' })).toHaveCount(0);
});

test('il server rifiuta la registrazione anche chiamato direttamente', async ({ request }) => {
  const email = `chiuso-${Date.now()}@example.test`;

  const response = await request.post('/api/auth/sign-up/email', {
    headers: { Origin: CLOSED },
    data: { name: 'Tapiro', email, password: 'password-tapiro-1' },
  });

  expect(response.status()).toBeGreaterThanOrEqual(400);
  const { db, client } = createDb({ url: 'file:e2e.db' });
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  client.close();
  expect(rows).toHaveLength(0);
});
