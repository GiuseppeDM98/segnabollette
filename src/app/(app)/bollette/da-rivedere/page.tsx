import Link from 'next/link';
import { Page } from '@/components/ui/page';
import {
  PendingExtractionList,
  type PendingListItem,
} from '@/components/upload/pending-extraction-list';
import { getDb } from '@/lib/container';
import { formatDate, formatInstant } from '@/lib/format';
import { listBatchExtractions, listPendingExtractions } from '@/lib/services/extractions';
import { pageUser, queryValue } from '../../page-helpers';

/** Everything waiting for the owner, oldest first; with ?lotto= one batch, oldest period first. */
export default async function ToReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lotto?: string | string[] }>;
}) {
  const user = await pageUser();
  const batchId = queryValue((await searchParams).lotto);
  const now = Date.now();

  if (batchId !== undefined) {
    const rows = await listBatchExtractions(getDb(), user.id, batchId);
    const items: PendingListItem[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt,
      estimatedCostMicroUsd: row.estimatedCostMicroUsd,
      title: row.fileLabel,
      detail: row.periodStart ? { prefix: 'dal ', figure: formatDate(row.periodStart) } : null,
    }));
    return (
      <Page title="Da rivedere">
        <Link href="/bollette/da-rivedere" className="self-start">
          Tutte le bollette da rivedere
        </Link>
        {items.length === 0 ? (
          <p className="text-ink-soft">Nessuna bolletta da rivedere in questo lotto.</p>
        ) : (
          <PendingExtractionList extractions={items} now={now} />
        )}
      </Page>
    );
  }

  const pending = await listPendingExtractions(getDb(), user.id);
  const items: PendingListItem[] = pending.map((extraction) => ({
    id: extraction.id,
    status: extraction.status,
    errorCode: extraction.errorCode,
    errorMessage: extraction.errorMessage,
    startedAt: extraction.startedAt,
    estimatedCostMicroUsd: extraction.estimatedCostMicroUsd,
    title: extraction.supplyLabel,
    detail: { prefix: '', figure: formatInstant(extraction.createdAt) },
  }));
  return (
    <Page title="Da rivedere">
      {items.length === 0 ? (
        <p className="text-ink-soft">Nessuna bolletta da rivedere.</p>
      ) : (
        <PendingExtractionList extractions={items} now={now} />
      )}
    </Page>
  );
}
