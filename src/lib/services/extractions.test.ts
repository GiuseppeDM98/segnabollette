import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/create-db';
import { bills, documents, extractions, supplies } from '@/lib/db/schema/app';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import { billInput, createHouseWithSupply, expectDomainError } from '@/lib/db/testing/fixtures';
import type { BillExtractor } from '@/lib/extraction/extractor';
import {
  type FixtureBill,
  fixtureBytes,
  fixtureExtraction,
  fixtureFile,
} from '@/lib/extraction/testing/fixture-bills';
import {
  FAKE_COST,
  fakeExtractor,
  okOutcome,
  runFixture,
  scriptedExtractor as scripted,
  TRUNCATED,
  tempBlobStore,
  FAKE_USAGE as USAGE,
  uploadFixture as upload,
} from '@/lib/extraction/testing/upload-fixture';
import { confirmBill, deleteBill } from './bills';
import {
  confirmExtraction,
  createAttachment,
  createExtraction,
  discardExtraction,
  getExtractionReview,
  listPendingExtractions,
  markAttachmentUploaded,
} from './extractions';
import { deleteAllUserData } from './user-data';

const NOW = Date.parse('2026-10-25T10:00:00Z');
const MINUTE = 60_000;

async function setup() {
  const { db } = await createTestDb();
  const user = await createTestUser(db);
  const { houseId, supplyId } = await createHouseWithSupply(db, user.id, {
    identifier: 'IT001E00000011',
  });
  return { db, userId: user.id, blob: tempBlobStore(), houseId, supplyId };
}

type Context = Awaited<ReturnType<typeof setup>>;

function uploadFixture(ctx: Context, name: FixtureBill) {
  return upload(ctx, name, { now: NOW });
}

function run(
  ctx: Context,
  extractionId: string,
  extractor: BillExtractor = fakeExtractor,
  now = NOW,
) {
  return runFixture(ctx, extractionId, { now, extractor });
}

async function extractionRow(db: Db, extractionId: string) {
  const [row] = await db.select().from(extractions).where(eq(extractions.id, extractionId));
  return row;
}

async function documentRows(db: Db, extractionId: string) {
  return db.select().from(documents).where(eq(documents.extractionId, extractionId));
}

describe('extraction lifecycle', () => {
  it('waits queued after the upload, then extracts once the owner runs it', async () => {
    const ctx = await setup();

    const { extractionId, estimate } = await uploadFixture(ctx, 'luce-pellicano.pdf');

    const queued = await extractionRow(ctx.db, extractionId);
    expect(queued).toMatchObject({ status: 'queued', startedAt: null, attempts: 0 });
    expect(estimate).toMatchObject({ pdfPages: 1, photos: 0 });
    expect(estimate.estimatedCostMicroUsd).toBeGreaterThan(0);

    const finished = await run(ctx, extractionId);

    expect(finished).toMatchObject({
      status: 'extracted',
      attempts: 1,
      model: 'claude-opus-5-5',
      inputTokens: 10_000,
      outputTokens: 5_000,
      costMicroUsd: FAKE_COST,
    });
  });

  it('lets only one of two concurrent runs call the extractor', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    const slow = scripted(
      [okOutcome('luce-pellicano.pdf')],
      () => new Promise((r) => setTimeout(r, 50)),
    );

    const results = await Promise.allSettled([
      run(ctx, extractionId, slow),
      run(ctx, extractionId, slow),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = results.filter((result) => result.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'EXTRACTION_BUSY' });
  });

  it('sums tokens and cost over a truncated run and its retry', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    const extractor = scripted([TRUNCATED, okOutcome('luce-pellicano.pdf')]);

    const failed = await run(ctx, extractionId, extractor);
    const retried = await run(ctx, extractionId, extractor, NOW + MINUTE);

    expect(failed).toMatchObject({ status: 'failed', errorCode: 'truncated' });
    expect(retried).toMatchObject({
      status: 'extracted',
      attempts: 2,
      inputTokens: 20_000,
      outputTokens: 10_000,
      costMicroUsd: 2 * FAKE_COST,
    });
  });

  it('throws away the result of a run discarded meanwhile, but keeps its cost', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    // Seven minutes after the claim the run counts as dead and can be discarded.
    const extractor = scripted([okOutcome('luce-pellicano.pdf')], () =>
      discardExtraction(ctx.db, ctx.userId, extractionId, {
        blob: ctx.blob,
        now: NOW + 7 * MINUTE,
      }),
    );

    const finished = await run(ctx, extractionId, extractor);

    expect(finished).toMatchObject({
      status: 'discarded',
      resultJson: null,
      costMicroUsd: FAKE_COST,
    });
  });

  it('refuses to discard a run younger than six minutes', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    let attempt: Promise<unknown> = Promise.resolve();
    const extractor = scripted([okOutcome('luce-pellicano.pdf')], async () => {
      attempt = discardExtraction(ctx.db, ctx.userId, extractionId, {
        blob: ctx.blob,
        now: NOW + MINUTE,
      });
      await attempt.catch(() => {});
    });

    await run(ctx, extractionId, extractor);

    await expectDomainError(attempt, 'EXTRACTION_BUSY');
  });

  it('discards an extraction with its documents and files', async () => {
    const ctx = await setup();
    const { extractionId, documents: planned } = await uploadFixture(ctx, 'luce-pellicano.pdf');

    await discardExtraction(ctx.db, ctx.userId, extractionId, { blob: ctx.blob, now: NOW });

    expect(await extractionRow(ctx.db, extractionId)).toMatchObject({ status: 'discarded' });
    expect(await documentRows(ctx.db, extractionId)).toEqual([]);
    expect(await ctx.blob.readDocument(planned[0]?.pathname ?? '')).toBeNull();
  });
});

