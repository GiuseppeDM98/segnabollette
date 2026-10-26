/**
 * The upload path of the services for the tests: a disk file store in a temp folder, a fixture
 * written to it as the browser would, and a run with the fake extractor.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiskBlobStore, type DiskBlobStore } from '@/lib/blob/disk-blob-store';
import type { Db } from '@/lib/db/create-db';
import type { BillExtractor, ExtractorOutcome } from '@/lib/extraction/extractor';
import { createFakeExtractor } from '@/lib/extraction/fake-extractor';
import {
  createExtraction,
  markExtractionUploaded,
  runExtraction,
} from '@/lib/services/extractions';
import {
  FIXTURE_EXTRACTIONS_DIR,
  type FixtureBill,
  fixtureBytes,
  fixtureExtraction,
  fixtureFile,
} from './fixture-bills';

export const fakeExtractor = createFakeExtractor(FIXTURE_EXTRACTIONS_DIR);

/** The fake extractor's usage: 10,000 × 4 + 5,000 × 20 micro-dollars at Opus 5.5 prices. */
export const FAKE_USAGE = { inputTokens: 10_000, outputTokens: 5_000 };
export const FAKE_COST = 140_000;

/** An extractor that answers with the given outcomes in turn, after running `before`. */
export function scriptedExtractor(
  outcomes: ExtractorOutcome[],
  before?: () => Promise<void>,
): BillExtractor {
  let call = 0;
  return {
    async extract() {
      await before?.();
      const outcome = outcomes[Math.min(call, outcomes.length - 1)];
      call += 1;
      if (!outcome) throw new Error('scripted extractor without outcomes');
      return outcome;
    },
  };
}

export function okOutcome(
  name: Exclude<FixtureBill, 'luce-pellicano-rotta.pdf'>,
): ExtractorOutcome {
  return {
    ok: true,
    extraction: fixtureExtraction(name),
    usage: FAKE_USAGE,
    model: 'claude-opus-5-5',
  };
}

export const TRUNCATED: ExtractorOutcome = {
  ok: false,
  code: 'truncated',
  message: 'Risposta troncata.',
  usage: FAKE_USAGE,
  model: 'claude-opus-5-5',
};

export function tempBlobStore(): DiskBlobStore {
  return createDiskBlobStore(mkdtempSync(join(tmpdir(), 'segnabollette-blob-')));
}

export interface UploadContext {
  db: Db;
  userId: string;
  blob: DiskBlobStore;
}

/** Create, write the fixture's bytes, verify: the extraction ends queued. */
export async function uploadFixture(
  ctx: UploadContext,
  name: FixtureBill,
  options: { now: number; batchId?: string | null; supplyId?: string | null },
) {
  const created = await createExtraction(
    ctx.db,
    ctx.userId,
    {
      supplyId: options.supplyId ?? null,
      batchId: options.batchId ?? null,
      files: [fixtureFile(name)],
    },
    { blob: ctx.blob, now: options.now },
  );
  if (!('extractionId' in created)) throw new Error('expected a new extraction');
  for (const document of created.documents) {
    await ctx.blob.writeDocument(document.pathname, fixtureBytes(name));
  }
  const estimate = await markExtractionUploaded(ctx.db, ctx.userId, created.extractionId, {
    blob: ctx.blob,
    now: options.now,
  });
  return { extractionId: created.extractionId, documents: created.documents, estimate };
}

export function runFixture(
  ctx: UploadContext,
  extractionId: string,
  options: { now: number; extractor?: BillExtractor },
) {
  return runExtraction(ctx.db, ctx.userId, extractionId, {
    blob: ctx.blob,
    extractor: options.extractor ?? fakeExtractor,
    now: options.now,
    clock: () => options.now + 1000,
  });
}
