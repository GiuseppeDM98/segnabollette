import type { ArithmeticReport } from '@/lib/domain/bill-checks';
import { formatEuro } from '@/lib/format';

/**
 * The arithmetic checks of a bill as messages: in stamp ink, never a block. The form shows them
 * live while typing, the bill page shows them for the stored figures.
 */
export function ArithmeticWarnings({
  report,
  figures,
}: {
  report: ArithmeticReport;
  figures: { totalCents: number; amountDueCents: number | null };
}) {
  const warnings: string[] = [];
  if (!report.isTotalConsistent) {
    warnings.push(
      `Le voci sommano ${formatEuro(report.linesTotalCents)}, il totale stampato è ${formatEuro(
        figures.totalCents,
      )} (differenza ${formatEuro(report.totalDifferenceCents)})`,
    );
  }
  if (
    report.isAmountDueConsistent === false &&
    report.amountDueDifferenceCents !== null &&
    figures.amountDueCents !== null
  ) {
    const allLines = figures.amountDueCents + report.amountDueDifferenceCents;
    warnings.push(
      `Tutte le voci (canone TV compreso) sommano ${formatEuro(allLines)}, il totale da pagare è ${formatEuro(
        figures.amountDueCents,
      )} (differenza ${formatEuro(report.amountDueDifferenceCents)})`,
    );
  }
  for (const mismatch of report.lineMismatches) {
    warnings.push(
      `Voce ${mismatch.index + 1}: quantità × prezzo fa ${formatEuro(
        mismatch.expectedCents,
      )}, l'importo è ${formatEuro(mismatch.amountCents)}`,
    );
  }
  if (warnings.length === 0) return null;
  return (
    <ul
      data-testid="arithmetic-warnings"
      className="flex flex-col gap-1 rounded-sm border border-stamp bg-stamp-wash px-3 py-2 text-stamp"
    >
      {warnings.map((warning) => (
        <li key={warning} className="font-semibold">
          {warning}
        </li>
      ))}
    </ul>
  );
}
