import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArithmeticWarnings } from '@/components/bills/arithmetic-warnings';
import { BillActions } from '@/components/bills/bill-actions';
import { SupplyKindIcon } from '@/components/supplies/supply-kind-icon';
import { Page, Section } from '@/components/ui/page';
import { Stamp } from '@/components/ui/stamp';
import { columnHeaderClass, panelClass } from '@/components/ui/styles';
import { BillUploader } from '@/components/upload/bill-uploader';
import { getDb, isBlobConfigured } from '@/lib/container';
import { checkBillArithmetic } from '@/lib/domain/bill-checks';
import { isMetered, LINE_CATEGORIES, readingUnitOf } from '@/lib/domain/types';
import {
  CATEGORY_LABELS,
  formatDate,
  formatDecimalInput,
  formatEuro,
  formatLinePrice,
  formatQuantity,
  KIND_LABELS,
  REGISTER_LABELS,
} from '@/lib/format';
import { getBillDetail } from '@/lib/services/bills';
import { listBillDocuments } from '@/lib/services/extractions';
import { orNotFound, pageUser } from '../../page-helpers';
import { deleteBillAction } from '../actions';

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const { bill, supply, lines, readings } = await orNotFound(getBillDetail(getDb(), user.id, id));
  const report = checkBillArithmetic({
    totalCents: bill.totalCents,
    amountDueCents: bill.amountDueCents,
    lines,
  });
  const groups = LINE_CATEGORIES.map((category) => ({
    category,
    lines: lines.filter((line) => line.category === category),
  })).filter((group) => group.lines.length > 0);
  const replaced = bill.status === 'replaced';
  const readingUnit = isMetered(supply.kind) ? readingUnitOf(supply.kind) : null;
  // The files need only the Blob store, not the Anthropic key.
  const documents = isBlobConfigured() ? await listBillDocuments(getDb(), user.id, bill.id) : null;
  const period = `dal ${formatDate(bill.periodStart)} al ${formatDate(bill.periodEnd)}`;

  const facts: Array<[string, ReactNode]> = [
    [
      'Fornitura',
      <Link key="supply" href={`/forniture/${supply.id}`} className="font-semibold text-link">
        {supply.label}
      </Link>,
    ],
    [
      'Periodo',
      <span
        key="period"
        className="figures font-bold"
      >{`${formatDate(bill.periodStart)} – ${formatDate(bill.periodEnd)}`}</span>,
    ],
    [
      'Emessa il',
      bill.issueDate ? (
        <span key="issue" className="figures font-bold">
          {formatDate(bill.issueDate)}
        </span>
      ) : (
        '—'
      ),
    ],
    [
      'Scadenza',
      bill.dueDate ? (
        <span key="due" className="figures font-bold">
          {formatDate(bill.dueDate)}
        </span>
      ) : (
        '—'
      ),
    ],
    ['Fornitore', bill.supplierName ?? '—'],
    ['Offerta', bill.offerName ?? '—'],
  ];
  if (supply.kind === 'gas') {
    facts.push(
      [
        'Coefficiente C',
        bill.conversionFactor === null ? (
          '—'
        ) : (
          <span key="c" className="figures font-bold">
            {formatDecimalInput(bill.conversionFactor, 20)}
          </span>
        ),
      ],
      [
        'PCS (GJ/Smc)',
        bill.calorificValueGj === null ? (
          '—'
        ) : (
          <span key="pcs" className="figures font-bold">
            {formatDecimalInput(bill.calorificValueGj, 20)}
          </span>
        ),
      ],
    );
  }

  return (
    <Page
      title={
        <span className="flex items-start gap-2">
          <SupplyKindIcon kind={supply.kind} className="mt-1 size-5 shrink-0 text-ink-soft" />
          <span>
            {KIND_LABELS[supply.kind]} {period}
          </span>
        </span>
      }
    >
      {(bill.isEstimated || replaced) && (
        <div className="flex flex-wrap items-center gap-3">
          {bill.isEstimated && <Stamp>stimata</Stamp>}
          {replaced && (
            <>
              <Stamp>sostituita</Stamp>
              {bill.replacedByBillId && (
                <Link
                  href={`/bollette/${bill.replacedByBillId}`}
                  className="font-semibold text-link"
                >
                  sostituita da un&apos;altra bolletta
                </Link>
              )}
            </>
          )}
        </div>
      )}

      <dl className={`${panelClass} grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 p-4`}>
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-soft">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <dt className="border-t border-rule pt-2 font-semibold">Totale bolletta</dt>
        <dd className="figures border-t border-rule pt-2 font-bold" data-testid="bill-total">
          {formatEuro(bill.totalCents)}
        </dd>
        <dt className="font-semibold">Totale da pagare</dt>
        <dd className="figures font-bold">
          {bill.amountDueCents === null ? '—' : formatEuro(bill.amountDueCents)}
        </dd>
      </dl>

      <BillActions
        billId={bill.id}
        canEdit={!replaced}
        summary={`${supply.label}, ${period}, ${formatEuro(bill.totalCents)}.`}
        deleteAction={deleteBillAction.bind(null, bill.id)}
      />

      <Section title="Voci">
        <ArithmeticWarnings report={report} figures={bill} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-surface text-left">
            <thead>
              <tr className={columnHeaderClass}>
                <th scope="col" className="px-3 pb-1.5 font-bold">
                  Voce
                </th>
                <th scope="col" className="px-3 pb-1.5 text-right font-bold">
                  Euro
                </th>
              </tr>
            </thead>
            {groups.map((group) => {
              const subtotal = group.lines.reduce((sum, line) => sum + line.amountCents, 0);
              return (
                <tbody key={group.category} data-testid="line-group">
                  <tr className="border-b border-rule bg-surface-sunk">
                    <th scope="rowgroup" colSpan={2} className="px-3 py-1.5 text-sm font-bold">
                      {CATEGORY_LABELS[group.category]}
                    </th>
                  </tr>
                  {group.lines.map((line) => (
                    <tr key={line.id} className="border-b border-rule align-top">
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span>{line.description}</span>
                          {line.band && line.band !== 'single' && (
                            <span className="text-xs font-bold text-ink-soft">{line.band}</span>
                          )}
                          {line.isEstimated && <Stamp>stimata</Stamp>}
                        </span>
                        {(line.quantity !== null || line.isRecalculation) && (
                          <span className="block text-xs text-ink-soft">
                            {line.quantity !== null && line.quantityUnit !== null && (
                              <span className="figures">
                                {formatQuantity(line.quantity, line.quantityUnit)}
                                {line.unitPriceMicros !== null &&
                                  ` × ${formatLinePrice(line.unitPriceMicros, line.quantityUnit)}`}
                              </span>
                            )}
                            {line.isRecalculation && (
                              <>
                                {line.quantity !== null && ' · '}
                                ricalcolo dal{' '}
                                <span className="figures">{formatDate(line.periodStart)}</span> al{' '}
                                <span className="figures">{formatDate(line.periodEnd)}</span>
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="figures px-3 py-2 text-right font-bold whitespace-nowrap">
                        {formatEuro(line.amountCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-b border-rule-strong">
                    <td className="px-3 py-1.5 text-right text-sm text-ink-soft">Subtotale</td>
                    <td
                      className="figures px-3 py-1.5 text-right font-bold whitespace-nowrap"
                      data-testid="group-subtotal"
                    >
                      {formatEuro(subtotal)}
                    </td>
                  </tr>
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <th scope="row" className="px-3 py-2 text-right font-bold">
                  Totale voci
                </th>
                <td className="figures px-3 py-2 text-right font-bold whitespace-nowrap">
                  {formatEuro(report.linesTotalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {readingUnit && (
        <Section title="Letture">
          {readings.length === 0 ? (
            <p className="text-ink-soft">Nessuna lettura su questa bolletta.</p>
          ) : (
            <ul className={panelClass}>
              {readings.map((reading) => (
                <li
                  key={reading.id}
                  data-testid="bill-reading-row"
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule px-3 py-2 last:border-b-0"
                >
                  <span className="figures text-sm font-bold">{formatDate(reading.readOn)}</span>
                  <span>{REGISTER_LABELS[reading.register]}</span>
                  <span className="figures font-bold">
                    {formatQuantity(reading.value, readingUnit)}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {reading.source === 'bill_estimated' ? 'Stimata' : 'Rilevata'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {documents && (
        <Section title="Documenti">
          {documents.length === 0 ? (
            <p className="text-ink-soft">Nessun file allegato.</p>
          ) : (
            <ul className={panelClass}>
              {documents.map((document, index) => {
                const name =
                  document.contentType === 'application/pdf'
                    ? `PDF, ${document.pageCount ?? 0} ${document.pageCount === 1 ? 'pagina' : 'pagine'}`
                    : `Pagina ${index + 1}`;
                return (
                  <li
                    key={document.id}
                    data-testid="bill-document"
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-1.5 last:border-b-0"
                  >
                    <span>{name}</span>
                    <a
                      href={`/api/documents/${document.id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex min-h-11 items-center font-semibold"
                    >
                      Apri<span className="sr-only"> {name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <BillUploader mode="attach" billId={bill.id} />
        </Section>
      )}
    </Page>
  );
}