describe('confirmExtraction', () => {
  it('creates the new supply and the bill, links the files and clears the result', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'acqua-castoro.pdf');
    await run(ctx, extractionId);
    const { draft } = await getExtractionReview(ctx.db, ctx.userId, extractionId);

    const { billId } = await confirmExtraction(ctx.db, ctx.userId, extractionId, {
      input: { ...draft.input, supplyId: 'nuova' },
      newSupply: {
        houseId: ctx.houseId,
        kind: 'water',
        label: 'Acqua',
        supplierName: 'Castoro Acque',
        identifier: '00011',
        hasPhotovoltaic: false,
      },
    });

    const [bill] = await ctx.db.select().from(bills).where(eq(bills.id, billId));
    const [supply] = await ctx.db
      .select()
      .from(supplies)
      .where(eq(supplies.id, bill?.supplyId ?? ''));
    expect(supply).toMatchObject({ kind: 'water', identifier: '00011' });
    expect(bill?.source).toBe('extraction');
    const linked = await documentRows(ctx.db, extractionId);
    expect(linked.every((document) => document.billId === billId)).toBe(true);
    expect(await extractionRow(ctx.db, extractionId)).toMatchObject({
      status: 'confirmed',
      billId,
      resultJson: null,
    });
  });

  it('creates an internet supply for an unrecognised utility', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'internet-armadillo.pdf');
    const other = { ...fixtureExtraction('internet-armadillo.pdf'), supplyKind: 'other' as const };
    await run(
      ctx,
      extractionId,
      scripted([{ ok: true, extraction: other, usage: USAGE, model: 'claude-opus-5-5' }]),
    );
    const { draft } = await getExtractionReview(ctx.db, ctx.userId, extractionId);

    const { billId } = await confirmExtraction(ctx.db, ctx.userId, extractionId, {
      input: { ...draft.input, supplyId: 'nuova' },
      newSupply: {
        houseId: ctx.houseId,
        kind: 'telecom',
        label: 'Internet',
        supplierName: null,
        identifier: null,
        hasPhotovoltaic: false,
      },
    });

    const [bill] = await ctx.db.select().from(bills).where(eq(bills.id, billId));
    const [supply] = await ctx.db
      .select()
      .from(supplies)
      .where(eq(supplies.id, bill?.supplyId ?? ''));
    expect(supply?.kind).toBe('telecom');
  });

  it('puts the extraction back when the bill overlaps without a decision', async () => {
    const ctx = await setup();
    await confirmBill(
      ctx.db,
      ctx.userId,
      billInput(ctx.supplyId, {}, { periodStart: '2024-09-01', periodEnd: '2024-09-30' }),
      { source: 'manual' },
    );
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    await run(ctx, extractionId);
    const { draft } = await getExtractionReview(ctx.db, ctx.userId, extractionId);

    await expectDomainError(
      confirmExtraction(ctx.db, ctx.userId, extractionId, { input: draft.input, newSupply: null }),
      'OVERLAP_DECISION_REQUIRED',
    );

    expect(await extractionRow(ctx.db, extractionId)).toMatchObject({ status: 'extracted' });
  });

  it('removes the new supply when the bill does not fit it', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    await run(ctx, extractionId);
    const { draft } = await getExtractionReview(ctx.db, ctx.userId, extractionId);
    const before = await ctx.db.select().from(supplies);

    // An electricity bill on a new gas supply: kWh and bands do not fit.
    await expectDomainError(
      confirmExtraction(ctx.db, ctx.userId, extractionId, {
        input: { ...draft.input, supplyId: 'nuova' },
        newSupply: {
          houseId: ctx.houseId,
          kind: 'gas',
          label: 'Gas',
          supplierName: null,
          identifier: null,
          hasPhotovoltaic: false,
        },
      }),
      'VALIDATION',
    );

    expect(await ctx.db.select().from(supplies)).toEqual(before);
    expect(await extractionRow(ctx.db, extractionId)).toMatchObject({ status: 'extracted' });
  });

  it('creates one bill when two confirmations race', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    await run(ctx, extractionId);
    const { draft } = await getExtractionReview(ctx.db, ctx.userId, extractionId);
    const confirm = () =>
      confirmExtraction(ctx.db, ctx.userId, extractionId, { input: draft.input, newSupply: null });

    const results = await Promise.allSettled([confirm(), confirm()]);

    expect(await ctx.db.select().from(bills)).toHaveLength(1);
    const [rejected] = results.filter((result) => result.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'EXTRACTION_BUSY' });
  });
});

