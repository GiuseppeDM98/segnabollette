/**
 * The shape of the house and supply actions' arguments. The services check the content (name
 * lengths, photovoltaic only on electricity, a free identifier); these only check the types.
 */
import { z } from 'zod';
import { SUPPLY_KINDS } from '@/lib/domain/types';

export const IdSchema = z.string().min(1);

export const HouseNameSchema = z.object({ name: z.string() });

export const SupplyInputSchema = z.object({
  houseId: IdSchema,
  kind: z.enum(SUPPLY_KINDS),
  label: z.string(),
  supplierName: z.string().nullable(),
  identifier: z.string().nullable(),
  hasPhotovoltaic: z.boolean(),
});

export const SupplyPatchSchema = SupplyInputSchema.omit({ kind: true }).partial();

export const ArchivedSchema = z.boolean();

export const HouseholdSizeSchema = z.object({ validFrom: z.string(), people: z.number() });
