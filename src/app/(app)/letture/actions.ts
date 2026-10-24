'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/container';
import { type SelfReadingInput, SelfReadingInputSchema } from '@/lib/domain/bill-input';
import { romeToday } from '@/lib/domain/dates';
import { type ActionResult, toActionResult } from '@/lib/errors';
import { parseInput } from '@/lib/parse-input';
import { createSelfReadings, deleteReading } from '@/lib/services/readings';
import { ReadingIdSchema } from './schemas';

/** The readings list, the home page and the supply's page (every supply page when unknown). */
function revalidateReadingPages(supplyId: string | null): void {
  revalidatePath('/letture');
  revalidatePath('/');
  if (supplyId === null) revalidatePath('/forniture/[id]', 'page');
  else revalidatePath(`/forniture/${supplyId}`);
}

/** The input goes to the service as it is; today is the Rome calendar day of the request. */
export async function createReadingsAction(
  input: SelfReadingInput,
): Promise<ActionResult<{ readingIds: string[] }>> {
  return toActionResult(async () => {
    const user = await requireUser();
    const saved = await createSelfReadings(getDb(), user.id, input, {
      today: romeToday(Date.now()),
    });
    // Read after the service accepted the input, so the parse cannot fail.
    revalidateReadingPages(SelfReadingInputSchema.parse(input).supplyId);
    return saved;
  });
}

export async function deleteReadingAction(readingId: unknown): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const id = parseInput(ReadingIdSchema, readingId);
    const user = await requireUser();
    await deleteReading(getDb(), user.id, id);
    revalidateReadingPages(null);
    return null;
  });
}
