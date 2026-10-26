/**
 * Extractions. Two writes are atomic claims (an UPDATE … RETURNING with the expected status in its
 * WHERE): the run and the confirmation, so that two clicks never start two paid calls nor create
 * two bills. The end of a run is conditional too: it lands only on the run that claimed the row.
 */
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db/create-db';
import { extractions } from '@/lib/db/schema/app';
import type { ExtractionErrorCode, ExtractionStatus } from '@/lib/domain/types';

export type ExtractionRow = typeof extractions.$inferSelect;
export type ExtractionPatch = Partial<
  Pick<
    ExtractionRow,
    'status' | 'resultJson' | 'errorCode' | 'errorMessage' | 'billId' | 'supplyId' | 'finishedAt'
  >
>;

/** Tokens and cost of one call, added to what the row already holds. */
export interface ExtractionUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}

export function insertExtractionQuery(
  db: Db,
  userId: string,
  values: { id: string; supplyId: string | null; batchId: string | null },
) {
  return db.insert(extractions).values({ ...values, userId, status: 'uploading' });
}

export async function getExtraction(
  db: Db,
  userId: string,
  extractionId: string,
): Promise<ExtractionRow | null> {
  const [row] = await db
    .select()
    .from(extractions)
    .where(and(eq(extractions.userId, userId), eq(extractions.id, extractionId)));
  return row ?? null;
}

/** Oldest first; only the given statuses when a list is passed. */
export async function listExtractions(
  db: Db,
  userId: string,
  options: { statuses?: ExtractionStatus[] } = {},
): Promise<ExtractionRow[]> {
  return db
    .select()
    .from(extractions)
    .where(
      and(
        eq(extractions.userId, userId),
        options.statuses === undefined ? undefined : inArray(extractions.status, options.statuses),
      ),
    )
    .orderBy(asc(extractions.createdAt), asc(extractions.id));
}

/**
 * Take the row for a run: a queued one, a failed one whose files were fine, or a running one
 * started before `staleBefore` (its function died). Null when none of those holds.
 */
export async function claimExtractionForRun(
  db: Db,
  userId: string,
  extractionId: string,
  options: { now: number; staleBefore: number },
): Promise<ExtractionRow | null> {
  const [row] = await db
    .update(extractions)
    .set({
      status: 'running',
      startedAt: options.now,
      attempts: sql`${extractions.attempts} + 1`,
      errorCode: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(extractions.id, extractionId),
        eq(extractions.userId, userId),
        or(
          eq(extractions.status, 'queued'),
          and(
            eq(extractions.status, 'failed'),
            or(isNull(extractions.errorCode), ne(extractions.errorCode, 'document_invalid')),
          ),
          and(eq(extractions.status, 'running'), lt(extractions.startedAt, options.staleBefore)),
        ),
      ),
    )
    .returning();
  return row ?? null;
}

function usageColumns(usage: ExtractionUsage | null) {
  if (!usage) return {};
  return {
    model: usage.model,
    inputTokens: sql`COALESCE(${extractions.inputTokens}, 0) + ${usage.inputTokens}`,
    outputTokens: sql`COALESCE(${extractions.outputTokens}, 0) + ${usage.outputTokens}`,
    costMicroUsd: sql`COALESCE(${extractions.costMicroUsd}, 0) + ${usage.costMicroUsd}`,
  };
}

/**
 * The end of a run, written only if the row is still the run that claimed it (running, with the
 * same started_at). Returns the updated rows: none means the run was discarded or taken over.
 */
export async function finishExtractionRun(
  db: Db,
  userId: string,
  extractionId: string,
  run: {
    startedAt: number;
    status: 'extracted' | 'failed';
    resultJson: string | null;
    errorCode: ExtractionErrorCode | null;
    errorMessage: string | null;
    finishedAt: number;
    usage: ExtractionUsage | null;
  },
): Promise<ExtractionRow[]> {
  return db
    .update(extractions)
    .set({
      status: run.status,
      resultJson: run.resultJson,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      finishedAt: run.finishedAt,
      ...usageColumns(run.usage),
    })
    .where(
      and(
        eq(extractions.id, extractionId),
        eq(extractions.userId, userId),
        eq(extractions.status, 'running'),
        eq(extractions.startedAt, run.startedAt),
      ),
    )
    .returning();
}

/** The tokens of a run whose result was thrown away: they were paid for all the same. */
export async function addExtractionUsage(
  db: Db,
  userId: string,
  extractionId: string,
  usage: ExtractionUsage,
): Promise<void> {
  await db
    .update(extractions)
    .set(usageColumns(usage))
    .where(and(eq(extractions.id, extractionId), eq(extractions.userId, userId)));
}

/** Take an extracted row for its confirmation; null when it is not (or no longer) extracted. */
export async function claimExtractionForConfirm(
  db: Db,
  userId: string,
  extractionId: string,
): Promise<ExtractionRow | null> {
  const [row] = await db
    .update(extractions)
    .set({ status: 'confirmed' })
    .where(
      and(
        eq(extractions.id, extractionId),
        eq(extractions.userId, userId),
        eq(extractions.status, 'extracted'),
      ),
    )
    .returning();
  return row ?? null;
}

export function updateExtractionQuery(
  db: Db,
  userId: string,
  extractionId: string,
  patch: ExtractionPatch,
) {
  return db
    .update(extractions)
    .set(patch)
    .where(and(eq(extractions.userId, userId), eq(extractions.id, extractionId)));
}

export function deleteExtractionsQuery(db: Db, userId: string, extractionIds: string[]) {
  return db
    .delete(extractions)
    .where(and(eq(extractions.userId, userId), inArray(extractions.id, extractionIds)));
}

/** Before deleting bills: their extractions stay (for the month's spend) without the link. */
export function clearBillOfExtractionsQuery(db: Db, userId: string, billIds: string[]) {
  return db
    .update(extractions)
    .set({ billId: null })
    .where(and(eq(extractions.userId, userId), inArray(extractions.billId, billIds)));
}

/** Before deleting supplies: their extractions stay without the preselected supply. */
export function clearSupplyOfExtractionsQuery(db: Db, userId: string, supplyIds: string[]) {
  return db
    .update(extractions)
    .set({ supplyId: null })
    .where(and(eq(extractions.userId, userId), inArray(extractions.supplyId, supplyIds)));
}
