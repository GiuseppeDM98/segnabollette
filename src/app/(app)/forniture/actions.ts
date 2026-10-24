'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/container';
import { type ActionResult, toActionResult } from '@/lib/errors';
import { parseInput } from '@/lib/parse-input';
import {
  archiveSupply,
  createHouse,
  createSupply,
  deleteHouse,
  deleteSupply,
  renameHouse,
  updateSupply,
} from '@/lib/services/houses-supplies';
import {
  ArchivedSchema,
  HouseNameSchema,
  IdSchema,
  SupplyInputSchema,
  SupplyPatchSchema,
} from './schemas';

/** Houses and supplies appear on every page of the app: home, lists, the supply pages. */
function revalidateSupplyPages(): void {
  revalidatePath('/');
  revalidatePath('/forniture');
  revalidatePath('/forniture/[id]', 'page');
  revalidatePath('/bollette');
  revalidatePath('/letture');
}

async function withRevalidation<T>(result: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const settled = await result;
  if (settled.ok) revalidateSupplyPages();
  return settled;
}

export async function createHouseAction(
  input: unknown,
): Promise<ActionResult<{ houseId: string }>> {
  return withRevalidation(
    toActionResult(async () => {
      const { name } = parseInput(HouseNameSchema, input);
      const user = await requireUser();
      return createHouse(getDb(), user.id, { name });
    }),
  );
}

export async function renameHouseAction(
  houseId: unknown,
  input: unknown,
): Promise<ActionResult<null>> {
  return withRevalidation(
    toActionResult(async () => {
      const id = parseInput(IdSchema, houseId);
      const { name } = parseInput(HouseNameSchema, input);
      const user = await requireUser();
      await renameHouse(getDb(), user.id, id, name);
      return null;
    }),
  );
}

export async function deleteHouseAction(houseId: unknown): Promise<ActionResult<null>> {
  return withRevalidation(
    toActionResult(async () => {
      const id = parseInput(IdSchema, houseId);
      const user = await requireUser();
      await deleteHouse(getDb(), user.id, id);
      return null;
    }),
  );
}

export async function createSupplyAction(
  input: unknown,
): Promise<ActionResult<{ supplyId: string }>> {
  return withRevalidation(
    toActionResult(async () => {
      const supply = parseInput(SupplyInputSchema, input);
      const user = await requireUser();
      return createSupply(getDb(), user.id, supply);
    }),
  );
}

export async function updateSupplyAction(
  supplyId: unknown,
  patch: unknown,
): Promise<ActionResult<null>> {
  return withRevalidation(
    toActionResult(async () => {
      const id = parseInput(IdSchema, supplyId);
      const changes = parseInput(SupplyPatchSchema, patch);
      const user = await requireUser();
      await updateSupply(getDb(), user.id, id, changes);
      return null;
    }),
  );
}

/** `archived: false` brings an archived supply back («Riattiva»). */
export async function archiveSupplyAction(
  supplyId: unknown,
  archived: unknown,
): Promise<ActionResult<null>> {
  return withRevalidation(
    toActionResult(async () => {
      const id = parseInput(IdSchema, supplyId);
      const isArchived = parseInput(ArchivedSchema, archived);
      const user = await requireUser();
      await archiveSupply(getDb(), user.id, id, { archived: isArchived, now: Date.now() });
      return null;
    }),
  );
}

export async function deleteSupplyAction(supplyId: unknown): Promise<ActionResult<null>> {
  return withRevalidation(
    toActionResult(async () => {
      const id = parseInput(IdSchema, supplyId);
      const user = await requireUser();
      await deleteSupply(getDb(), user.id, id);
      return null;
    }),
  );
}
