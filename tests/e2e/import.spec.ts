/**
 * The bulk import with the fake services (every fake extraction answers after 1.5 s, the failing
 * fixtures at once). Each test registers its own user with «Casa Gazza», the decoy word of this
 * file, so the mobile and desktop projects and the other files never share a document or a
 * SHA-256; seed users A and B are not touched.
 */
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { createClient } from '@libsql/client';
import { expect, type Page, test } from '@playwright/test';
import { createHouse, E2E_DB_URL, gotoReady, SAVED_BILL_URL, signUpTestUser } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BILLS = 'tests/fixtures/bills';
const HOUSE = 'Casa Gazza';
const REVIEW_URL = /\/bollette\/revisione\/[^/]+$/;
const ESTIMATE = /circa \d+,\d\d \$/;

function pdf(file: string, name = file) {
  return { name, mimeType: 'application/pdf', buffer: readFileSync(`${BILLS}/${file}`) };
}

/**
 * The user's extractions that belong to a batch: all of them, and the ones that have started.
 * Read from the database because the fake extractor keeps no count (and the other files run in
 * parallel); the single upload of the first step has a start but no batch.
 */
async function batchCounts(email: string): Promise<{ all: number; started: number }> {
  const client = createClient({ url: E2E_DB_URL });
  try {
    const query = `select count(*) as n from extractions e join users u on u.id = e.user_id
      where u.email = ? and e.batch_id is not null`;
    const all = await client.execute({ sql: query, args: [email.toLowerCase()] });
    const started = await client.execute({
      sql: `${query} and e.started_at is not null`,
      args: [email.toLowerCase()],
    });
    return { all: Number(all.rows[0]?.n), started: Number(started.rows[0]?.n) };
  } finally {
    client.close();
  }
}

function importRow(page: Page, name: string) {
  return page.getByTestId('import-row').filter({ has: page.getByText(name, { exact: true }) });
}

/** Opens the importer, chooses the files and uploads them, up to the estimate. */
async function chooseAndUpload(page: Page, files: Array<ReturnType<typeof pdf>>): Promise<void> {
  await gotoReady(page, '/bollette/importa');
  await page.getByLabel('File delle bollette').setInputFiles(files);
  await expect(page.getByTestId('import-row')).toHaveCount(files.length);
  await page.getByRole('button', { name: `Carica ${files.length} file` }).click();
  await expect(page.getByTestId('import-estimate')).toBeVisible({ timeout: 30_000 });
}

/** In the review of a bill whose supply does not exist yet: a new one in «Casa Gazza». */
async function assignToNewSupply(page: Page): Promise<void> {
  await page.getByLabel('A quale fornitura appartiene?').selectOption({
    label: 'Crea una nuova fornitura',
  });
  await page.getByLabel('Casa', { exact: true }).selectOption({ label: HOUSE });
}

