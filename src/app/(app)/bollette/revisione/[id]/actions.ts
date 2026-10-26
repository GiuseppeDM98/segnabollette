'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getBlobStore, getDb } from '@/lib/container';
import { type ActionResult, toActionResult } from '@/lib/errors';
import { parseInput } from '@/lib/parse-input';
import { confirmExtraction, discardExtraction } from '@/lib/services/extractions';
import { ConfirmExtractionSchema, ExtractionIdSchema } from './schemas';

/** The badge in the shell, «Bollette», «Da rivedere», «Casa» and the supply pages all change. */
function revalidateEverything(): void {
  revalidatePath('/', 'layout');
}

export async function confirmExtractionAction(
  payload: unknown,
): Promise<ActionResult<{ billId: string }>> {
  const result = await toActionResult(async () => {
    const { extractionId, input, newSupply } = parseInput(ConfirmExtractionSchema, payload);
    const user = await requireUser();
    return confirmExtraction(getDb(), user.id, extractionId, { input, newSupply });
  });
  if (result.ok) revalidateEverything();
  return result;
}

/** «Scarta» everywhere: the upload, «Da rivedere» and the review. */
export async function discardExtractionAction(extractionId: unknown): Promise<ActionResult<null>> {
  const result = await toActionResult(async () => {
    const id = parseInput(ExtractionIdSchema, extractionId);
    const user = await requireUser();
    await discardExtraction(getDb(), user.id, id, { blob: getBlobStore(), now: Date.now() });
    return null;
  });
  if (result.ok) revalidateEverything();
  return result;
}
