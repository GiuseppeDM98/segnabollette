/**
 * The files of the bills on the private store. A document belongs either to an extraction (until
 * it is confirmed, when bill_id is set too) or directly to a bill (an attachment of a bill typed by
 * hand). uploaded_at is set only after the server has verified the stored bytes.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/lib/db/create-db';
import { documents } from '@/lib/db/schema/app';

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = Omit<
  typeof documents.$inferInsert,
  'userId' | 'createdAt' | 'uploadedAt' | 'pageCount'
>;

export function insertDocumentsQuery(db: Db, userId: string, values: DocumentInsert[]) {
  return db.insert(documents).values(values.map((value) => ({ ...value, userId })));
}

export async function getDocument(
  db: Db,
  userId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.id, documentId)));
  return row ?? null;
}

/** A document still waiting for its file (uploaded_at null) at exactly that pathname. */
export async function getPendingDocument(
  db: Db,
  userId: string,
  documentId: string,
  pathname: string,
): Promise<DocumentRow | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.userId, userId),
        eq(documents.id, documentId),
        eq(documents.pathname, pathname),
        isNull(documents.uploadedAt),
      ),
    );
  return row ?? null;
}

export async function getDocumentBySha256(
  db: Db,
  userId: string,
  sha256: string,
): Promise<DocumentRow | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.sha256, sha256)));
  return row ?? null;
}

/** In page order. */
export async function listDocumentsOfExtraction(
  db: Db,
  userId: string,
  extractionId: string,
): Promise<DocumentRow[]> {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.extractionId, extractionId)))
    .orderBy(asc(documents.position));
}

/** Every document of the extractions, in page order within each. */
export async function listDocumentsOfExtractions(
  db: Db,
  userId: string,
  extractionIds: string[],
): Promise<DocumentRow[]> {
  if (extractionIds.length === 0) return [];
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), inArray(documents.extractionId, extractionIds)))
    .orderBy(asc(documents.extractionId), asc(documents.position));
}

/** In page order, uploaded or not. */
export async function listDocumentsOfBill(
  db: Db,
  userId: string,
  billId: string,
): Promise<DocumentRow[]> {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.billId, billId)))
    .orderBy(asc(documents.position));
}

export function updateDocumentQuery(
  db: Db,
  userId: string,
  documentId: string,
  patch: Partial<Pick<DocumentRow, 'pageCount' | 'uploadedAt'>>,
) {
  return db
    .update(documents)
    .set(patch)
    .where(and(eq(documents.userId, userId), eq(documents.id, documentId)));
}

export function linkDocumentsToBillQuery(
  db: Db,
  userId: string,
  extractionId: string,
  billId: string,
) {
  return db
    .update(documents)
    .set({ billId })
    .where(and(eq(documents.userId, userId), eq(documents.extractionId, extractionId)));
}

export function deleteDocumentsQuery(db: Db, userId: string, documentIds: string[]) {
  return db
    .delete(documents)
    .where(and(eq(documents.userId, userId), inArray(documents.id, documentIds)));
}

export function deleteDocumentsOfExtractionQuery(db: Db, userId: string, extractionId: string) {
  return db
    .delete(documents)
    .where(and(eq(documents.userId, userId), eq(documents.extractionId, extractionId)));
}

export function deleteDocumentsOfBillsQuery(db: Db, userId: string, billIds: string[]) {
  return db
    .delete(documents)
    .where(and(eq(documents.userId, userId), inArray(documents.billId, billIds)));
}

export async function listDocumentPathnamesOfBills(
  db: Db,
  userId: string,
  billIds: string[],
): Promise<string[]> {
  if (billIds.length === 0) return [];
  const rows = await db
    .select({ pathname: documents.pathname })
    .from(documents)
    .where(and(eq(documents.userId, userId), inArray(documents.billId, billIds)));
  return rows.map((row) => row.pathname);
}
