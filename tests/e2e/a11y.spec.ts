/**
 * axe (WCAG 2.1 A/AA) on every page, light and dark, in both projects (mobile and desktop).
 * Seed user A only reads.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { SEED_A_STATE, seedIds, seedSupplyIds } from './helpers';

const THEMES = ['light', 'dark'] as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page, path: string) {
  await page.goto(path);
  // The charts' data tables sit in closed <details>: open them so axe checks the tables too.
  await page.locator('details').evaluateAll((elements) => {
    for (const element of elements) (element as HTMLDetailsElement).open = true;
  });
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    violations.map((violation) => `${violation.id}: ${violation.nodes.length}`),
    path,
  ).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.beforeEach(async ({ context, baseURL }) => {
      await context.addCookies([{ name: 'theme', value: theme, url: baseURL ?? '' }]);
    });

    test.describe('con la sessione di A', () => {
      test.use({ storageState: SEED_A_STATE });

      test('le pagine dell’app', async ({ page }) => {
        const { supplyId, billId } = await seedIds('seed-a@example.test');
        const supplies = await seedSupplyIds('seed-a@example.test');
        for (const path of [
          '/',
          '/forniture',
          `/forniture/${supplyId}`,
          `/forniture/${supplies.Acqua}`,
          `/forniture/${supplies.Internet}`,
          '/bollette',
          '/bollette/nuova',
          `/bollette/nuova?fornitura=${supplyId}`,
          `/bollette/${billId}`,
          `/bollette/${billId}/modifica`,
          '/letture',
          '/impostazioni',
        ]) {
          await expectNoViolations(page, path);
        }
      });
    });

    test('accesso e registrazione', async ({ page }) => {
      await expectNoViolations(page, '/accedi');
      await expectNoViolations(page, '/registrati');
    });
  });
}
