/**
 * From a file in the browser to a confirmed bill: create the rows, let the browser upload straight
 * to Blob, verify the stored bytes, run the extraction only when the owner clicks «Estrai», review,
 * confirm or discard. Every step is the user's own (userId in every read and write; another user's
 * id behaves as missing) and takes its external services as explicit dependencies.
 */
import type { BatchItem } from 'drizzle-orm/batch';
import { nanoid } from 'nanoid';
import {
  type BlobStore,
  documentPathname,
  MAX_EXTRACTION_BYTES,
  maxBytesFor,
} from '@/lib/blob/types';
import type { Db } from '@/lib/db/create-db';
import * as billsRepository from '@/lib/db/repositories/bills';
import type { DocumentInsert, DocumentRow } from '@/lib/db/repositories/documents';
import * as documentsRepository from '@/lib/db/repositories/documents';
import type { ExtractionRow } from '@/lib/db/repositories/extractions';
import * as extractionsRepository from '@/lib/db/repositories/extractions';
import type { HouseRow } from '@/lib/db/repositories/houses';
import * as housesRepository from '@/lib/db/repositories/houses';
import type { SupplyRow } from '@/lib/db/repositories/supplies';
import * as suppliesRepository from '@/lib/db/repositories/supplies';
import { type ExistingBillPeriod, findOverlappingBills } from '@/lib/domain/bill-checks';
import { romeToday } from '@/lib/domain/dates';
import type {
  DocumentContentType,
  ExtractionErrorCode,
  ExtractionStatus,
  IsoDate,
  MonthKey,
  SupplyKind,
} from '@/lib/domain/types';
import { DomainError } from '@/lib/errors';
import type {
  BillExtractor,
  ExtractorDocument,
  ExtractorOutcome,
} from '@/lib/extraction/extractor';
import { costMicroUsd, estimateExtractionCost } from '@/lib/extraction/pricing';
import { type Extraction, ExtractionSchema } from '@/lib/extraction/schema';
import { type ReviewDraft, toBillInput } from '@/lib/extraction/to-bill-input';
import { validateExtraction } from '@/lib/extraction/validate';
import { verifyDocument } from '@/lib/extraction/verify-document';
import { formatSupplyLabel } from '@/lib/format';
import { runBatch } from './batch';
import { confirmBill } from './bills';
import { createSupply, deleteSupply, type SupplyInput } from './houses-supplies';

/** A running extraction older than this is dead: its function has been stopped long ago. */
const STALE_RUN_MS = 360_000;
/** The call must be over by then: the run route may last 300 s, and the rest is bookkeeping. */
const RUN_DEADLINE_MS = 280_000;
const MAX_FILES = 10;
const ACCEPTED_TYPES: readonly string[] = ['application/pdf', 'image/jpeg'];
/** A batch id is a nanoid made by the browser: 21 characters of the URL-safe alphabet. */
const BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

export interface UploadFile {
  sha256: string;
  contentType: DocumentContentType;
  sizeBytes: number;
}

/** Where the browser uploads one file. */
export interface PlannedDocument {
  documentId: string;
  pathname: string;
  contentType: DocumentContentType;
}

export interface DuplicateExtraction {
  duplicateOf: string;
  duplicateStatus: Extract<
    ExtractionStatus,
    'uploading' | 'queued' | 'running' | 'extracted' | 'failed'
  >;
  /** uploading: the files to upload again, on these pathnames. */
  documents?: PlannedDocument[];
  /** queued: what «Estrai» would cost. */
  estimatedCostMicroUsd?: number;
  /** failed: why. */
  errorCode?: ExtractionErrorCode | null;
  errorMessage?: string | null;
}

export type CreateExtractionResult =
  | { extractionId: string; documents: PlannedDocument[] }
  | DuplicateExtraction;

export interface UploadEstimate {
  pdfPages: number;
  photos: number;
  estimatedCostMicroUsd: number;
}

function plannedOf(document: DocumentRow): PlannedDocument {
  return {
    documentId: document.id,
    pathname: document.pathname,
    contentType: document.contentType,
  };
}

