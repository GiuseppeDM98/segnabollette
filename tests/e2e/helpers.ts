/**
 * Shared steps of the E2E tests. Tests that write register their own user (the seed users are
 * read-only) and build their houses, supplies and bills through the UI, as a person would.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { and, asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { createDb } from '../../src/lib/db/create-db';
import { bills, houses, supplies } from '../../src/lib/db/schema/app';
import { users } from '../../src/lib/db/schema/auth';

export const SEED_A_STATE = 'playwright/.auth/seed-a.json';
export const SEED_B_STATE = 'playwright/.auth/seed-b.json';
export const E2E_DB_URL = 'file:e2e.db';
/** A saved bill's page: /bollette/<id>, not /bollette/nuova?… nor …/modifica. */
export const SAVED_BILL_URL = /\/bollette\/(?!nuova)[^/?]+$/;

/** Wait until React has hydrated the page: a form typed into earlier would submit natively. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.locator('body[data-hydrated]').waitFor({ state: 'attached' });
}

export async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydration(page);
}

export async function signUpTestUser(
  page: Page,
  prefix: string,
): Promise<{ email: string; password: string }> {
  const email = `${prefix}-${nanoid()}@example.test`;
  const password = `password-${prefix}-1`;
  await gotoReady(page, '/registrati');
  await page.getByLabel('Nome').fill(prefix);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Crea account' }).click();
  await expect(page).toHaveURL('/');
  return { email, password };
}

export async function createHouse(page: Page, name: string): Promise<void> {
  await gotoReady(page, '/forniture');
  await page.getByLabel('Nome della nuova casa').fill(name);
  await page.getByRole('button', { name: 'Nuova casa' }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

export function housePanel(page: Page, name: string): Locator {
  return page.getByTestId('house-panel').filter({ has: page.getByRole('heading', { name }) });
}

/** Creates a supply from «Forniture» and returns its id, read from its page. */
export async function createSupply(
  page: Page,
  house: string,
  supply: {
    kind: 'Luce' | 'Gas' | 'Acqua' | 'Internet e telefono' | 'TARI';
    label: string;
    supplier?: string;
    identifier?: string;
    photovoltaic?: boolean;
  },
): Promise<string> {
  await gotoReady(page, '/forniture');
  const panel = housePanel(page, house);
  await panel.getByRole('button', { name: 'Nuova fornitura' }).click();
  const form = panel.getByTestId('supply-form');
  await form.getByLabel('Tipo').selectOption({ label: supply.kind });
  await form.getByLabel('Nome').fill(supply.label);
  if (supply.supplier) await form.getByLabel('Fornitore').fill(supply.supplier);
  if (supply.identifier) await form.getByLabel('Identificativo').fill(supply.identifier);
  if (supply.photovoltaic) await form.getByLabel('Impianto fotovoltaico').check();
  await form.getByRole('button', { name: 'Crea fornitura' }).click();
  const link = panel.getByRole('link', { name: supply.label, exact: true });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  const id = href?.split('/').pop();
  if (!id) throw new Error(`createSupply: no link for ${supply.label}`);
  return id;
}

/** The amount fields of the bill form, in line order. */
export function lineAmounts(page: Page): Locator {
  return page.getByTestId('line-amount');
}

/** Opens a new bill of the supply, fills the period, the amounts and the total, and saves it. */
export async function enterBill(
  page: Page,
  supplyId: string,
  bill: { periodStart: string; periodEnd: string; amounts: string[]; total: string },
): Promise<string> {
  await gotoReady(page, `/bollette/nuova?fornitura=${supplyId}`);
  await page.getByLabel('Dal', { exact: true }).fill(bill.periodStart);
  await page.getByLabel('Al', { exact: true }).fill(bill.periodEnd);
  for (const [index, amount] of bill.amounts.entries()) {
    await lineAmounts(page).nth(index).fill(amount);
  }
  await page.getByTestId('bill-total').fill(bill.total);
  await page.getByRole('button', { name: 'Salva bolletta' }).click();
  await expect(page).toHaveURL(SAVED_BILL_URL);
  const id = page.url().split('/').pop();
  if (!id) throw new Error('enterBill: the bill was not saved');
  return id;
}

/** Ids of a seed user's first house, supply and confirmed bill, read from e2e.db. */
export async function seedIds(email: string): Promise<{
  houseId: string;
  supplyId: string;
  billId: string;
}> {
  const { db, client } = createDb({ url: E2E_DB_URL });
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error(`seedIds: no user ${email}`);
    const [house] = await db
      .select()
      .from(houses)
      .where(eq(houses.userId, user.id))
      .orderBy(asc(houses.name));
    const [supply] = await db
      .select()
      .from(supplies)
      .where(eq(supplies.userId, user.id))
      .orderBy(asc(supplies.createdAt));
    const [bill] = await db
      .select()
      .from(bills)
      .where(and(eq(bills.userId, user.id), eq(bills.status, 'confirmed')))
      .orderBy(asc(bills.periodEnd));
    if (!house || !supply || !bill) throw new Error(`seedIds: ${email} has no seed data`);
    return { houseId: house.id, supplyId: supply.id, billId: bill.id };
  } finally {
    client.close();
  }
}

/** The ids of a seed user's supplies by name («Luce», «Gas», «Acqua», «Internet»), from e2e.db. */
export async function seedSupplyIds(email: string): Promise<Record<string, string>> {
  const { db, client } = createDb({ url: E2E_DB_URL });
  try {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) throw new Error(`seedSupplyIds: no user ${email}`);
    const rows = await db.select().from(supplies).where(eq(supplies.userId, user.id));
    return Object.fromEntries(rows.map((row) => [row.label, row.id]));
  } finally {
    client.close();
  }
}
