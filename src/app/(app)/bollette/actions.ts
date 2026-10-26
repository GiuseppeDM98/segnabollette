'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getDb } from '@/lib/container';
import { type ActionResult, toActionResult } from '@/lib/errors';
import { parseInput } from '@/lib/parse-input';
import { confirmBill, deleteBill, getBillDetail } from '@/lib/services/bills';
import { deleteDocumentFiles } from '../document-files';
import { BillIdSchema, OptionalBillIdSchema, SavedSupplySchema } from './schemas';

function revalidateBillPages(supplyId: string): void {
  revalidatePath('/bollette');
  revalidatePath('/');
  revalidatePath('/letture');
  revalidatePath(`/forniture/${supplyId}`);
}

/** New bill (billId null) or edit of one; the input goes to confirmBill as it is. */
export async function saveBillAction(
  billId: string | null,
  input: unknown,
): Promise<ActionResult<{ billId: string }>> {
  return toActionResult(async () => {
    const editedId = parseInput(OptionalBillIdSchema, billId);
    const user = await requireUser();
    const saved = await confirmBill(getDb(), user.id, input, {
      source: 'manual',
      billId: editedId ?? undefined,
    });
    revalidateBillPages(SavedSupplySchema.parse(input).supplyId);
    return { billId: saved.billId };
  });
}

/** Returns the supply, where the page goes once the bill is gone. */
export async function deleteBillAction(
  billId: unknown,
): Promise<ActionResult<{ supplyId: string }>> {
  return toActionResult(async () => {
    const id = parseInput(BillIdSchema, billId);
    const user = await requireUser();
    const { bill } = await getBillDetail(getDb(), user.id, id);
    const { documentPathnames } = await deleteBill(getDb(), user.id, id);
    await deleteDocumentFiles(documentPathnames);
    revalidateBillPages(bill.supplyId);
    return { supplyId: bill.supplyId };
  });
}