describe('duplicates', () => {
  it('refuses a file already in a bill, naming the bill and its period', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    await run(ctx, extractionId);
    const { draft } = await getExtractionReview(ctx.db, ctx.userId, extractionId);
    const { billId } = await confirmExtraction(ctx.db, ctx.userId, extractionId, {
      input: draft.input,
      newSupply: null,
    });

    const error = await expectDomainError(
      createExtraction(
        ctx.db,
        ctx.userId,
        { supplyId: null, batchId: null, files: [fixtureFile('luce-pellicano.pdf')] },
        { blob: ctx.blob, now: NOW },
      ),
      'DUPLICATE_DOCUMENT',
    );
    expect(error.details).toEqual({ billId, periodStart: '2024-09-01', periodEnd: '2024-09-30' });
  });

  it('answers with the queued extraction and its estimate', async () => {
    const ctx = await setup();
    const { extractionId, estimate } = await uploadFixture(ctx, 'luce-pellicano.pdf');

    const answer = await createExtraction(
      ctx.db,
      ctx.userId,
      { supplyId: null, batchId: null, files: [fixtureFile('luce-pellicano.pdf')] },
      { blob: ctx.blob, now: NOW },
    );

    expect(answer).toEqual({
      duplicateOf: extractionId,
      duplicateStatus: 'queued',
      estimatedCostMicroUsd: estimate.estimatedCostMicroUsd,
    });
  });

  it('resumes the same interrupted upload on the same pathnames', async () => {
    const ctx = await setup();
    const input = { supplyId: null, batchId: null, files: [fixtureFile('gas-pellicano.pdf')] };
    const first = await createExtraction(ctx.db, ctx.userId, input, { blob: ctx.blob, now: NOW });
    if (!('extractionId' in first)) throw new Error('expected a new extraction');

    const again = await createExtraction(ctx.db, ctx.userId, input, { blob: ctx.blob, now: NOW });

    expect(again).toEqual({
      duplicateOf: first.extractionId,
      duplicateStatus: 'uploading',
      documents: first.documents,
    });
    expect(await ctx.db.select().from(extractions)).toHaveLength(1);
  });

  it('abandons an interrupted upload of another batch', async () => {
    const ctx = await setup();
    const files = [fixtureFile('gas-pellicano.pdf')];
    const first = await createExtraction(
      ctx.db,
      ctx.userId,
      { supplyId: null, batchId: 'lotto-1', files },
      { blob: ctx.blob, now: NOW },
    );
    if (!('extractionId' in first)) throw new Error('expected a new extraction');
    const oldPathname = first.documents[0]?.pathname ?? '';
    await ctx.blob.writeDocument(oldPathname, fixtureBytes('gas-pellicano.pdf'));

    const second = await createExtraction(
      ctx.db,
      ctx.userId,
      { supplyId: null, batchId: 'lotto-2', files },
      { blob: ctx.blob, now: NOW },
    );

    expect(second).toHaveProperty('extractionId');
    expect(await extractionRow(ctx.db, first.extractionId)).toBeUndefined();
    expect(await documentRows(ctx.db, first.extractionId)).toEqual([]);
    expect(await ctx.blob.readDocument(oldPathname)).toBeNull();
  });
});

