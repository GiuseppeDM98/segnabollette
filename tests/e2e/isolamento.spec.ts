/**
 * Isolation through the pages and the save action. Seed users A and B read (and never write); the
 * write pair uses a user of its own («Casa Ibis») and tampers with the bound bill id.
 */
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../../src/lib/db/create-db';
import { bills } from '../../src/lib/db/schema/app';
import {
  createHouse,
  createSupply,
  E2E_DB_URL,
  enterBill,
  gotoReady,
  SEED_A_STATE,
  SEED_B_STATE,
  seedIds,
  signUpTestUser,
} from './helpers';

function urls(ids: { houseId: string; supplyId: string; billId: string }): string[] {
  return [
    `/bollette/${ids.billId}`,
    `/bollette/${ids.billId}/modifica`,
    `/forniture/${ids.supplyId}`,
    `/forniture/${ids.supplyId}?periodo=tutto`,
    `/?casa=${ids.houseId}`,
    `/?casa=${ids.houseId}&periodo=12`,
    `/bollette/nuova?fornitura=${ids.supplyId}`,
    `/bollette?fornitura=${ids.supplyId}`,
    `/letture?fornitura=${ids.supplyId}`,
  ];
}

// The bill pages refuse twice: `getBill` filters by user, then `getBillDetail` checks the supply
// with the user too. Dropping one check alone keeps these URLs a 404 (measured 2026-10-24); the
// unit tests catch `getBill` without its user, this test catches losing both checks.
test.describe('letture di A', () => {
  test.use({ storageState: SEED_A_STATE });

  test('le pagine con gli id di B danno 404, con quelli di A si aprono', async ({ page }) => {
    const own = await seedIds('seed-a@example.test');
    const other = await seedIds('seed-b@example.test');

    for (const url of urls(other)) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(404);
      await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toBeVisible();
    }
    for (const url of urls(own)) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toHaveCount(0);
    }
  });
});

// The other half of the pair: the very URLs that gave A a 404 open for B, so that 404 came from
// the owner check and not from an id that does not exist.
test.describe('letture di B', () => {
  test.use({ storageState: SEED_B_STATE });

  test('le pagine con gli id di B si aprono per B', async ({ page }) => {
    const own = await seedIds('seed-b@example.test');

    for (const url of urls(own)) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(200);
      await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toHaveCount(0);
    }
  });
});

async function billRow(billId: string) {
  const { db, client } = createDb({ url: E2E_DB_URL });
  try {
    const [row] = await db.select().from(bills).where(eq(bills.id, billId));
    return row;
  } finally {
    client.close();
  }
}

test('salvare con l’id di una bolletta di B dà NOT_FOUND; con il proprio passa', async ({
  page,
}) => {
  await signUpTestUser(page, 'ibis');
  await createHouse(page, 'Casa Ibis');
  const supplyId = await createSupply(page, 'Casa Ibis', {
    kind: 'Internet e telefono',
    label: 'Internet ibis',
  });
  const ownId = await enterBill(page, supplyId, {
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    amounts: ['20', '4,4'],
    total: '24,40',
  });
  const { billId: otherId } = await seedIds('seed-b@example.test');
  const otherBefore = await billRow(otherId);

  await gotoReady(page, `/bollette/${ownId}/modifica`);
  // The action's answer is read inside the route: once the page reacts, the body may be gone.
  const answers: Array<{ tampered: boolean; body: string }> = [];
  await page.route(`**/bollette/${ownId}/modifica`, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || !request.headers()['next-action']) {
      await route.continue();
      return;
    }
    const original = request.postData() ?? '';
    const postData = original.replaceAll(ownId, otherId);
    const response = await route.fetch({ postData });
    answers.push({ tampered: postData !== original, body: await response.text() });
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Salva bolletta' }).click();
  await expect(page.getByTestId('form-errors')).toContainText('Non trovato.');
  expect(answers).toHaveLength(1);
  expect(answers[0]?.tampered).toBe(true);
  expect(answers[0]?.body).toContain('NOT_FOUND');
  expect(await billRow(otherId)).toEqual(otherBefore);

  await page.unrouteAll();
  await page.getByRole('button', { name: 'Salva bolletta' }).click();
  await expect(page).toHaveURL(`/bollette/${ownId}`);
});
