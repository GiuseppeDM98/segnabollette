import { describe, expect, it } from 'vitest';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import {
  billInput,
  createHouseWithSupply,
  expectDomainError,
  snapshotUserRows,
} from '@/lib/db/testing/fixtures';
import { fixtureBytes, fixtureFile } from '@/lib/extraction/testing/fixture-bills';
import {
  fakeExtractor,
  runFixture,
  tempBlobStore,
  uploadFixture,
} from '@/lib/extraction/testing/upload-fixture';
import { confirmBill } from './bills';
import {
  authorizeDocumentUpload,
  confirmExtraction,
  countExtractedToReview,
  createAttachment,
  createExtraction,
  discardExtraction,
  getExtractionReview,
  listBillDocuments,
  listPendingExtractions,
  markAttachmentUploaded,
  markExtractionUploaded,
  monthlyExtractionSpend,
  readDocumentFile,
  runExtraction,
} from './extractions';

const NOW = Date.parse('2026-10-25T10:00:00Z');
const MONTH = '2026-10';

/**
 * Two users with a house and an electricity supply each. A has: an extracted bill waiting for
 * review, a queued one, a bill with an attachment never uploaded and one with a linked document.
 */
async function setup() {
  const { db } = await createTestDb();
  const blob = tempBlobStore();
  const a = { db, blob, userId: (await createTestUser(db)).id };
  const b = { db, blob, userId: (await createTestUser(db)).id };
  const ofA = await createHouseWithSupply(db, a.userId, { identifier: 'IT001E00000011' });
  const ofB = await createHouseWithSupply(db, b.userId, { identifier: 'IT001E00000011' });

  const extracted = await uploadFixture(a, 'luce-pellicano.pdf', { now: NOW });
  await runFixture(a, extracted.extractionId, { now: NOW });
  const queued = await uploadFixture(a, 'gas-pellicano.pdf', { now: NOW });

  const { billId } = await confirmBill(db, a.userId, billInput(ofA.supplyId), {
    source: 'manual',
  });
  const attachment = await createAttachment(db, a.userId, {
    billId,
    files: [fixtureFile('acqua-castoro.pdf')],
  });
  const [pending] = attachment.documents;
  if (!pending) throw new Error('no planned attachment');
  await blob.writeDocument(pending.pathname, fixtureBytes('acqua-castoro.pdf'));

  const [stored] = queued.documents;
  if (!stored) throw new Error('no stored document');
  return {
    db,
    blob,
    a,
    b,
    ofA,
    ofB,
    billId,
    pending,
    storedDocumentId: stored.documentId,
    extractedId: extracted.extractionId,
    queuedId: queued.extractionId,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** B's call fails with NOT_FOUND and leaves every row of A as it was. */
async function expectHidden(ctx: Ctx, attempt: Promise<unknown>) {
  const before = await snapshotUserRows(ctx.db, ctx.a.userId);
  await expectDomainError(attempt, 'NOT_FOUND');
  expect(await snapshotUserRows(ctx.db, ctx.a.userId)).toEqual(before);
}

describe('extractions — isolation between users', () => {
  it('createExtraction: only on own supplies', async () => {
    const ctx = await setup();
    const files = [fixtureFile('internet-armadillo.pdf')];
    const deps = { blob: ctx.blob, now: NOW };

    await expectHidden(
      ctx,
      createExtraction(
        ctx.db,
        ctx.b.userId,
        { supplyId: ctx.ofA.supplyId, batchId: null, files },
        deps,
      ),
    );
    await expect(
      createExtraction(
        ctx.db,
        ctx.a.userId,
        { supplyId: ctx.ofA.supplyId, batchId: null, files },
        deps,
      ),
    ).resolves.toHaveProperty('extractionId');
  });

  it('createAttachment: only on own bills', async () => {
    const ctx = await setup();
    const input = { billId: ctx.billId, files: [fixtureFile('internet-armadillo.pdf')] };

    await expectHidden(ctx, createAttachment(ctx.db, ctx.b.userId, input));
    await expect(createAttachment(ctx.db, ctx.a.userId, input)).resolves.toHaveProperty(
      'documents',
    );
  });

  it('markAttachmentUploaded: only own documents', async () => {
    const ctx = await setup();
    const ids = [ctx.pending.documentId];
    const deps = { blob: ctx.blob, now: NOW };

    await expectHidden(ctx, markAttachmentUploaded(ctx.db, ctx.b.userId, ctx.billId, ids, deps));
    await expect(
      markAttachmentUploaded(ctx.db, ctx.a.userId, ctx.billId, ids, deps),
    ).resolves.toBeUndefined();
  });

  it('markExtractionUploaded: only own extractions', async () => {
    const ctx = await setup();
    const deps = { blob: ctx.blob, now: NOW };
    // An upload of A whose file has arrived but is not verified yet.
    const uploading = await createExtraction(
      ctx.db,
      ctx.a.userId,
      { supplyId: null, batchId: null, files: [fixtureFile('internet-armadillo.pdf')] },
      deps,
    );
    if (!('extractionId' in uploading)) throw new Error('expected a new extraction');
    for (const document of uploading.documents) {
      await ctx.blob.writeDocument(document.pathname, fixtureBytes('internet-armadillo.pdf'));
    }
    const id = uploading.extractionId;

    await expectHidden(ctx, markExtractionUploaded(ctx.db, ctx.b.userId, id, deps));
    await expect(markExtractionUploaded(ctx.db, ctx.a.userId, id, deps)).resolves.toHaveProperty(
      'estimatedCostMicroUsd',
    );
  });

  it('runExtraction: only own extractions', async () => {
    const ctx = await setup();
    const deps = { blob: ctx.blob, extractor: fakeExtractor, now: NOW, clock: () => NOW };

    await expectHidden(ctx, runExtraction(ctx.db, ctx.b.userId, ctx.queuedId, deps));
    await expect(runExtraction(ctx.db, ctx.a.userId, ctx.queuedId, deps)).resolves.toMatchObject({
      status: 'extracted',
    });
  });

  it('getExtractionReview: only own extractions', async () => {
    const ctx = await setup();

    await expectHidden(ctx, getExtractionReview(ctx.db, ctx.b.userId, ctx.extractedId));
    await expect(
      getExtractionReview(ctx.db, ctx.a.userId, ctx.extractedId),
    ).resolves.toHaveProperty('draft');
  });

  it('confirmExtraction: own extraction, own house for a new supply, own supply', async () => {
    const ctx = await setup();
    const { draft } = await getExtractionReview(ctx.db, ctx.a.userId, ctx.extractedId);
    // B gets an extraction of its own, to try A's house and A's supply with it.
    const ofB = await uploadFixture(ctx.b, 'luce-pellicano.pdf', { now: NOW });
    await runFixture(ctx.b, ofB.extractionId, { now: NOW });
    const newSupply = {
      houseId: ctx.ofA.houseId,
      kind: 'electricity' as const,
      label: 'Luce',
      supplierName: null,
      identifier: null,
      hasPhotovoltaic: false,
    };

    await expectHidden(
      ctx,
      confirmExtraction(ctx.db, ctx.b.userId, ctx.extractedId, {
        input: draft.input,
        newSupply: null,
      }),
    );
    await expectHidden(
      ctx,
      confirmExtraction(ctx.db, ctx.b.userId, ofB.extractionId, {
        input: { ...draft.input, supplyId: 'nuova' },
        newSupply,
      }),
    );
    await expectHidden(
      ctx,
      confirmExtraction(ctx.db, ctx.b.userId, ofB.extractionId, {
        input: { ...draft.input, supplyId: ctx.ofA.supplyId },
        newSupply: null,
      }),
    );
    await expect(
      confirmExtraction(ctx.db, ctx.a.userId, ctx.extractedId, {
        input: draft.input,
        newSupply: null,
      }),
    ).resolves.toHaveProperty('billId');
  });

  it('discardExtraction: only own extractions', async () => {
    const ctx = await setup();
    const deps = { blob: ctx.blob, now: NOW };

    await expectHidden(ctx, discardExtraction(ctx.db, ctx.b.userId, ctx.queuedId, deps));
    await expect(
      discardExtraction(ctx.db, ctx.a.userId, ctx.queuedId, deps),
    ).resolves.toBeUndefined();
  });

  it('listBillDocuments: only own bills', async () => {
    const ctx = await setup();

    await expectHidden(ctx, listBillDocuments(ctx.db, ctx.b.userId, ctx.billId));
    await expect(listBillDocuments(ctx.db, ctx.a.userId, ctx.billId)).resolves.toEqual([]);
  });

  it('readDocumentFile: only own documents', async () => {
    const ctx = await setup();
    const deps = { blob: ctx.blob };

    await expectHidden(ctx, readDocumentFile(ctx.db, ctx.b.userId, ctx.storedDocumentId, deps));
    await expect(
      readDocumentFile(ctx.db, ctx.a.userId, ctx.storedDocumentId, deps),
    ).resolves.toMatchObject({ contentType: 'application/pdf' });
  });

  it('authorizeDocumentUpload: only own pending documents', async () => {
    const ctx = await setup();
    const { documentId, pathname } = ctx.pending;

    await expectHidden(ctx, authorizeDocumentUpload(ctx.db, ctx.b.userId, documentId, pathname));
    await expect(
      authorizeDocumentUpload(ctx.db, ctx.a.userId, documentId, pathname),
    ).resolves.toEqual({
      contentType: 'application/pdf',
    });
  });

  it("counts none of A's extractions for B", async () => {
    const ctx = await setup();

    expect(await listPendingExtractions(ctx.db, ctx.b.userId)).toEqual([]);
    expect(await countExtractedToReview(ctx.db, ctx.b.userId)).toBe(0);
    expect(await monthlyExtractionSpend(ctx.db, ctx.b.userId, MONTH)).toEqual({
      costMicroUsd: 0,
      count: 0,
    });
    expect(await countExtractedToReview(ctx.db, ctx.a.userId)).toBe(1);
  });
});
