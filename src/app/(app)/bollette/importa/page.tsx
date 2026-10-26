import Link from 'next/link';
import { BulkImporter } from '@/components/import/bulk-importer';
import { Page, Section } from '@/components/ui/page';
import { buttonClass, panelClass } from '@/components/ui/styles';
import { getDb, isExtractionConfigured } from '@/lib/container';
import { romeToday } from '@/lib/domain/dates';
import { formatDate, formatSupplyLabel, formatUsd } from '@/lib/format';
import {
  type BatchSummary,
  listBatchExtractions,
  listBatches,
  listImportSupplies,
} from '@/lib/services/extractions';
import { pageUser, queryValue } from '../../page-helpers';

const TITLE = 'Importa più bollette';

/** «2 in coda · 1 in corso · 3 da rivedere · 1 fallite»: only the counts above zero. */
function countsText(counts: BatchSummary['counts']): string {
  const parts: Array<[number, string]> = [
    [counts.queued, 'in coda'],
    [counts.running, 'in corso'],
    [counts.extracted, 'da rivedere'],
    [counts.failed, 'fallite'],
  ];
  return parts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(' · ');
}

function PendingBatches({ batches }: { batches: BatchSummary[] }) {
  return (
    <Section title="Lotti in sospeso">
      <ul className={panelClass}>
        {batches.map((batch) => (
          <li
            key={batch.batchId}
            data-testid="pending-batch"
            className="flex flex-col gap-2 border-b border-rule px-3 py-3 last:border-b-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">
                Lotto del <span className="figures">{formatDate(romeToday(batch.createdAt))}</span>
              </span>
              <span className="text-sm text-ink-soft">{countsText(batch.counts)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {batch.resumableCount > 0 && (
                <Link
                  href={`/bollette/importa?lotto=${batch.batchId}`}
                  className={buttonClass('primary', 'text-sm')}
                >
                  Riprendi ({batch.resumableCount} in coda, circa{' '}
                  {formatUsd(batch.resumableEstimateMicroUsd)})
                </Link>
              )}
              {batch.counts.extracted + batch.counts.failed > 0 && (
                <Link
                  href={`/bollette/da-rivedere?lotto=${batch.batchId}`}
                  className={buttonClass('secondary', 'text-sm')}
                >
                  Rivedi
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default async function ImportBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ lotto?: string | string[] }>;
}) {
  const user = await pageUser();
  const batchId = queryValue((await searchParams).lotto);

  if (!isExtractionConfigured()) {
    return (
      <Page title={TITLE}>
        <p className="text-ink-soft">Estrazione non configurata su questa installazione.</p>
        <Link href="/bollette/nuova" className={buttonClass('primary', 'self-start')}>
          Inserisci a mano
        </Link>
      </Page>
    );
  }

  // A batch reopened from «Lotti in sospeso»: its rows, and «Riprendi» runs only at the click.
  if (batchId !== undefined) {
    const rows = await listBatchExtractions(getDb(), user.id, batchId);
    return (
      <Page title={TITLE}>
        {rows.length === 0 ? (
          <p className="text-ink-soft">Nessuna bolletta in questo lotto.</p>
        ) : (
          <BulkImporter batch={{ batchId, rows }} />
        )}
      </Page>
    );
  }

  const [batches, supplies] = await Promise.all([
    listBatches(getDb(), user.id),
    listImportSupplies(getDb(), user.id),
  ]);
  const houseCount = new Set(supplies.map((supply) => supply.houseName)).size;
  return (
    <Page title={TITLE}>
      {batches.length > 0 && <PendingBatches batches={batches} />}
      <Section title="Nuovo lotto">
        <p className="max-w-prose text-ink-soft">
          I file restano privati nel tuo archivio. Prima di partire vedi quanto costerebbe estrarli;
          Claude li legge solo quando premi «Avvia estrazione», e ogni bolletta resta in «Da
          rivedere» finché non la confermi.
        </p>
        <BulkImporter
          supplies={supplies.map((supply) => ({
            id: supply.id,
            label: `${formatSupplyLabel(supply.label, supply.houseName, houseCount)}${
              supply.archived ? ' (archiviata)' : ''
            }`,
          }))}
        />
      </Section>
    </Page>
  );
}
