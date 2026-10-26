/**
 * The synthetic bills of `pnpm fixture:bills` for the tests: their bytes, and the extraction filed
 * under their SHA-256 (the one the fake extractor answers with).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Extraction, ExtractionSchema } from '@/lib/extraction/schema';

export type FixtureBill =
  | 'luce-pellicano.pdf'
  | 'gas-pellicano.pdf'
  | 'acqua-castoro.pdf'
  | 'internet-armadillo.pdf'
  | 'luce-pellicano-rotta.pdf';

export const FIXTURE_EXTRACTIONS_DIR = 'tests/fixtures/extractions';

export function fixtureBytes(name: FixtureBill): Uint8Array {
  return new Uint8Array(readFileSync(join('tests/fixtures/bills', name)));
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** What the browser declares for a fixture PDF. */
export function fixtureFile(name: FixtureBill) {
  const bytes = fixtureBytes(name);
  return {
    sha256: sha256Of(bytes),
    contentType: 'application/pdf' as const,
    sizeBytes: bytes.length,
  };
}

export function fixtureExtraction(
  name: Exclude<FixtureBill, 'luce-pellicano-rotta.pdf'>,
): Extraction {
  const sha256 = sha256Of(fixtureBytes(name));
  const json: unknown = JSON.parse(
    readFileSync(join(FIXTURE_EXTRACTIONS_DIR, `${sha256}.json`), 'utf8'),
  );
  return ExtractionSchema.parse(json);
}