/** The checks shared by extractions and attachments; every violation is listed at once. */
function assertFiles(files: readonly UploadFile[]): void {
  const errors = new Set<string>();
  if (files.length < 1 || files.length > MAX_FILES) errors.add('Carica da 1 a 10 file.');
  if (files.some((file) => file.contentType === 'application/pdf') && files.length > 1) {
    errors.add('Un PDF va caricato da solo.');
  }
  if (files.some((file) => !ACCEPTED_TYPES.includes(file.contentType))) {
    errors.add('Carica un PDF o foto JPEG.');
  }
  for (const file of files) {
    if (file.sizeBytes > maxBytesFor(file.contentType)) {
      errors.add(
        file.contentType === 'application/pdf'
          ? 'Il PDF supera i 10 MB.'
          : 'Una foto supera i 5 MB.',
      );
    }
  }
  if (files.reduce((sum, file) => sum + file.sizeBytes, 0) > MAX_EXTRACTION_BYTES) {
    errors.add('I file insieme superano i 20 MB.');
  }
  if (new Set(files.map((file) => file.sha256)).size !== files.length) {
    errors.add('Lo stesso file compare due volte.');
  }
  if (errors.size > 0) throw new DomainError('VALIDATION', undefined, [...errors]);
}

function estimateOf(documents: readonly DocumentRow[]): UploadEstimate {
  let pdfPages = 0;
  let photos = 0;
  for (const document of documents) {
    if (document.contentType === 'application/pdf') pdfPages += document.pageCount ?? 0;
    else photos += 1;
  }
  return { pdfPages, photos, estimatedCostMicroUsd: estimateExtractionCost({ pdfPages, photos }) };
}

/** Two requests in a race with the same file: the second one trips the unique index. */
function isSha256Conflict(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if (current.message.includes('documents.user_id, documents.sha256')) return true;
  }
  return false;
}

async function deleteFilesLogged(blob: BlobStore, pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) return;
  try {
    await blob.deleteDocuments(pathnames);
  } catch (error) {
    // Why: the rows are already gone; documents:prune finds the orphan files.
    console.error('Deleting files from Blob failed', error);
  }
}

async function billDuplicateError(db: Db, userId: string, billId: string): Promise<DomainError> {
  const bill = await billsRepository.getBill(db, userId, billId);
  return new DomainError('DUPLICATE_DOCUMENT', undefined, {
    billId,
    periodStart: bill?.periodStart ?? null,
    periodEnd: bill?.periodEnd ?? null,
  });
}

type DuplicateDecision =
  | { kind: 'duplicate'; value: DuplicateExtraction }
  | { kind: 'new'; abandoned: Array<{ extraction: ExtractionRow; documents: DocumentRow[] }> };

/**
 * What to do with files already known, in order: a bill's file is refused; a file of a live
 * extraction answers with that extraction; the same interrupted upload is resumed; any other
 * interrupted upload holding one of the files is abandoned.
 */
async function decideDuplicates(
  db: Db,
  userId: string,
  input: { batchId: string | null; files: readonly UploadFile[] },
): Promise<DuplicateDecision> {
  const known: DocumentRow[] = [];
  for (const file of input.files) {
    const document = await documentsRepository.getDocumentBySha256(db, userId, file.sha256);
    if (document) known.push(document);
  }
  const ofBill = known.find((document) => document.billId !== null);
  if (ofBill?.billId) throw await billDuplicateError(db, userId, ofBill.billId);

  const extractionIds = [
    ...new Set(known.flatMap((document) => (document.extractionId ? [document.extractionId] : []))),
  ];
  const extractions: ExtractionRow[] = [];
  for (const extractionId of extractionIds) {
    const extraction = await extractionsRepository.getExtraction(db, userId, extractionId);
    if (extraction) extractions.push(extraction);
  }

  for (const extraction of extractions) {
    const { id: duplicateOf, status } = extraction;
    if (status === 'queued') {
      const documents = await documentsRepository.listDocumentsOfExtraction(
        db,
        userId,
        duplicateOf,
      );
      const { estimatedCostMicroUsd } = estimateOf(documents);
      return {
        kind: 'duplicate',
        value: { duplicateOf, duplicateStatus: status, estimatedCostMicroUsd },
      };
    }
    if (status === 'failed') {
      return {
        kind: 'duplicate',
        value: {
          duplicateOf,
          duplicateStatus: status,
          errorCode: extraction.errorCode,
          errorMessage: extraction.errorMessage,
        },
      };
    }
    if (status === 'running' || status === 'extracted') {
      return { kind: 'duplicate', value: { duplicateOf, duplicateStatus: status } };
    }
  }

  const abandoned: Array<{ extraction: ExtractionRow; documents: DocumentRow[] }> = [];
  const requestShas = input.files.map((file) => file.sha256).join(',');
  for (const extraction of extractions) {
    if (extraction.status !== 'uploading') continue;
    const documents = await documentsRepository.listDocumentsOfExtraction(
      db,
      userId,
      extraction.id,
    );
    const sameUpload =
      extraction.batchId === input.batchId &&
      documents.map((document) => document.sha256).join(',') === requestShas;
    if (sameUpload) {
      return {
        kind: 'duplicate',
        value: {
          duplicateOf: extraction.id,
          duplicateStatus: 'uploading',
          documents: documents.map(plannedOf),
        },
      };
    }
    abandoned.push({ extraction, documents });
  }
  return { kind: 'new', abandoned };
}

