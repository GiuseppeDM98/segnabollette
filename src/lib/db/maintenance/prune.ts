/**
 * The only queries across users outside the reference prices, used only by `pnpm documents:prune`
 * to match the file store against the database. Outside repositories/ on purpose: the per-user
 * signature rule (scope.test.ts) does not apply here, and no app module imports this file.
 */
import { and, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '@/lib/db/create-db';
import { documents, extractions } from '@/lib/db/schema/app';

export async function listAllDocumentPathnames(db: Db): Promise<string[]> {
  const rows = await db.select({ pathname: documents.pathname }).from(documents);
  return rows.map((row) => row.pathname);
}

export interface StaleUploads {
  /** Extractions still uploading, created before the threshold. */
  extractionIds: string[];
  /** Their documents and the attachments never uploaded, created before the threshold. */
  documents: Array<{ id: string; pathname: string }>;
}

/** Uploads abandoned before `olderThanMs` (epoch ms): never verified, so never usable. */
export async function listStaleUploads(db: Db, olderThanMs: number): Promise<StaleUploads> {
  const stale = await db
    .select({ id: extractions.id })
    .from(extractions)
    .where(and(eq(extractions.status, 'uploading'), lt(extractions.createdAt, olderThanMs)));
  const extractionIds = stale.map((row) => row.id);
  const ofExtractions =
    extractionIds.length === 0
      ? []
      : await db
          .select({ id: documents.id, pathname: documents.pathname })
          .from(documents)
          .where(inArray(documents.extractionId, extractionIds));
  const attachments = await db
    .select({ id: documents.id, pathname: documents.pathname })
    .from(documents)
    .where(
      and(
        isNotNull(documents.billId),
        isNull(documents.uploadedAt),
        lt(documents.createdAt, olderThanMs),
      ),
    );
  return { extractionIds, documents: [...ofExtractions, ...attachments] };
}

/** The rows of the stale uploads, documents before their extractions. */
export function deleteStaleUploadsQuery(
  db: Db,
  ids: { documentIds: string[]; extractionIds: string[] },
): BatchItem<'sqlite'>[] {
  const queries: BatchItem<'sqlite'>[] = [];
  if (ids.documentIds.length > 0) {
    queries.push(db.delete(documents).where(inArray(documents.id, ids.documentIds)));
  }
  if (ids.extractionIds.length > 0) {
    queries.push(db.delete(extractions).where(inArray(extractions.id, ids.extractionIds)));
  }
  return queries;
}
