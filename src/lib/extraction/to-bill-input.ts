/**
 * From what Claude read to what the review form edits: sentinels back to null, each line with its
 * own period, and the supply recognised only by its normalized identifier (or the choice made
 * before the upload) — never by guessing "the only electricity supply there is".
 */
import type { BillInput, BillLineInput, BillReadingInput } from '@/lib/domain/bill-input';
import { normalizeSupplyIdentifier, type SupplyKind } from '@/lib/domain/types';
import { KIND_LABELS, REGISTER_LABELS } from '@/lib/format';
import type { Extraction, ExtractionLine } from './schema';

export interface ToBillInputContext {
  supplies: Array<{
    id: string;
    kind: SupplyKind;
    identifier: string | null;
    archivedAt: number | null;
  }>;
  preselectedSupplyId: string | null;
}

export interface ReviewDraft {
  /** supplyId is '' when no supply matched. */
  input: BillInput;
  matchedSupplyId: string | null;
  /** Prefills «Crea una nuova fornitura» when nothing matched; kind is null for an unrecognised utility. */
  suggestedSupply: {
    kind: SupplyKind | null;
    supplierName: string | null;
    identifier: string | null;
  } | null;
  warnings: string[];
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toLine(line: ExtractionLine, bill: Extraction): BillLineInput {
  // A line with half a period cannot be trusted: it takes the bill's whole period.
  const ownPeriod = line.periodStart !== '' && line.periodEnd !== '';
  return {
    description: line.description,
    category: line.category,
    component: line.component,
    periodStart: ownPeriod ? line.periodStart : bill.periodStart,
    periodEnd: ownPeriod ? line.periodEnd : bill.periodEnd,
    quantity: line.quantityUnit === 'none' ? null : line.quantity,
    quantityUnit: line.quantityUnit === 'none' ? null : line.quantityUnit,
    unitPriceMicros: line.unitPriceMicros === 0 ? null : line.unitPriceMicros,
    amountCents: line.amountCents,
    band: line.band === 'none' ? null : line.band,
    isRecalculation: line.isRecalculation,
    isEstimated: line.isEstimated,
    vatRateBp: line.vatRatePercent < 0 ? null : Math.round(line.vatRatePercent * 100),
  };
}

function matchSupply(
  extraction: Extraction,
  context: ToBillInputContext,
): ToBillInputContext['supplies'][number] | null {
  if (context.preselectedSupplyId !== null) {
    const preselected = context.supplies.find((s) => s.id === context.preselectedSupplyId);
    if (preselected) return preselected;
  }
  const identifier = normalizeSupplyIdentifier(extraction.supplyIdentifier);
  if (identifier === '') return null;
  return (
    context.supplies.find(
      (supply) => supply.identifier === identifier && supply.kind === extraction.supplyKind,
    ) ?? null
  );
}

export function toBillInput(extraction: Extraction, context: ToBillInputContext): ReviewDraft {
  const warnings: string[] = [];
  const matched = matchSupply(extraction, context);
  const extractedKind = extraction.supplyKind === 'other' ? null : extraction.supplyKind;
  const kind = matched?.kind ?? extractedKind;

  if (matched && extractedKind && matched.kind !== extractedKind) {
    warnings.push(`Il documento sembra una bolletta di ${KIND_LABELS[extractedKind]}`);
  }
  if (!matched && extractedKind === null) warnings.push('Tipo di utenza non riconosciuto');

  const readings: BillReadingInput[] = [];
  for (const reading of extraction.readings) {
    if (reading.date === '') {
      warnings.push(
        `Lettura senza data scartata: ${REGISTER_LABELS[reading.register]} ${reading.value}`,
      );
      continue;
    }
    readings.push({
      readOn: reading.date,
      register: reading.register,
      value: reading.value,
      source: reading.kind === 'actual' ? 'bill_actual' : 'bill_estimated',
    });
  }

  const isGas = kind === 'gas';
  const input: BillInput = {
    supplyId: matched?.id ?? '',
    periodStart: extraction.periodStart,
    periodEnd: extraction.periodEnd,
    issueDate: textOrNull(extraction.issueDate),
    dueDate: textOrNull(extraction.dueDate),
    supplierName: textOrNull(extraction.supplierName),
    offerName: textOrNull(extraction.offerName),
    totalCents: extraction.totalCents,
    amountDueCents: extraction.amountDueCents,
    conversionFactor:
      isGas && extraction.conversionFactor !== 0 ? extraction.conversionFactor : null,
    calorificValueGj:
      isGas && extraction.calorificValueGj !== 0 ? extraction.calorificValueGj : null,
    isEstimated: extraction.consumptionEstimated,
    lines: extraction.lines.map((line) => toLine(line, extraction)),
    readings,
    overlapDecision: null,
  };

  return {
    input,
    matchedSupplyId: matched?.id ?? null,
    suggestedSupply: matched
      ? null
      : {
          kind: extractedKind,
          supplierName: textOrNull(extraction.supplierName),
          identifier: textOrNull(extraction.supplyIdentifier),
        },
    warnings: [...warnings, ...extraction.warnings],
  };
}
