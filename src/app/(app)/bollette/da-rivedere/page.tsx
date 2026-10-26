import { Page } from '@/components/ui/page';
import { PendingExtractionList } from '@/components/upload/pending-extraction-list';
import { getDb } from '@/lib/container';
import { listPendingExtractions } from '@/lib/services/extractions';
import { pageUser } from '../../page-helpers';

export default async function ToReviewPage() {
  const user = await pageUser();
  const pending = await listPendingExtractions(getDb(), user.id);
  return (
    <Page title="Da rivedere">
      {pending.length === 0 ? (
        <p className="text-ink-soft">Nessuna bolletta da rivedere.</p>
      ) : (
        <PendingExtractionList extractions={pending} now={Date.now()} />
      )}
    </Page>
  );
}
