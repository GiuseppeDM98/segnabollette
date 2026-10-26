import { describe, expect, it } from 'vitest';
import { createTestDb, createTestUser } from '@/lib/db/testing/create-test-db';
import { createHouseWithSupply } from '@/lib/db/testing/fixtures';
import type { FixtureBill } from '@/lib/extraction/testing/fixture-bills';
import {
  okOutcome,
  FAKE_COST as RUN_COST,
  runFixture,
  scriptedExtractor,
  TRUNCATED,
  tempBlobStore,
  uploadFixture,
} from '@/lib/extraction/testing/upload-fixture';
import { monthlyExtractionSpend } from './extractions';

/** Midnight between 30 September and 1 October 2026 in Rome (UTC+2). */
const ROME_OCTOBER_START = Date.parse('2026-09-30T22:00:00Z');
const MINUTE = 60_000;

async function setup() {
  const { db } = await createTestDb();
  const ctx = { db, blob: tempBlobStore(), userId: (await createTestUser(db)).id };
  await createHouseWithSupply(db, ctx.userId);
  return ctx;
}

describe('monthlyExtractionSpend', () => {
  it('counts each extraction in the Rome month of its start', async () => {
    const ctx = await setup();
    const runs: Array<[FixtureBill, number]> = [
      // 23:30 on 30 September in Rome, 21:30 UTC: September.
      ['luce-pellicano.pdf', ROME_OCTOBER_START - 30 * MINUTE],
      // 00:30 on 1 October in Rome, still 30 September in UTC: October.
      ['gas-pellicano.pdf', ROME_OCTOBER_START + 30 * MINUTE],
      ['acqua-castoro.pdf', ROME_OCTOBER_START + 10 * 24 * 60 * MINUTE],
    ];
    for (const [name, now] of runs) {
      const { extractionId } = await uploadFixture(ctx, name, { now });
      await runFixture(ctx, extractionId, { now });
    }

    expect(await monthlyExtractionSpend(ctx.db, ctx.userId, '2026-10')).toEqual({
      costMicroUsd: 2 * RUN_COST,
      count: 2,
    });
    expect(await monthlyExtractionSpend(ctx.db, ctx.userId, '2026-09')).toEqual({
      costMicroUsd: RUN_COST,
      count: 1,
    });
  });

  it('puts the whole cost of an extraction retried in October in October', async () => {
    const ctx = await setup();
    const september = ROME_OCTOBER_START - 60 * MINUTE;
    const extractor = scriptedExtractor([TRUNCATED, okOutcome('luce-pellicano.pdf')]);
    const { extractionId } = await uploadFixture(ctx, 'luce-pellicano.pdf', { now: september });
    await runFixture(ctx, extractionId, { now: september, extractor });

    await runFixture(ctx, extractionId, { now: ROME_OCTOBER_START + 60 * MINUTE, extractor });

    expect(await monthlyExtractionSpend(ctx.db, ctx.userId, '2026-09')).toEqual({
      costMicroUsd: 0,
      count: 0,
    });
    expect(await monthlyExtractionSpend(ctx.db, ctx.userId, '2026-10')).toEqual({
      costMicroUsd: 2 * RUN_COST,
      count: 1,
    });
  });
});
