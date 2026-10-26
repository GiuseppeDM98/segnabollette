/**
 * Upload and extraction with the fake services: the files go to the local disk store and the
 * answers come from tests/fixtures/extractions. Each project registers its own user («Casa
 * Pellicano», with «Luce» and «Gas»), so the two projects never share an extraction.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { createDb } from '../../src/lib/db/create-db';
import { extractions } from '../../src/lib/db/schema/app';
import { users } from '../../src/lib/db/schema/auth';
import {
  createHouse,
  createSupply,
  E2E_DB_URL,
  gotoReady,
  SAVED_BILL_URL,
  signUpTestUser,
} from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BILLS = 'tests/fixtures/bills';
const REVIEW_URL = /\/bollette\/revisione\/[^/]+$/;

/** The extractions of a user; Better Auth stores the email in lower case. */
async function extractionsOf(email: string) {
  const { db, client } = createDb({ url: E2E_DB_URL });
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (!user) throw new Error(`no user ${email}`);
    return await db.select().from(extractions).where(eq(extractions.userId, user.id));
  } finally {
    client.close();
  }
}

/** Opens «Carica bolletta», chooses the files and uploads them. */
async function upload(
  page: Page,
  files: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await gotoReady(page, '/bollette/carica');
  await page.getByLabel('Scegli PDF o foto').setInputFiles(files);
  await page.getByRole('button', { name: 'Carica', exact: true }).click();
}

/**
 * The ids of the bill form's fields that stick out of the form or are too narrow to read: the
 * review puts the form in a column, and it must lay itself out by that width, not the window's.
 */
async function fieldsOutOfTheForm(page: Page): Promise<string[]> {
  return page.getByTestId('bill-form').evaluate((form) => {
    const box = form.getBoundingClientRect();
    return [...form.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select')]
      .filter((field) => {
        const rect = field.getBoundingClientRect();
        return rect.right > box.right + 1 || rect.width < 40;
      })
      .map((field) => field.id);
  });
}

/** A page photographed with the phone, drawn on a canvas: a PNG the uploader turns into a JPEG. */
async function drawnPhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 600, 800);
    context.fillStyle = '#000000';
    context.font = '28px sans-serif';
    context.fillText('Armadillo Telecomunicazioni', 40, 80);
    context.fillText('Totale 30,50', 40, 140);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