export async function createExtraction(
  db: Db,
  userId: string,
  input: { supplyId: string | null; batchId: string | null; files: UploadFile[] },
  deps: { blob: BlobStore; now: number },
): Promise<CreateExtractionResult> {
  if (input.batchId !== null && !BATCH_ID_PATTERN.test(input.batchId)) {
    throw new DomainError('VALIDATION', undefined, ['Identificativo del lotto non valido.']);
  }
  assertFiles(input.files);
  if (input.supplyId !== null) {
    const supply = await suppliesRepository.getSupply(db, userId, input.supplyId);
    if (!supply) throw new DomainError('NOT_FOUND');
  }

  const decision = await decideDuplicates(db, userId, input);
  if (decision.kind === 'duplicate') return decision.value;

  const extractionId = nanoid();
  const documents = input.files.map((file, position) => {
    const documentId = nanoid();
    return {
      id: documentId,
      extractionId,
      billId: null,
      pathname: documentPathname(userId, documentId, file.contentType),
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      position,
    };
  });
  const queries: BatchItem<'sqlite'>[] = [];
  for (const { extraction } of decision.abandoned) {
    queries.push(
      documentsRepository.deleteDocumentsOfExtractionQuery(db, userId, extraction.id),
      extractionsRepository.deleteExtractionsQuery(db, userId, [extraction.id]),
    );
  }
  queries.push(
    extractionsRepository.insertExtractionQuery(db, userId, {
      id: extractionId,
      supplyId: input.supplyId,
      batchId: input.batchId,
    }),
    documentsRepository.insertDocumentsQuery(db, userId, documents),
  );
  try {
    await runBatch(db, queries);
  } catch (error) {
    if (!isSha256Conflict(error)) throw error;
    const retry = await decideDuplicates(db, userId, input);
    if (retry.kind === 'duplicate') return retry.value;
    throw error;
  }
  await deleteFilesLogged(
    deps.blob,
    decision.abandoned.flatMap(({ documents: old }) => old.map((document) => document.pathname)),
  );
  return {
    extractionId,
    documents: documents.map((document) => ({
      documentId: document.id,
      pathname: document.pathname,
      contentType: document.contentType,
    })),
  };
}

export async function createAttachment(
  db: Db,
  userId: string,
  input: { billId: string; files: UploadFile[] },
): Promise<{ documents: PlannedDocument[] }> {
  const bill = await billsRepository.getBill(db, userId, input.billId);
  if (!bill) throw new DomainError('NOT_FOUND');
  assertFiles(input.files);

  const plan = async (): Promise<{ planned: PlannedDocument[]; inserts: DocumentInsert[] }> => {
    const existing = await documentsRepository.listDocumentsOfBill(db, userId, bill.id);
    let nextPosition = existing.reduce((max, document) => Math.max(max, document.position + 1), 0);
    const planned: PlannedDocument[] = [];
    const inserts: DocumentInsert[] = [];
    for (const file of input.files) {
      const known = await documentsRepository.getDocumentBySha256(db, userId, file.sha256);
      if (known) {
        // An interrupted attachment of this same bill is resumed on the same pathname.
        if (known.billId === bill.id && known.uploadedAt === null) {
          planned.push(plannedOf(known));
          continue;
        }
        if (known.billId !== null) throw await billDuplicateError(db, userId, known.billId);
        throw new DomainError('DUPLICATE_DOCUMENT', undefined, {
          extractionId: known.extractionId,
        });
      }
      const documentId = nanoid();
      const pathname = documentPathname(userId, documentId, file.contentType);
      inserts.push({
        id: documentId,
        extractionId: null,
        billId: bill.id,
        pathname,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        position: nextPosition,
      });
      nextPosition += 1;
      planned.push({ documentId, pathname, contentType: file.contentType });
    }
    return { planned, inserts };
  };

  const first = await plan();
  try {
    if (first.inserts.length > 0) {
      await documentsRepository.insertDocumentsQuery(db, userId, first.inserts);
    }
    return { documents: first.planned };
  } catch (error) {
    if (!isSha256Conflict(error)) throw error;
    // The other request won the race: planning again finds its rows.
    const retry = await plan();
    if (retry.inserts.length > 0) throw error;
    return { documents: retry.planned };
  }
}

/**
 * Read every stored file back and check it against what the browser declared. Throws the first
 * DOCUMENT_INVALID; a missing file is one too.
 */