describe('file checks', () => {
  async function expectRefused(
    ctx: Context,
    files: Parameters<typeof createExtraction>[2]['files'],
  ) {
    await expectDomainError(
      createExtraction(
        ctx.db,
        ctx.userId,
        { supplyId: null, batchId: null, files },
        {
          blob: ctx.blob,
          now: NOW,
        },
      ),
      'VALIDATION',
    );
  }

  const photo = (sha: string, sizeBytes: number) => ({
    sha256: sha.repeat(64).slice(0, 64),
    contentType: 'image/jpeg' as const,
    sizeBytes,
  });

  it('refuses the same photo twice', async () => {
    const ctx = await setup();
    await expectRefused(ctx, [photo('a', 1000), photo('a', 1000)]);
  });

  it('refuses a photo of 6 MB', async () => {
    const ctx = await setup();
    await expectRefused(ctx, [photo('b', 6 * 1024 * 1024)]);
  });

  it('refuses five photos of 4.5 MB (over 20 MB together)', async () => {
    const ctx = await setup();
    await expectRefused(
      ctx,
      ['1', '2', '3', '4', '5'].map((sha) => photo(sha, 4.5 * 1024 * 1024)),
    );
  });
});

describe('attachments', () => {
  async function billOf(ctx: Context) {
    const { billId } = await confirmBill(ctx.db, ctx.userId, billInput(ctx.supplyId), {
      source: 'manual',
    });
    return billId;
  }

  it('deletes the rows of an attachment whose bytes break the declared SHA-256', async () => {
    const ctx = await setup();
    const billId = await billOf(ctx);
    const { documents: planned } = await createAttachment(ctx.db, ctx.userId, {
      billId,
      files: [fixtureFile('luce-pellicano.pdf')],
    });
    const [document] = planned;
    if (!document) throw new Error('no planned document');
    await ctx.blob.writeDocument(document.pathname, fixtureBytes('gas-pellicano.pdf'));

    await expectDomainError(
      markAttachmentUploaded(ctx.db, ctx.userId, billId, [document.documentId], {
        blob: ctx.blob,
        now: NOW,
      }),
      'DOCUMENT_INVALID',
    );

    expect(await ctx.db.select().from(documents)).toEqual([]);
    expect(await ctx.blob.readDocument(document.pathname)).toBeNull();
  });

  it('resumes an interrupted attachment with the same document', async () => {
    const ctx = await setup();
    const billId = await billOf(ctx);
    const input = { billId, files: [fixtureFile('luce-pellicano.pdf')] };
    const first = await createAttachment(ctx.db, ctx.userId, input);

    const again = await createAttachment(ctx.db, ctx.userId, input);

    expect(again.documents).toEqual(first.documents);
  });

  it('lists the files of a deleted bill for the caller to remove', async () => {
    const ctx = await setup();
    const billId = await billOf(ctx);
    const { documents: planned } = await createAttachment(ctx.db, ctx.userId, {
      billId,
      files: [fixtureFile('luce-pellicano.pdf')],
    });

    const { documentPathnames } = await deleteBill(ctx.db, ctx.userId, billId);

    expect(documentPathnames).toEqual(planned.map((document) => document.pathname));
    expect(await ctx.db.select().from(documents)).toEqual([]);
  });
});

describe('listPendingExtractions', () => {
  it('estimates a queued eight-page PDF at 0.312 dollars', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    await ctx.db
      .update(documents)
      .set({ pageCount: 8 })
      .where(eq(documents.extractionId, extractionId));

    const [pending] = await listPendingExtractions(ctx.db, ctx.userId);

    expect(pending).toMatchObject({
      id: extractionId,
      status: 'queued',
      estimatedCostMicroUsd: 312_000,
    });
  });
});

describe('deleteAllUserData', () => {
  it('deletes documents and extractions with the rest', async () => {
    const ctx = await setup();
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf');
    await run(ctx, extractionId);
    const { draft } = await getExtractionReview(ctx.db, ctx.userId, extractionId);
    await confirmExtraction(ctx.db, ctx.userId, extractionId, {
      input: draft.input,
      newSupply: null,
    });
    await uploadFixture(ctx, 'gas-pellicano.pdf');

    await deleteAllUserData(ctx.db, ctx.userId);

    expect(await ctx.db.select().from(extractions)).toEqual([]);
    expect(await ctx.db.select().from(documents)).toEqual([]);
  });
});