test('dal file alla bolletta, coi doppioni, le code, gli errori e le foto', async ({ page }) => {
  test.setTimeout(180_000);
  const desktop = test.info().project.name === 'desktop';
  const { email } = await signUpTestUser(page, 'pellicano');
  await createHouse(page, 'Casa Pellicano');
  await createSupply(page, 'Casa Pellicano', {
    kind: 'Luce',
    label: 'Luce',
    identifier: 'IT001E00000011',
  });
  await createSupply(page, 'Casa Pellicano', {
    kind: 'Gas',
    label: 'Gas',
    identifier: '00000000000011',
  });

  await test.step('un PDF riconosciuto, rivisto e confermato', async () => {
    await upload(page, `${BILLS}/luce-pellicano.pdf`);
    const extract = page.getByRole('button', { name: /^Estrai \(circa .+ \$\)$/ });
    await expect(extract).toBeVisible();
    // Nothing runs before the click: the extraction waits in the queue.
    const [waiting] = await extractionsOf(email);
    expect(waiting).toMatchObject({ status: 'queued', startedAt: null });

    await extract.click();
    await expect(page).toHaveURL(REVIEW_URL);
    // Recognised from the identifier on the bill: no choice to make.
    await expect(page.getByText('Fornitura: Luce (Luce)')).toBeVisible();
    await expect(page.getByLabel('A quale fornitura appartiene?')).toHaveCount(0);
    if (desktop) {
      await expect(page.locator('iframe[title="La bolletta caricata"]')).toBeVisible();
    } else {
      await expect(page.locator('iframe[title="La bolletta caricata"]')).toBeHidden();
      await expect(page.getByRole('link', { name: 'Apri il PDF' })).toHaveAttribute(
        'href',
        /^\/api\/documents\/[^/]+$/,
      );
    }
    await expect(page.getByTestId('extraction-warnings')).toHaveCount(0);
    // The readings one row per date, every field inside the form.
    await expect(page.getByTestId('bill-reading')).toHaveCount(2);
    expect(await fieldsOutOfTheForm(page)).toEqual([]);

    await page.getByRole('button', { name: 'Conferma' }).click();
    await expect(page).toHaveURL(SAVED_BILL_URL);
    const document = page.getByTestId('bill-document');
    await expect(document).toHaveCount(1);
    await expect(document).toContainText('PDF, 1 pagina');
    await expect(document.getByRole('link', { name: /^Apri/ })).toBeVisible();
  });

  await test.step('lo stesso file una seconda volta', async () => {
    await upload(page, `${BILLS}/luce-pellicano.pdf`);
    await expect(page.getByRole('alert').filter({ hasText: 'Questo file' })).toContainText(
      'Questo file è già nella bolletta dal 01/09/2024 al 30/09/2024.',
    );
    await expect(page.getByRole('link', { name: 'Apri la bolletta' })).toHaveAttribute(
      'href',
      /^\/bollette\/[^/]+$/,
    );
  });

  await test.step('un PDF lasciato in coda, estratto da «Da rivedere» e scartato', async () => {
    await upload(page, `${BILLS}/gas-pellicano.pdf`);
    await expect(page.getByRole('button', { name: /^Estrai/ })).toBeVisible();

    await gotoReady(page, '/bollette/da-rivedere');
    const row = page.getByTestId('pending-extraction');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('in coda');
    await row.getByRole('button', { name: /^Estrai \(circa .+ \$\)$/ }).click();
    // Once extracted, the list opens the review by itself.
    await expect(page).toHaveURL(REVIEW_URL);
    await expect(page.getByRole('heading', { name: 'Rivedi la bolletta', level: 1 })).toBeVisible();
    await expect(
      page.getByLabel('Ricalcolo', { exact: true }).and(page.locator(':checked')),
    ).toHaveCount(2);
    await expect(page.getByLabel('Voce dal').first()).toHaveValue('2024-08-01');

    await page.getByRole('button', { name: 'Scarta' }).click();
    await expect(page).toHaveURL('/bollette/da-rivedere');
    await expect(page.getByTestId('pending-extraction')).toHaveCount(0);
  });

  await test.step('un’estrazione che fallisce', async () => {
    await upload(page, `${BILLS}/luce-pellicano-rotta.pdf`);
    await page.getByRole('button', { name: /^Estrai/ }).click();
    await expect(page.getByRole('button', { name: 'Riprova' })).toBeVisible();

    await gotoReady(page, '/bollette/da-rivedere');
    const row = page.getByTestId('pending-extraction');
    await expect(row).toContainText('fallita');
    await expect(row.getByRole('button', { name: 'Riprova' })).toBeVisible();
  });

  await test.step('una foto convertita in JPEG, da assegnare', async () => {
    await upload(page, {
      name: 'pagina.png',
      mimeType: 'image/png',
      buffer: await drawnPhoto(page),
    });
    await page.getByRole('button', { name: /^Estrai/ }).click();
    await expect(page).toHaveURL(REVIEW_URL);
    await expect(page.getByLabel('A quale fornitura appartiene?')).toBeVisible();
    await expect(page.getByTestId('extraction-warnings')).toContainText('IVA inclusa');

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
    await expect(page.getByTestId('review-badge').filter({ visible: true })).toHaveText('1');

    const [photo] = (await extractionsOf(email)).filter(
      (extraction) => extraction.status === 'extracted',
    );
    expect(photo).toBeDefined();
  });

  await test.step('la spesa del mese in Impostazioni', async () => {
    await gotoReady(page, '/impostazioni');
    const spend = page.getByTestId('extraction-spend');
    await expect(spend).toContainText('Questo mese:');
    await expect(spend).not.toContainText('Questo mese: 0,00 $');
  });
});