async function verifyStoredDocuments(
  blob: BlobStore,
  documents: readonly DocumentRow[],
): Promise<Array<{ document: DocumentRow; pageCount: number | null }>> {
  const verified: Array<{ document: DocumentRow; pageCount: number | null }> = [];
  for (const document of documents) {
    const bytes = await blob.readDocument(document.pathname);
    if (!bytes) throw new DomainError('DOCUMENT_INVALID', 'File non arrivato.');
    const { pageCount } = await verifyDocument(bytes, document);
    verified.push({ document, pageCount });
  }
  return verified;
}

export async function markExtractionUploaded(
  db: Db,
  userId: string,
  extractionId: string,
  deps: { blob: BlobStore; now: number },
): Promise<UploadEstimate> {
  const extraction = await extractionsRepository.getExtraction(db, userId, extractionId);
  if (extraction?.status !== 'uploading') throw new DomainError('NOT_FOUND');
  const documents = await documentsRepository.listDocumentsOfExtraction(db, userId, extractionId);
  let verified: Awaited<ReturnType<typeof verifyStoredDocuments>>;
  try {
    verified = await verifyStoredDocuments(deps.blob, documents);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'DOCUMENT_INVALID') {
      // The files stay until «Scarta»: the owner sees why the extraction failed.
      await extractionsRepository.updateExtractionQuery(db, userId, extractionId, {
        status: 'failed',
        errorCode: 'document_invalid',
        errorMessage: error.message,
      });
    }
    throw error;
  }
  await runBatch(db, [
    ...verified.map(({ document, pageCount }) =>
      documentsRepository.updateDocumentQuery(db, userId, document.id, {
        pageCount,
        uploadedAt: deps.now,
      }),
    ),
    extractionsRepository.updateExtractionQuery(db, userId, extractionId, { status: 'queued' }),
  ]);
  return estimateOf(verified.map(({ document, pageCount }) => ({ ...document, pageCount })));
}

export async function markAttachmentUploaded(
  db: Db,
  userId: string,
  billId: string,
  documentIds: string[],
  deps: { blob: BlobStore; now: number },
): Promise<void> {
  const bill = await billsRepository.getBill(db, userId, billId);
  if (!bill) throw new DomainError('NOT_FOUND');
  const documents: DocumentRow[] = [];
  for (const documentId of documentIds) {
    const document = await documentsRepository.getDocument(db, userId, documentId);
    if (!document || document.billId !== billId || document.uploadedAt !== null) {
      throw new DomainError('NOT_FOUND');
    }
    documents.push(document);
  }
  let verified: Awaited<ReturnType<typeof verifyStoredDocuments>>;
  try {
    verified = await verifyStoredDocuments(deps.blob, documents);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'DOCUMENT_INVALID') {
      // Row first, file after, as with every delete.
      await runBatch(db, [
        documentsRepository.deleteDocumentsQuery(
          db,
          userId,
          documents.map((document) => document.id),
        ),
      ]);
      await deleteFilesLogged(
        deps.blob,
        documents.map((document) => document.pathname),
      );
    }
    throw error;
  }
  await runBatch(
    db,
    verified.map(({ document, pageCount }) =>
      documentsRepository.updateDocumentQuery(db, userId, document.id, {
        pageCount,
        uploadedAt: deps.now,
      }),
    ),
  );
}

type RunResult = Pick<ExtractorOutcome, 'usage' | 'model'> & {
  status: 'extracted' | 'failed';
  resultJson: string | null;
  errorCode: ExtractionErrorCode | null;
  errorMessage: string | null;
};

function toRunResult(outcome: ExtractorOutcome): RunResult {
  const paid = { usage: outcome.usage, model: outcome.model };
  if (!outcome.ok) {
    return {
      ...paid,
      status: 'failed',
      resultJson: null,
      errorCode: outcome.code,
      errorMessage: outcome.message,
    };
  }
  const errors = validateExtraction(outcome.extraction);
  if (errors.includes('not_a_bill')) {
    return {
      ...paid,
      status: 'failed',
      resultJson: null,
      errorCode: 'not_a_bill',
      errorMessage: 'Il documento non sembra una bolletta.',
    };
  }
  if (errors.length > 0) {
    return {
      ...paid,
      status: 'failed',
      resultJson: null,
      errorCode: 'invalid_output',
      errorMessage: errors.join(' '),
    };
  }
  return {
    ...paid,
    status: 'extracted',
    resultJson: JSON.stringify(outcome.extraction),
    errorCode: null,
    errorMessage: null,
  };
}

