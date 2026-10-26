/**
 * Batches of a bulk import: the summaries of «Lotti in sospeso», the rows of one batch in review
 * order, the next bill to review, the supplies the importer offers, and the isolation pair.
 * Extractions and documents are written with the repositories, so each row gets exactly the state,
 * the pages and the creation instant the case needs.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { describe, expect, it } from 'vitest';
import { documentPathname } from '@/lib/blob/types';
import type { Db } from '@/lib/db/create-db';
import * as documentsRepository from '@/lib/db/repositories/documents';
import * as extractionsRepository from '@/lib/db/repositories/extractions';
import { extractions } from '@/lib/db/schema/app';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import { createHouseWithSupply, expectDomainError } from '@/lib/db/testing/fixtures';
import type {
  DocumentContentType,
  ExtractionErrorCode,
  ExtractionStatus,
  IsoDate,
} from '@/lib/domain/types';
import { estimateExtractionCost } from '@/lib/extraction/pricing';
import { fixtureExtraction, fixtureFile } from '@/lib/extraction/testing/fixture-bills';
import { tempBlobStore } from '@/lib/extraction/testing/upload-fixture';
import {
  createExtraction,
  listBatchExtractions,
  listBatches,
  listImportSupplies,
  nextExtractionToReview,
} from './extractions';
import { archiveSupply, createSupply } from './houses-supplies';

const NOW = Date.parse('2026-10-25T10:00:00Z');
const MINUTE = 60_000;
const BATCH = 'LottoDiProvaPelliCano';
const SECOND_BATCH = 'LottoDiProvaCastoro01';

interface Planted {
  status: ExtractionStatus;
  batchId: string;
  createdAt: number;
  errorCode?: ExtractionErrorCode;
  /** One document: a PDF with its pages, or a photo. */
  file?: { contentType: DocumentContentType; pageCount: number | null };
  periodStart?: IsoDate;
}

/** An extraction in exactly the given state, with its one document. */
async function plant(db: Db, userId: string, planted: Planted): Promise<string> {
  const id = nanoid();
  const documentId = nanoid();
  const file = planted.file ?? { contentType: 'application/pdf', pageCount: 1 };
  await extractionsRepository.insertExtractionQuery(db, userId, {
    id,
    supplyId: null,
    batchId: planted.batchId,
  });
  await documentsRepository.insertDocumentsQuery(db, userId, [
    {
      id: documentId,
      extractionId: id,
      billId: null,
      pathname: documentPathname(userId, documentId, file.contentType),
      contentType: file.contentType,
      sizeBytes: 1000,
      sha256: randomBytes(32).toString('hex'),
      position: 0,
    },
  ]);
  await documentsRepository.updateDocumentQuery(db, userId, documentId, {
    pageCount: file.pageCount,
    uploadedAt: planted.createdAt,
  });
  const resultJson =
    planted.status === 'extracted'
      ? JSON.stringify({
          ...fixtureExtraction('acqua-castoro.pdf'),
          periodStart: planted.periodStart ?? '',
        })
      : null;
  await extractionsRepository.updateExtractionQuery(db, userId, id, {
    status: planted.status,
    errorCode: planted.errorCode ?? null,
    errorMessage: planted.errorCode ? `Errore ${planted.errorCode}.` : null,
    resultJson,
  });
  await db.update(extractions).set({ createdAt: planted.createdAt }).where(eq(extractions.id, id));
  return id;
}

async function setup() {
  const { db } = await createTestDb();
  const a = await createTestUser(db);
  const b = await createTestUser(db);
  return { db, a: a.id, b: b.id };
}

/** A's first batch: two queued, two failed (one of them unavailable), one extracted. */
async function plantFirstBatch(db: Db, userId: string) {
  await plant(db, userId, {
    status: 'queued',
    batchId: BATCH,
    createdAt: NOW + 2 * MINUTE,
    file: { contentType: 'application/pdf', pageCount: 8 },
  });
  await plant(db, userId, {
    status: 'queued',
    batchId: BATCH,
    createdAt: NOW + 3 * MINUTE,
    file: { contentType: 'image/jpeg', pageCount: null },
  });
  await plant(db, userId, {
    status: 'failed',
    errorCode: 'unavailable',
    batchId: BATCH,
    createdAt: NOW + MINUTE,
    file: { contentType: 'application/pdf', pageCount: 2 },
  });
  await plant(db, userId, {
    status: 'failed',
    errorCode: 'invalid_output',
    batchId: BATCH,
    createdAt: NOW + 4 * MINUTE,
  });
  await plant(db, userId, {
    status: 'extracted',
    batchId: BATCH,
    createdAt: NOW + 5 * MINUTE,
    periodStart: '2026-08-01',
  });
}

/** A's second batch, created in this order: a queued, an extracted September, an extracted July. */
async function plantSecondBatch(db: Db, userId: string) {
  const queued = await plant(db, userId, {
    status: 'queued',
    batchId: SECOND_BATCH,
    createdAt: NOW + 10 * MINUTE,
  });
  const september = await plant(db, userId, {
    status: 'extracted',
    batchId: SECOND_BATCH,
    createdAt: NOW + 11 * MINUTE,
    periodStart: '2026-09-01',
  });
  const july = await plant(db, userId, {
    status: 'extracted',
    batchId: SECOND_BATCH,
    createdAt: NOW + 12 * MINUTE,
    periodStart: '2026-07-01',
  });
  return { queued, september, july };
}

