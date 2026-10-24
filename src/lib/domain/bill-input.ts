/**
 * The one shape a bill takes on its way into the database, whether typed by hand or extracted
 * by Claude and reviewed. Amounts are net of VAT except the 'vat' lines themselves and the
 * 'outside' lines (printed as they are).
 */
import { z } from 'zod';
import { isIsoDate } from './dates';
import {
  BANDS,
  LINE_CATEGORIES,
  LINE_COMPONENTS,
  QUANTITY_UNITS,
  READING_REGISTERS,
} from './types';

// Validation details reach the person as they are: zod's own default messages (a wrong enum, a
// missing number) must be Italian like the ones written below.
z.config(z.locales.it());

const isoDate = z.string().refine(isIsoDate, { message: 'Data non valida' });
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const BillLineInputSchema = z
  .object({
    description: z.string().trim().min(1, 'Descrizione obbligatoria').max(200),
    category: z.enum(LINE_CATEGORIES),
    component: z.enum(LINE_COMPONENTS),
    periodStart: isoDate,
    periodEnd: isoDate,
    quantity: z.number().finite().nullable(),
    quantityUnit: z.enum(QUANTITY_UNITS).nullable(),
    unitPriceMicros: z.number().int().nullable(),
    amountCents: z.number().int(),
    band: z.enum(BANDS).nullable(),
    isRecalculation: z.boolean(),
    isEstimated: z.boolean(),
    vatRateBp: z.number().int().min(0).max(10_000).nullable(),
  })
  .refine((line) => line.periodStart <= line.periodEnd, {
    message: 'Il periodo della voce finisce prima di cominciare',
    path: ['periodEnd'],
  })
  .refine((line) => (line.quantity === null) === (line.quantityUnit === null), {
    message: 'Quantità e unità vanno indicate insieme',
    path: ['quantityUnit'],
  });

export const BillReadingInputSchema = z.object({
  readOn: isoDate,
  register: z.enum(READING_REGISTERS),
  value: z.number().finite().min(0),
  source: z.enum(['bill_actual', 'bill_estimated']),
});

export const BillInputSchema = z
  .object({
    supplyId: z.string().min(1),
    periodStart: isoDate,
    periodEnd: isoDate,
    issueDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),
    supplierName: optionalText(120),
    offerName: optionalText(120),
    totalCents: z.number().int(),
    amountDueCents: z.number().int().nullable(),
    conversionFactor: z.number().positive().max(2).nullable(),
    calorificValueGj: z.number().positive().max(0.1).nullable(),
    isEstimated: z.boolean(),
    lines: z.array(BillLineInputSchema).min(1, 'Serve almeno una voce').max(300),
    readings: z.array(BillReadingInputSchema).max(60),
    overlapDecision: z.enum(['sum', 'replace']).nullable(),
  })
  .refine((bill) => bill.periodStart <= bill.periodEnd, {
    message: 'Il periodo finisce prima di cominciare',
    path: ['periodEnd'],
  });

export type BillInput = z.infer<typeof BillInputSchema>;
export type BillLineInput = z.infer<typeof BillLineInputSchema>;
export type BillReadingInput = z.infer<typeof BillReadingInputSchema>;

export const SelfReadingInputSchema = z
  .object({
    supplyId: z.string().min(1),
    readOn: isoDate,
    values: z
      .array(z.object({ register: z.enum(READING_REGISTERS), value: z.number().finite().min(0) }))
      .min(1)
      .max(6),
  })
  .refine((input) => new Set(input.values.map((v) => v.register)).size === input.values.length, {
    message: 'Un registro compare due volte',
    path: ['values'],
  });

export type SelfReadingInput = z.infer<typeof SelfReadingInputSchema>;
