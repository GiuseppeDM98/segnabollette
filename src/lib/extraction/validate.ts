/**
 * The checks an extraction must pass before it reaches the review: what the JSON schema cannot
 * express (valid calendar days, a period in order, a quantity only with its unit). Each violation
 * is an Italian sentence shown on the failed extraction.
 */
import { isIsoDate } from '@/lib/domain/dates';
import type { Extraction } from './schema';

/** `['not_a_bill']` for a document that is not a bill, which the service handles on its own. */
export function validateExtraction(extraction: Extraction): string[] {
  if (!extraction.isBill) return ['not_a_bill'];
  const errors: string[] = [];
  const { periodStart, periodEnd } = extraction;
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd)) {
    errors.push('Il periodo della bolletta non ha date valide.');
  } else if (periodStart > periodEnd) {
    errors.push('Il periodo della bolletta finisce prima di cominciare.');
  }
  if (extraction.lines.length === 0) errors.push('La bolletta non ha voci.');
  for (const line of extraction.lines) {
    for (const date of [line.periodStart, line.periodEnd]) {
      if (date !== '' && !isIsoDate(date)) {
        errors.push(`La voce «${line.description}» ha una data non valida: ${date}.`);
      }
    }
    if (line.quantityUnit === 'none' && line.quantity !== 0) {
      errors.push(`La voce «${line.description}» ha una quantità senza unità.`);
    }
  }
  for (const reading of extraction.readings) {
    if (reading.date !== '' && !isIsoDate(reading.date)) {
      errors.push(`Una lettura ha una data non valida: ${reading.date}.`);
    }
  }
  return errors;
}
