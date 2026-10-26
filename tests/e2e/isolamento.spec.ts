/**
 * Isolation through the pages and the save action. Seed users A and B read (and never write); the
 * write pair uses a user of its own («Casa Ibis») and tampers with the bound bill id; the upload
 * pairs register two users of their own, P and Q; the batch pair a user of its own, read by seed A.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type BrowserContext, expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
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

// Upload, files and review: P owns an extracted bill, Q tries the same URLs. The pair on the upload
// token lives in the service tests: under Playwright there is no real handleUpload.
test.describe('estrazioni di P', () => {
  let p: BrowserContext;
  let q: BrowserContext;
  let extractionId = '';
  let documentId = '';

  test.beforeAll(async ({ browser }) => {
    p = await browser.newContext();
    q = await browser.newContext();
    await signUpTestUser(await p.newPage(), 'isolamento-p');
    await signUpTestUser(await q.newPage(), 'isolamento-q');

    const bytes = readFileSync('tests/fixtures/bills/internet-armadillo.pdf');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const created = await p.request.post('/api/extractions', {
      data: {
        supplyId: null,
        batchId: null,
        files: [{ sha256, contentType: 'application/pdf', sizeBytes: bytes.length }],
      },
    });
    expect(created.status()).toBe(201);
    const body = (await created.json()) as {
      extractionId: string;
      documents: Array<{ documentId: string; pathname: string }>;
    };
    extractionId = body.extractionId;
    const [document] = body.documents;
    if (!document) throw new Error('no planned document');
    documentId = document.documentId;
    const query = new URLSearchParams({ documentId, pathname: document.pathname });
    expect(
      (await p.request.put(`/api/e2e/blob?${query.toString()}`, { data: bytes })).status(),
    ).toBe(204);
    expect((await p.request.post(`/api/extractions/${extractionId}/uploaded`)).status()).toBe(200);
    const run = await p.request.post(`/api/extractions/${extractionId}/run`);
    expect(await run.json()).toMatchObject({ status: 'extracted' });
  });

  test.afterAll(async () => {
    await p.close();
    await q.close();
  });

  test('il file, l’esecuzione e la revisione di P sono di P soltanto', async () => {
    expect((await p.request.get(`/api/documents/${documentId}`)).status()).toBe(200);
    expect((await q.request.get(`/api/documents/${documentId}`)).status()).toBe(404);

    const again = await p.request.post(`/api/extractions/${extractionId}/run`);
    expect(again.status()).toBe(409);
    expect(await again.json()).toMatchObject({ code: 'EXTRACTION_BUSY' });
    expect((await q.request.post(`/api/extractions/${extractionId}/run`)).status()).toBe(404);

    const pPage = await p.newPage();
    const qPage = await q.newPage();
    expect((await pPage.goto(`/bollette/revisione/${extractionId}`))?.status()).toBe(200);
    expect((await qPage.goto(`/bollette/revisione/${extractionId}`))?.status()).toBe(404);
  });
});

// A batch of a user registered here, read through the batch pages by its owner (positive control)
// and by seed A, who only reads: another user's batch id gives an empty list, never its rows.
test('le pagine di un lotto mostrano le righe solo al suo proprietario', async ({
  page,
  browser,
}) => {
  await signUpTestUser(page, 'isolamento-lotto');
  const batchId = nanoid();
  const bytes = readFileSync('tests/fixtures/bills/acqua-castoro.pdf');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const created = await page.request.post('/api/extractions', {
    data: {
      supplyId: null,
      batchId,
      files: [{ sha256, contentType: 'application/pdf', sizeBytes: bytes.length }],
    },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as {
    extractionId: string;
    documents: Array<{ documentId: string; pathname: string }>;
  };
  const [document] = body.documents;
  if (!document) throw new Error('no planned document');
  const query = new URLSearchParams({
    documentId: document.documentId,
    pathname: document.pathname,
  });
  expect(
    (await page.request.put(`/api/e2e/blob?${query.toString()}`, { data: bytes })).status(),
  ).toBe(204);
  expect((await page.request.post(`/api/extractions/${body.extractionId}/uploaded`)).status()).toBe(
    200,
  );

  await gotoReady(page, `/bollette/da-rivedere?lotto=${batchId}`);
  await expect(page.getByTestId('pending-extraction')).toHaveCount(1);
  await expect(page.getByTestId('pending-extraction')).toContainText('in coda');

  const seedA = await browser.newContext({ storageState: SEED_A_STATE });
  try {
    const intruder = await seedA.newPage();
    await intruder.goto(`/bollette/da-rivedere?lotto=${batchId}`);
    await expect(intruder.getByText('Nessuna bolletta da rivedere in questo lotto.')).toBeVisible();
    await expect(intruder.getByTestId('pending-extraction')).toHaveCount(0);
    await intruder.goto(`/bollette/importa?lotto=${batchId}`);
    await expect(intruder.getByText('Nessuna bolletta in questo lotto.')).toBeVisible();
  } finally {
    await seedA.close();
  }
});
