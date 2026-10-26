import { Page } from '@/components/ui/page';
import { ExtractionReview } from '@/components/upload/extraction-review';
import { getDb } from '@/lib/container';
import { getExtractionReview } from '@/lib/services/extractions';
import { orNotFound, pageUser } from '../../../page-helpers';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const review = await orNotFound(getExtractionReview(getDb(), user.id, id));
  return (
    <Page title="Rivedi la bolletta">
      <ExtractionReview
        extractionId={review.extraction.id}
        batchId={review.extraction.batchId}
        documents={review.documents.map((document) => ({
          id: document.id,
          contentType: document.contentType,
        }))}
        draft={review.draft}
        supplies={review.supplies.map((supply) => ({
          id: supply.id,
          kind: supply.kind,
          label: supply.label,
          hasPhotovoltaic: supply.hasPhotovoltaic,
        }))}
        houses={review.houses.map((house) => ({ id: house.id, name: house.name }))}
        overlaps={review.overlaps}
      />
    </Page>
  );
}