test('dal lotto alla revisione, dalla bolletta più vecchia', async ({ page }) => {
  test.setTimeout(240_000);
  const { email } = await signUpTestUser(page, 'import');
  await createHouse(page, HOUSE);

  await test.step('una bolletta caricata da sola, come prima', async () => {
    await gotoReady(page, '/bollette/carica');
    await page.getByLabel('Scegli PDF o foto').setInputFiles(`${BILLS}/internet-armadillo.pdf`);
    await page.getByRole('button', { name: 'Carica', exact: true }).click();
    await page.getByRole('button', { name: /^Estrai \(circa .+ \$\)$/ }).click();
    await expect(page).toHaveURL(REVIEW_URL);
    await assignToNewSupply(page);
    await page.getByRole('button', { name: 'Conferma', exact: true }).click();
    await expect(page).toHaveURL(SAVED_BILL_URL);
  });

  await test.step('il lotto: doppioni saltati e la stima prima di tutto', async () => {
    await chooseAndUpload(page, [
      pdf('luce-pellicano.pdf'),
      pdf('gas-pellicano.pdf'),
      pdf('acqua-castoro.pdf'),
      pdf('internet-armadillo.pdf', 'internet-armadillo-copia.pdf'),
      pdf('acqua-castoro.pdf', 'acqua-castoro-copia.pdf'),
    ]);
    await expect(importRow(page, 'internet-armadillo-copia.pdf')).toContainText('già presente');
    await expect(importRow(page, 'acqua-castoro-copia.pdf')).toContainText(
      'doppione di acqua-castoro.pdf',
    );
    const estimate = page.getByTestId('import-estimate');
    await expect(estimate).toContainText('3 bollette pronte');
    await expect(estimate).toContainText(ESTIMATE);
    // Nothing runs before the click.
    expect(await batchCounts(email)).toEqual({ all: 3, started: 0 });
  });

  await test.step('l’estrazione, due alla volta', async () => {
    await page.getByRole('button', { name: 'Avvia estrazione' }).click();
    for (const name of ['luce-pellicano.pdf', 'gas-pellicano.pdf', 'acqua-castoro.pdf']) {
      await expect(importRow(page, name)).toContainText('da rivedere', { timeout: 20_000 });
    }
    await expect(page.getByRole('status').filter({ hasText: 'Estratte 3' })).toContainText(
      'Estratte 3, fallite 0',
    );
    expect(await batchCounts(email)).toEqual({ all: 3, started: 3 });
  });

  await test.step('la revisione del lotto, dalla più vecchia', async () => {
    await page.getByRole('link', { name: 'Rivedi le bollette' }).click();
    await expect(page).toHaveURL(/\/bollette\/da-rivedere\?lotto=[A-Za-z0-9_-]{21}$/);
    const rows = page.getByTestId('pending-extraction');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('dal 01/07/2024');
    await expect(rows.nth(1)).toContainText('dal 01/09/2024');
    await expect(rows.nth(2)).toContainText('dal 01/09/2024');
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);

    await rows.nth(0).getByRole('link', { name: 'Rivedi' }).click();
    for (let index = 0; index < 3; index += 1) {
      await expect(page).toHaveURL(REVIEW_URL);
      const reviewUrl = page.url();
      await assignToNewSupply(page);
      await expect(page.getByRole('button', { name: 'Conferma', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Conferma e passa alla prossima' }).click();
      await expect(page).not.toHaveURL(reviewUrl);
    }
    await expect(page).toHaveURL(/\/bollette\/da-rivedere\?lotto=/);
    await expect(page.getByText('Nessuna bolletta da rivedere in questo lotto.')).toBeVisible();
  });
});

test('una pagina ricaricata a metà si riprende da «Lotti in sospeso»', async ({ page }) => {
  test.setTimeout(120_000);
  await signUpTestUser(page, 'import');
  await createHouse(page, HOUSE);
  await chooseAndUpload(page, [
    pdf('luce-pellicano.pdf'),
    pdf('gas-pellicano.pdf'),
    pdf('acqua-castoro.pdf'),
  ]);

  await page.getByRole('button', { name: 'Avvia estrazione' }).click();
  await expect(
    page.getByTestId('import-row').filter({ hasText: 'in corso' }).first(),
  ).toBeVisible();
  await page.reload();
  await page.waitForSelector('body[data-hydrated]');

  const batch = page.getByTestId('pending-batch');
  await expect(batch).toHaveCount(1);
  const resume = batch.getByRole('link', { name: /^Riprendi \(1 in coda, circa .+ \$\)$/ });
  await expect(resume).toBeVisible();
  const href = (await resume.getAttribute('href')) ?? '';
  const batchId = new URLSearchParams(href.split('?')[1]).get('lotto');
  await resume.click();
  await expect(page).toHaveURL(`/bollette/importa?lotto=${batchId}`);
  await page.waitForSelector('body[data-hydrated]');
  // Opening the batch starts nothing: the queued bill waits for «Riprendi».
  await expect(page.getByTestId('import-row').filter({ hasText: 'in coda' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Riprendi' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Estratte' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('import-row').filter({ hasText: 'in coda' })).toHaveCount(0);

  // The two runs cut by the reload finish on the server on their own.
  await expect(async () => {
    await page.goto(`/bollette/da-rivedere?lotto=${batchId}`);
    await expect(
      page.getByTestId('pending-extraction').filter({ hasText: 'da rivedere' }),
    ).toHaveCount(3, { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
});

test('un servizio che non risponde mette in pausa la coda', async ({ page }) => {
  test.setTimeout(120_000);
  await signUpTestUser(page, 'import');
  await createHouse(page, HOUSE);
  await chooseAndUpload(page, [
    pdf('luce-pellicano-rotta.pdf'),
    pdf('gas-pellicano.pdf'),
    pdf('acqua-castoro.pdf'),
  ]);

  await page.getByRole('button', { name: 'Avvia estrazione' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Anthropic' })).toHaveText(
    'Anthropic non risponde: riprendi più tardi',
    { timeout: 20_000 },
  );
  await expect(importRow(page, 'acqua-castoro.pdf')).toContainText('in coda');
  await expect(importRow(page, 'gas-pellicano.pdf')).toContainText('da rivedere');

  await page.getByRole('button', { name: 'Riprendi' }).click();
  await expect(importRow(page, 'acqua-castoro.pdf')).toContainText('da rivedere', {
    timeout: 20_000,
  });
});
