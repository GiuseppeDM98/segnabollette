import 'server-only';
import { createDiskBlobStore } from '@/lib/blob/disk-blob-store';
import type { BlobStore } from '@/lib/blob/types';
import { createVercelBlobStore } from '@/lib/blob/vercel-blob-store';
import { db } from '@/lib/db/client';
import type { Db } from '@/lib/db/create-db';
import { env } from '@/lib/env';
import { DomainError } from '@/lib/errors';
import { createAnthropicExtractor } from '@/lib/extraction/anthropic-extractor';
import type { BillExtractor } from '@/lib/extraction/extractor';
import { createFakeExtractor } from '@/lib/extraction/fake-extractor';

/** The app reaches its services only through here; Playwright swaps the external ones for fakes. */
export function getDb(): Db {
  return db;
}

export function getBlobStore(): BlobStore {
  if (env.E2E_FAKE_SERVICES) return createDiskBlobStore(env.E2E_BLOB_DIR);
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new DomainError(
      'EXTRACTION_UNAVAILABLE',
      'Archivio dei file non configurato su questa installazione.',
    );
  }
  return createVercelBlobStore(env.BLOB_READ_WRITE_TOKEN);
}

export function getBillExtractor(): BillExtractor {
  if (env.E2E_FAKE_SERVICES) {
    return createFakeExtractor('tests/fixtures/extractions', {
      delayMs: env.E2E_EXTRACTOR_DELAY_MS,
    });
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new DomainError(
      'EXTRACTION_UNAVAILABLE',
      'Estrazione non configurata su questa installazione.',
    );
  }
  return createAnthropicExtractor({ apiKey: env.ANTHROPIC_API_KEY, clock: () => Date.now() });
}

export function isExtractionConfigured(): boolean {
  return (
    env.E2E_FAKE_SERVICES || (Boolean(env.ANTHROPIC_API_KEY) && Boolean(env.BLOB_READ_WRITE_TOKEN))
  );
}

/** Files can be stored and read without the Anthropic key: attachments need only this. */
export function isBlobConfigured(): boolean {
  return env.E2E_FAKE_SERVICES || Boolean(env.BLOB_READ_WRITE_TOKEN);
}