describe('listBatches', () => {
  it('sums the open extractions of a batch and what resuming it would cost', async () => {
    const { db, a } = await setup();
    await plantFirstBatch(db, a);

    const [batch, ...others] = await listBatches(db, a);

    expect(others).toEqual([]);
    expect(batch).toEqual({
      batchId: BATCH,
      createdAt: NOW + MINUTE,
      counts: { queued: 2, running: 0, extracted: 1, failed: 2 },
      resumableCount: 3,
      resumableEstimateMicroUsd:
        estimateExtractionCost({ pdfPages: 8, photos: 0 }) +
        estimateExtractionCost({ pdfPages: 0, photos: 1 }) +
        estimateExtractionCost({ pdfPages: 2, photos: 0 }),
    });
  });

  it('leaves out batches with nothing open, newest first for the rest', async () => {
    const { db, a } = await setup();
    await plantFirstBatch(db, a);
    await plant(db, a, { status: 'uploading', batchId: 'SoloCaricamentiInCors', createdAt: NOW });
    await plant(db, a, { status: 'confirmed', batchId: 'SoloChiusiChiusiChius', createdAt: NOW });
    await plant(db, a, { status: 'discarded', batchId: 'SoloChiusiChiusiChius', createdAt: NOW });
    await plantSecondBatch(db, a);

    const batches = await listBatches(db, a);

    expect(batches.map((batch) => batch.batchId)).toEqual([SECOND_BATCH, BATCH]);
  });
});

describe('listBatchExtractions and nextExtractionToReview', () => {
  it('orders a batch by extracted period, the rows without one last', async () => {
    const { db, a } = await setup();
    const { queued, september, july } = await plantSecondBatch(db, a);

    const rows = await listBatchExtractions(db, a, SECOND_BATCH);

    expect(rows.map((row) => row.id)).toEqual([july, september, queued]);
    expect(rows.map((row) => row.periodStart)).toEqual(['2026-07-01', '2026-09-01', null]);
    expect(rows[2]).toMatchObject({
      status: 'queued',
      fileLabel: 'PDF, 1 pagina',
      estimatedCostMicroUsd: estimateExtractionCost({ pdfPages: 1, photos: 0 }),
    });
    expect(rows[0]?.estimatedCostMicroUsd).toBeNull();
  });

  it('names each file and estimates only what can still run', async () => {
    const { db, a } = await setup();
    await plantFirstBatch(db, a);

    const rows = await listBatchExtractions(db, a, BATCH);

    expect(rows.map((row) => [row.status, row.fileLabel])).toEqual([
      ['extracted', 'PDF, 1 pagina'],
      ['failed', 'PDF, 2 pagine'],
      ['queued', 'PDF, 8 pagine'],
      ['queued', 'Foto'],
      ['failed', 'PDF, 1 pagina'],
    ]);
  });

  it('goes to the oldest bill still waiting, then to the next one', async () => {
    const { db, a } = await setup();
    const { queued, september, july } = await plantSecondBatch(db, a);

    expect(
      await nextExtractionToReview(db, a, { batchId: SECOND_BATCH, afterExtractionId: queued }),
    ).toBe(july);
    expect(
      await nextExtractionToReview(db, a, { batchId: SECOND_BATCH, afterExtractionId: july }),
    ).toBe(september);
  });
});

describe('listImportSupplies', () => {
  it('lists the archived supplies too, last', async () => {
    const { db, a } = await setup();
    const { houseId, supplyId } = await createHouseWithSupply(db, a);
    await createSupply(db, a, {
      houseId,
      kind: 'gas',
      label: 'Gas',
      supplierName: null,
      identifier: null,
      hasPhotovoltaic: false,
    });
    await archiveSupply(db, a, supplyId, { archived: true, now: NOW });

    const supplies = await listImportSupplies(db, a);

    expect(supplies.map((supply) => [supply.label, supply.archived])).toEqual([
      ['Gas', false],
      ['Luce', true],
    ]);
    expect(supplies[1]).toMatchObject({
      id: supplyId,
      kind: 'electricity',
      houseName: 'Casa Pellicano',
    });
  });
});

describe('createExtraction with a batch', () => {
  it('refuses a batch id that is not a browser-made nanoid', async () => {
    const { db, a } = await setup();

    const error = await expectDomainError(
      createExtraction(
        db,
        a,
        { supplyId: null, batchId: 'lotto', files: [fixtureFile('luce-pellicano.pdf')] },
        { blob: tempBlobStore(), now: NOW },
      ),
      'VALIDATION',
    );

    expect(error.details).toEqual(['Identificativo del lotto non valido.']);
  });
});

describe('isolation of batches', () => {
  it('shows a batch only to its owner', async () => {
    const { db, a, b } = await setup();
    await createHouseWithSupply(db, a);
    const { queued, july } = await plantSecondBatch(db, a);

    expect(await listBatches(db, b)).toEqual([]);
    expect(await listBatchExtractions(db, b, SECOND_BATCH)).toEqual([]);
    expect(
      await nextExtractionToReview(db, b, { batchId: SECOND_BATCH, afterExtractionId: queued }),
    ).toBeNull();
    expect(await listImportSupplies(db, b)).toEqual([]);

    expect((await listBatches(db, a)).map((batch) => batch.batchId)).toEqual([SECOND_BATCH]);
    expect(await listBatchExtractions(db, a, SECOND_BATCH)).toHaveLength(3);
    expect(
      await nextExtractionToReview(db, a, { batchId: SECOND_BATCH, afterExtractionId: queued }),
    ).toBe(july);
    expect(await listImportSupplies(db, a)).toHaveLength(1);
  });
});