/** The one paid step: it runs only when the owner clicks «Estrai» (or «Riprova»). */
export async function runExtraction(
  db: Db,
  userId: string,
  extractionId: string,
  deps: { blob: BlobStore; extractor: BillExtractor; now: number; clock: () => number },
): Promise<ExtractionRow> {
  const claimed = await extractionsRepository.claimExtractionForRun(db, userId, extractionId, {
    now: deps.now,
    staleBefore: deps.now - STALE_RUN_MS,
  });
  if (!claimed) {
    const existing = await extractionsRepository.getExtraction(db, userId, extractionId);
    throw new DomainError(existing ? 'EXTRACTION_BUSY' : 'NOT_FOUND');
  }

  const rows = await documentsRepository.listDocumentsOfExtraction(db, userId, extractionId);
  const documents: ExtractorDocument[] = [];
  let missing = false;
  for (const row of rows) {
    const bytes = await deps.blob.readDocument(row.pathname);
    if (!bytes) {
      missing = true;
      break;
    }
    documents.push({ contentType: row.contentType, bytes });
  }

  let result: RunResult;
  if (missing || documents.length === 0) {
    result = {
      status: 'failed',
      resultJson: null,
      errorCode: 'document_invalid',
      errorMessage: 'File non trovato.',
      usage: null,
      model: null,
    };
  } else {
    let expectedKind: SupplyKind | null = null;
    if (claimed.supplyId !== null) {
      const supply = await suppliesRepository.getSupply(db, userId, claimed.supplyId);
      expectedKind = supply?.kind ?? null;
    }
    const outcome = await deps.extractor.extract({
      documents,
      today: romeToday(deps.now),
      expectedKind,
      deadlineMs: deps.now + RUN_DEADLINE_MS,
    });
    result = toRunResult(outcome);
  }

  const usage =
    result.usage && result.model
      ? {
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costMicroUsd: costMicroUsd(result.usage, result.model),
        }
      : null;
  // claimed.startedAt is the instant of this claim: it tells this run from a later one.
  const updated = await extractionsRepository.finishExtractionRun(db, userId, extractionId, {
    startedAt: claimed.startedAt ?? deps.now,
    status: result.status,
    resultJson: result.resultJson,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    finishedAt: deps.clock(),
    usage,
  });
  const [finished] = updated;
  if (finished) return finished;

  // Discarded meanwhile, or taken over after six minutes: the result is thrown away, the tokens
  // were paid for all the same.
  if (usage) await extractionsRepository.addExtractionUsage(db, userId, extractionId, usage);
  const reread = await extractionsRepository.getExtraction(db, userId, extractionId);
  if (!reread) throw new DomainError('NOT_FOUND');
  return reread;
}

export interface ExtractionReview {
  extraction: ExtractionRow;
  documents: DocumentRow[];
  draft: ReviewDraft;
  /** Not archived (the choice), plus the recognised one even when archived (the form's supply). */
  supplies: SupplyRow[];
  houses: HouseRow[];
  overlaps: ExistingBillPeriod[];
}

export async function getExtractionReview(
  db: Db,
  userId: string,
  extractionId: string,
): Promise<ExtractionReview> {
  const extraction = await extractionsRepository.getExtraction(db, userId, extractionId);
  if (extraction?.status !== 'extracted' || extraction.resultJson === null) {
    throw new DomainError('NOT_FOUND');
  }
  const result: Extraction = ExtractionSchema.parse(JSON.parse(extraction.resultJson));
  const allSupplies = await suppliesRepository.listSupplies(db, userId, { includeArchived: true });
  const draft = toBillInput(result, {
    supplies: allSupplies,
    preselectedSupplyId: extraction.supplyId,
  });
  const supplies = allSupplies.filter(
    (supply) => supply.archivedAt === null || supply.id === draft.matchedSupplyId,
  );
  const overlaps =
    draft.matchedSupplyId === null
      ? []
      : findOverlappingBills(
          draft.input,
          await billsRepository.listBillPeriods(db, userId, draft.matchedSupplyId),
        );
  const documents = (
    await documentsRepository.listDocumentsOfExtraction(db, userId, extractionId)
  ).filter((document) => document.uploadedAt !== null);
  const houses = await housesRepository.listHouses(db, userId);
  return { extraction, documents, draft, supplies, houses, overlaps };
}

