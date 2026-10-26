/**
 * The shape of the review actions' arguments. The bill input stays unknown here: confirmBill
 * validates it; the new supply's content is checked by createSupply.
 */
import { z } from 'zod';
import { SUPPLY_KINDS } from '@/lib/domain/types';

export const ExtractionIdSchema = z.string().min(1);

export const ConfirmExtractionSchema = z.object({
  extractionId: ExtractionIdSchema,
  input: z.unknown(),
  newSupply: z
    .object({
      houseId: z.string().min(1),
      kind: z.enum(SUPPLY_KINDS),
      label: z.string(),
      supplierName: z.string().nullable(),
      identifier: z.string().nullable(),
      hasPhotovoltaic: z.boolean(),
    })
    .nullable(),
});
