/**
 * The shell with seed user A (read-only): five items, the active one marked, at the bottom on a
 * phone and at the side on a desktop.
 */
import { expect, test } from '@playwright/test';
import { SEED_A_STATE, seedIds } from './helpers';

const ITEMS = ['Casa', 'Bollette', 'Letture', 'Forniture', 'Impostazioni'];

test.use({ storageState: SEED_A_STATE });

test('mostra le cinque voci e segna quella della pagina aperta', async ({ page }) => {
  await page.goto('/bollette');
  const nav = page.getByRole('navigation', { name: 'Principale' });

  for (const item of ITEMS)
    await expect(nav.getByRole('link', { name: item, exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Bollette', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Casa', exact: true })).not.toHaveAttribute(
    'aria-current',
  );
});

test('su una pagina annidata è attiva la sua voce e non «Casa»', async ({ page }) => {
  const { billId } = await seedIds('seed-a@example.test');

  await page.goto(`/bollette/${billId}/modifica`);
  const nav = page.getByRole('navigation', { name: 'Principale' });

  await expect(nav.getByRole('link', { name: 'Bollette', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav.getByRole('link', { name: 'Casa', exact: true })).not.toHaveAttribute(
    'aria-current',
  );
});

test('«Casa» è attiva solo su /', async ({ page }) => {
  await page.goto('/');

  await expect(
    page
      .getByRole('navigation', { name: 'Principale' })
      .getByRole('link', { name: 'Casa', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});

test('sul telefono la tacca della voce attiva sta dentro la barra, staccata dal bordo', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the bottom bar exists only below 1024 px');
  await page.goto('/');
  const bar = await page.getByTestId('nav-bar').boundingBox();
  const tick = await page.getByTestId('nav-bar').getByTestId('nav-active-tick').boundingBox();
  if (!bar || !tick) throw new Error('no bar or tick box');

  // Flush with the edge, the paper-coloured tick reads as the page cutting into the cloth.
  expect(tick.y - bar.y).toBeGreaterThanOrEqual(4);
});

test('la barra sta in basso sul telefono e a lato sul computer', async ({ page }, testInfo) => {
  await page.goto('/');
  const box = await page.getByRole('navigation', { name: 'Principale' }).boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('no navigation box');

  if (testInfo.project.name === 'mobile') {
    expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
    expect(box.width).toBeCloseTo(viewport.width, 0);
  } else {
    expect(box.x).toBe(0);
    expect(box.width).toBeLessThan(300);
    expect(box.height).toBeCloseTo(viewport.height, 0);
  }
});