export async function confirmExtraction(
  db: Db,
  userId: string,
  extractionId: string,
  payload: { input: unknown; newSupply: SupplyInput | null },
): Promise<{ billId: string; batchId: string | null }> {
  // A second «Conferma» finds the row already confirmed: it never creates a second bill.
  const claimed = await extractionsRepository.claimExtractionForConfirm(db, userId, extractionId);
  if (!claimed) {
    const existing = await extractionsRepository.getExtraction(db, userId, extractionId);
    throw new DomainError(existing ? 'EXTRACTION_BUSY' : 'NOT_FOUND');
  }

  let createdSupplyId: string | null = null;
  let billId: string;
  try {
    let input = payload.input;
    if (payload.newSupply) {
      createdSupplyId = (await createSupply(db, userId, payload.newSupply)).supplyId;
      // The input stays unknown until confirmBill validates it.
      input =
        typeof input === 'object' && input !== null
          ? { ...input, supplyId: createdSupplyId }
          : input;
    }
    ({ billId } = await confirmBill(db, userId, input, { source: 'extraction' }));
  } catch (error) {
    if (createdSupplyId !== null) await deleteSupply(db, userId, createdSupplyId);
    await extractionsRepository.updateExtractionQuery(db, userId, extractionId, {
      status: 'extracted',
    });
    throw error;
  }

  // The data now live in the bill: the extraction keeps only its cost.
  await runBatch(db, [
    documentsRepository.linkDocumentsToBillQuery(db, userId, extractionId, billId),
    extractionsRepository.updateExtractionQuery(db, userId, extractionId, {
      billId,
      resultJson: null,
    }),
  ]);
  // The batch tells the review where to go next: the following bill of the same import.
  return { billId, batchId: claimed.batchId };
}

export async function discardExtraction(
  db: Db,
  userId: string,
  extractionId: string,
  deps: { blob: BlobStore; now: number },
): Promise<void> {
  const extraction = await extractionsRepository.getExtraction(db, userId, extractionId);
  if (!extraction || extraction.status === 'confirmed' || extraction.status === 'discarded') {
    throw new DomainError('NOT_FOUND');
  }
  if (extraction.status === 'running' && (extraction.startedAt ?? 0) >= deps.now - STALE_RUN_MS) {
    throw new DomainError('EXTRACTION_BUSY');
  }
  const documents = await documentsRepository.listDocumentsOfExtraction(db, userId, extractionId);
  await runBatch(db, [
    documentsRepository.deleteDocumentsOfExtractionQuery(db, userId, extractionId),
    extractionsRepository.updateExtractionQuery(db, userId, extractionId, {
      status: 'discarded',
      resultJson: null,
    }),
  ]);
  await deleteFilesLogged(
    deps.blob,
    documents.map((document) => document.pathname),
  );
}

export interface PendingExtraction {
  id: string;
  status: Extract<ExtractionStatus, 'queued' | 'running' | 'extracted' | 'failed'>;
  supplyLabel: string | null;
  createdAt: number;
  startedAt: number | null;
  errorCode: ExtractionErrorCode | null;
  errorMessage: string | null;
  estimatedCostMicroUsd: number | null;
}

const PENDING_STATUSES = ['queued', 'running', 'extracted', 'failed'] as const;

/** «Da rivedere»: what waits for the owner, oldest first. It never reads the files. */
export async function listPendingExtractions(db: Db, userId: string): Promise<PendingExtraction[]> {
  const rows = await extractionsRepository.listExtractions(db, userId, {
    statuses: [...PENDING_STATUSES],
  });
  const supplies = await suppliesRepository.listSupplies(db, userId, { includeArchived: true });
  const houses = await housesRepository.listHouses(db, userId);
  const supplyById = new Map(supplies.map((supply) => [supply.id, supply]));
  const houseNameById = new Map(houses.map((house) => [house.id, house.name]));
  const queuedIds = rows.filter((row) => row.status === 'queued').map((row) => row.id);
  const queuedDocuments = await documentsRepository.listDocumentsOfExtractions(
    db,
    userId,
    queuedIds,
  );
  return rows.flatMap((row) => {
    const status = row.status;
    if (!PENDING_STATUSES.some((pending) => pending === status)) return [];
    const supply = row.supplyId === null ? undefined : supplyById.get(row.supplyId);
    const supplyLabel = supply
      ? formatSupplyLabel(supply.label, houseNameById.get(supply.houseId) ?? '', houses.length)
      : null;
    const estimatedCostMicroUsd =
      status === 'queued'
        ? estimateOf(queuedDocuments.filter((document) => document.extractionId === row.id))
            .estimatedCostMicroUsd
        : null;
    return [
      {
        id: row.id,
        status: status as PendingExtraction['status'],
        supplyLabel,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        estimatedCostMicroUsd,
      },
    ];
  });
}

// Batches: a bulk import gives its extractions one batch_id, made by the browser. There is no
// batch table: a batch lives as long as one of its extractions is open (queued, running,
// extracted or failed).

type OpenStatus = PendingExtraction['status'];

function isOpenStatus(status: ExtractionStatus): status is OpenStatus {
  return PENDING_STATUSES.some((open) => open === status);
}

