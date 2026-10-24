/**
 * Arithmetic and overlap checks shown in the review. They warn and never block: every printed
 * line is rounded to the cent, and printed unit prices are not always reliable.
 */
import type { BillInput } from './bill-input';
import type { IsoDate } from './types';

export interface LineMismatch {
  index: number;
  expectedCents: number;
  amountCents: number;
}

export interface ArithmeticReport {
  /** Σ lines except 'outside' (VAT included): must match the bill total. */
  linesTotalCents: number;
  totalDifferenceCents: number;
  isTotalConsistent: boolean;
  /** Σ of every line: must match the amount due, when the bill prints one. */
  amountDueDifferenceCents: number | null;
  isAmountDueConsistent: boolean | null;
  lineMismatches: LineMismatch[];
}

/** Each of n lines can be off by half a cent: the tolerance grows with the line count. */
export function arithmeticTolerance(lineCount: number): number {
  return Math.max(2, Math.ceil(lineCount / 4));
}

export function checkBillArithmetic(
  input: Pick<BillInput, 'totalCents' | 'amountDueCents' | 'lines'>,
): ArithmeticReport {
  const counted = input.lines.filter((line) => line.category !== 'outside');
  const linesTotalCents = counted.reduce((sum, line) => sum + line.amountCents, 0);
  const totalDifferenceCents = linesTotalCents - input.totalCents;
  const allLinesCents = input.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const amountDueDifferenceCents =
    input.amountDueCents === null ? null : allLinesCents - input.amountDueCents;

  const lineMismatches: LineMismatch[] = [];
  input.lines.forEach((line, index) => {
    if (line.quantity === null || line.unitPriceMicros === null) return;
    const expectedCents = Math.round((line.quantity * line.unitPriceMicros) / 10_000);
    const tolerance = Math.max(1, Math.round(Math.abs(line.amountCents) * 0.01));
    if (Math.abs(expectedCents - line.amountCents) > tolerance) {
      lineMismatches.push({ index, expectedCents, amountCents: line.amountCents });
    }
  });

  return {
    linesTotalCents,
    totalDifferenceCents,
    isTotalConsistent: Math.abs(totalDifferenceCents) <= arithmeticTolerance(counted.length),
    amountDueDifferenceCents,
    isAmountDueConsistent:
      amountDueDifferenceCents === null
        ? null
        : Math.abs(amountDueDifferenceCents) <= arithmeticTolerance(input.lines.length),
    lineMismatches,
  };
}

export interface ExistingBillPeriod {
  id: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
}

/** The bills in `existing` (chosen by the caller) whose billing period shares at least one day with this one. */
export function findOverlappingBills(
  bill: { periodStart: IsoDate; periodEnd: IsoDate; id?: string },
  existing: readonly ExistingBillPeriod[],
): ExistingBillPeriod[] {
  return existing.filter(
    (other) =>
      other.id !== bill.id &&
      other.periodStart <= bill.periodEnd &&
      bill.periodStart <= other.periodEnd,
  );
}
