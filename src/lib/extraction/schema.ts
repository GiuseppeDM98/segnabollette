/**
 * The structured output asked of Claude. No field is nullable: structured outputs allow at most
 * 16 union-typed parameters across a schema, so absence is a sentinel ("", 0, "none", -1) that
 * toBillInput turns into null.
 */
import { z } from 'zod';
import {
  LINE_CATEGORIES,
  LINE_COMPONENTS,
  QUANTITY_UNITS,
  READING_REGISTERS,
  SUPPLY_KINDS,
} from '@/lib/domain/types';

export const ExtractionLineSchema = z.object({
  description: z.string(),
  category: z.enum(LINE_CATEGORIES),
  component: z.enum(LINE_COMPONENTS),
  periodStart: z.string(),
  periodEnd: z.string(),
  quantity: z.number(),
  quantityUnit: z.enum([...QUANTITY_UNITS, 'none'] as const),
  unitPriceMicros: z.number().int(),
  amountCents: z.number().int(),
  band: z.enum(['F1', 'F2', 'F3', 'F23', 'single', 'none']),
  isRecalculation: z.boolean(),
  isEstimated: z.boolean(),
  vatRatePercent: z.number(),
});

export const ExtractionReadingSchema = z.object({
  date: z.string(),
  register: z.enum(READING_REGISTERS),
  value: z.number(),
  kind: z.enum(['actual', 'estimated']),
});

export const ExtractionSchema = z.object({
  isBill: z.boolean(),
  supplyKind: z.enum([...SUPPLY_KINDS, 'other'] as const),
  supplierName: z.string(),
  offerName: z.string(),
  supplyIdentifier: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  totalCents: z.number().int(),
  amountDueCents: z.number().int(),
  conversionFactor: z.number(),
  calorificValueGj: z.number(),
  consumptionEstimated: z.boolean(),
  lines: z.array(ExtractionLineSchema),
  readings: z.array(ExtractionReadingSchema),
  warnings: z.array(z.string()),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type ExtractionLine = z.infer<typeof ExtractionLineSchema>;
export type ExtractionReading = z.infer<typeof ExtractionReadingSchema>;