/**
 * What the queue can still run without a new upload: the ones waiting, and the ones that failed
 * because the service was down (any other failure needs the owner's look, not a run in bulk).
 */
function isResumable(row: ExtractionRow): boolean {
  return row.status === 'queued' || (row.status === 'failed' && row.errorCode === 'unavailable');
}

export interface BatchSummary {
  batchId: string;
  /** The oldest creation among the batch's open extractions. */
  createdAt: number;
  counts: Record<OpenStatus, number>;
  resumableCount: number;
  resumableEstimateMicroUsd: number;
}

export interface BatchExtractionRow {
  id: string;
  status: 'queued' | 'running' | 'extracted' | 'failed';
  errorCode: string | null;
  errorMessage: string | null;
  /** "PDF, 3 pagine", "PDF" when the page count is unknown, or "Foto". */
  fileLabel: string;
  /** The extracted billing period start; null until extracted. */
  periodStart: IsoDate | null;
  createdAt: number;
  startedAt: number | null;
  /** Only for queued and failed rows, the ones that can still be run. */
  estimatedCostMicroUsd: number | null;
}

function fileLabelOf(documents: readonly DocumentRow[]): string {
  const pdf = documents.find((document) => document.contentType === 'application/pdf');
  if (!pdf) return 'Foto';
  if (pdf.pageCount === null) return 'PDF';
  return `PDF, ${pdf.pageCount} ${pdf.pageCount === 1 ? 'pagina' : 'pagine'}`;
}

/** The period start Claude read, from the stored result; the schema's sentinel '' is no period. */
function extractedPeriodStart(resultJson: string | null): IsoDate | null {
  if (resultJson === null) return null;
  const result: unknown = JSON.parse(resultJson);
  if (typeof result !== 'object' || result === null || !('periodStart' in result)) return null;
  const { periodStart } = result;
  return typeof periodStart === 'string' && periodStart !== '' ? periodStart : null;
}

