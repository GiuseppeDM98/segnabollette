'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getBlobStore, getDb } from '@/lib/container';
import { type ActionResult, toActionResult } from '@/lib/errors';
import { parseInput } from '@/lib/parse-input';
import {
  confirmExtraction,
  discardExtraction,
  nextExtractionToReview,
} from '@/lib/services/extractions';
import { ConfirmExtractionSchema, ExtractionIdSchema } from './schemas';

/** The badge in the shell, «Bollette», «Da rivedere», «Casa» and the supply pages all change. */
function revalidateEverything(): void {
  revalidatePath('/', 'layout');
}

/**
 * A bill of a bulk import goes on to the next bill of its batch still to review, and after the
 * last one to the batch's list; a bill uploaded alone goes to its own page (no nextPath).
 */
export async function confirmExtractionAction(
  payload: unknown,
): Promise<ActionResult<{ billId: string; nextPath?: string }>> {
  const result = await toActionResult(async () => {
    const { extractionId, input, newSupply } = parseInput(ConfirmExtractionSchema, payload);
    const user = await requireUser();
    const { billId, batchId } = await confirmExtraction(getDb(), user.id, extractionId, {
      input,
      newSupply,
    });
    if (batchId === null) return { billId };
    const next = await nextExtractionToReview(getDb(), user.id, {
      batchId,
      afterExtractionId: extractionId,
    });
    const nextPath =
      next === null ? `/bollette/da-rivedere?lotto=${batchId}` : `/bollette/revisione/${next}`;
    return { billId, nextPath };
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
