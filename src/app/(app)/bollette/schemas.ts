/** The shape of the bill actions' ids; the bill itself is validated by confirmBill. */
import { z } from 'zod';

export const BillIdSchema = z.string().min(1);

export const OptionalBillIdSchema = BillIdSchema.nullable();

/** Read after a successful save, when the input has already passed BillInputSchema. */
export const SavedSupplySchema = z.object({ supplyId: z.string().min(1) });