/** Review order: by extracted period start (no period last), then creation, then id. */
function compareForReview(a: BatchExtractionRow, b: BatchExtractionRow): number {
  if (a.periodStart !== b.periodStart) {
    if (a.periodStart === null) return 1;
    if (b.periodStart === null) return -1;
    return a.periodStart < b.periodStart ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function documentsByExtraction(documents: readonly DocumentRow[]): Map<string, DocumentRow[]> {
  const byExtraction = new Map<string, DocumentRow[]>();
  for (const document of documents) {
    if (document.extractionId === null) continue;
    const own = byExtraction.get(document.extractionId) ?? [];
    own.push(document);
    byExtraction.set(document.extractionId, own);
  }
  return byExtraction;
}

/** The batches with something still open, newest first; one query for every batch's files. */
export async function listBatches(db: Db, userId: string): Promise<BatchSummary[]> {
  const rows = await extractionsRepository.listBatchedExtractions(db, userId);
  const documents = documentsByExtraction(
    await documentsRepository.listDocumentsOfExtractions(
      db,
      userId,
      rows.filter(isResumable).map((row) => row.id),
    ),
  );
  const batches = new Map<string, BatchSummary>();
  for (const row of rows) {
    const status = row.status;
    if (row.batchId === null || !isOpenStatus(status)) continue;
    const batch = batches.get(row.batchId) ?? {
      batchId: row.batchId,
      createdAt: row.createdAt,
      counts: { queued: 0, running: 0, extracted: 0, failed: 0 },
      resumableCount: 0,
      resumableEstimateMicroUsd: 0,
    };
    batch.createdAt = Math.min(batch.createdAt, row.createdAt);
    batch.counts[status] += 1;
    if (isResumable(row)) {
      batch.resumableCount += 1;
      batch.resumableEstimateMicroUsd += estimateOf(
        documents.get(row.id) ?? [],
      ).estimatedCostMicroUsd;
    }
    batches.set(row.batchId, batch);
  }
  return [...batches.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The open extractions of a batch in review order. Another user's batch id, or an unknown one,
 * gives an empty list.
 */
export async function listBatchExtractions(
  db: Db,
  userId: string,
  batchId: string,
): Promise<BatchExtractionRow[]> {
  const rows = await extractionsRepository.listExtractionsOfBatch(db, userId, batchId);
  const documents = documentsByExtraction(
    await documentsRepository.listDocumentsOfExtractions(
      db,
      userId,
      rows.map((row) => row.id),
    ),
  );
  return rows
    .flatMap((row): BatchExtractionRow[] => {
      const status = row.status;
      if (!isOpenStatus(status)) return [];
      const own = documents.get(row.id) ?? [];
      const canRun = status === 'queued' || status === 'failed';
      return [
        {
          id: row.id,
          status,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
          fileLabel: fileLabelOf(own),
          periodStart: extractedPeriodStart(row.resultJson),
          createdAt: row.createdAt,
          startedAt: row.startedAt,
          estimatedCostMicroUsd: canRun ? estimateOf(own).estimatedCostMicroUsd : null,
        },
      ];
    })
    .sort(compareForReview);
}

/** The next bill of the batch waiting for its review, after the one just confirmed. */
export async function nextExtractionToReview(
  db: Db,
  userId: string,
  { batchId, afterExtractionId }: { batchId: string; afterExtractionId: string },
): Promise<string | null> {
  const rows = await listBatchExtractions(db, userId, batchId);
  const next = rows.find((row) => row.status === 'extracted' && row.id !== afterExtractionId);
  return next?.id ?? null;
}

export interface ImportSupply {
  id: string;
  kind: SupplyKind;
  label: string;
  houseName: string;
  archived: boolean;
}

/**
 * Every supply a batch may be assigned to, archived ones too (past bills often belong to a
 * closed supply): active first, then archived, each by house name and label.
 */
export async function listImportSupplies(db: Db, userId: string): Promise<ImportSupply[]> {
  const supplies = await suppliesRepository.listSupplies(db, userId, { includeArchived: true });
  const houses = await housesRepository.listHouses(db, userId);
  const houseNameById = new Map(houses.map((house) => [house.id, house.name]));
  return supplies
    .map((supply) => ({
      id: supply.id,
      kind: supply.kind,
      label: supply.label,
      houseName: houseNameById.get(supply.houseId) ?? '',
      archived: supply.archivedAt !== null,
    }))
    .sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) ||
        a.houseName.localeCompare(b.houseName, 'it') ||
        a.label.localeCompare(b.label, 'it'),
    );
}

/** The badge on «Bollette». */
export async function countExtractedToReview(db: Db, userId: string): Promise<number> {
  return (await extractionsRepository.listExtractions(db, userId, { statuses: ['extracted'] }))
    .length;
}

/**
 * What the month's extractions cost: every attempt of an extraction counts in the Rome month of
 * its last start.
 */
export async function monthlyExtractionSpend(
  db: Db,
  userId: string,
  month: MonthKey,
): Promise<{ costMicroUsd: number; count: number }> {
  const rows = await extractionsRepository.listExtractions(db, userId);
  let cost = 0;
  let count = 0;
  for (const row of rows) {
    if (row.startedAt === null || romeToday(row.startedAt).slice(0, 7) !== month) continue;
    cost += row.costMicroUsd ?? 0;
    count += 1;
  }
  return { costMicroUsd: cost, count };
}

export async function listBillDocuments(
  db: Db,
  userId: string,
  billId: string,
): Promise<
  Array<{
    id: string;
    contentType: DocumentContentType;
    pageCount: number | null;
    position: number;
  }>
> {
  const bill = await billsRepository.getBill(db, userId, billId);
  if (!bill) throw new DomainError('NOT_FOUND');
  const documents = await documentsRepository.listDocumentsOfBill(db, userId, billId);
  return documents
    .filter((document) => document.uploadedAt !== null)
    .map(({ id, contentType, pageCount, position }) => ({ id, contentType, pageCount, position }));
}

export async function readDocumentFile(
  db: Db,
  userId: string,
  documentId: string,
  deps: { blob: BlobStore },
): Promise<{ bytes: Uint8Array; contentType: DocumentContentType }> {
  const document = await documentsRepository.getDocument(db, userId, documentId);
  if (!document || document.uploadedAt === null) throw new DomainError('NOT_FOUND');
  const bytes = await deps.blob.readDocument(document.pathname);
  if (!bytes) throw new DomainError('NOT_FOUND');
  return { bytes, contentType: document.contentType };
}

/**
 * An upload token is given only for the user's own document still waiting for its file, at
 * exactly its pathname: an attachment of a bill, or a file of an extraction being uploaded.
 */
export async function authorizeDocumentUpload(
  db: Db,
  userId: string,
  documentId: string,
  pathname: string,
): Promise<{ contentType: DocumentContentType }> {
  const document = await documentsRepository.getPendingDocument(db, userId, documentId, pathname);
  if (!document) throw new DomainError('NOT_FOUND');
  if (document.billId === null) {
    const extraction =
      document.extractionId === null
        ? null
        : await extractionsRepository.getExtraction(db, userId, document.extractionId);
    if (extraction?.status !== 'uploading') throw new DomainError('NOT_FOUND');
  }
  return { contentType: document.contentType };
}
