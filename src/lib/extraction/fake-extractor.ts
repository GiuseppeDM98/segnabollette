/**
 * The extractor of Playwright and of the tests: it answers with the fixture extraction filed under
 * the SHA-256 of the first document (`<dir>/<sha256>.json`, written by `pnpm fixture:bills`).
 * Photos made on the fly in a test have no known SHA, so a JPEG falls back to photo-default.json.
 * A fixture `{ "fail": "<code>" }` produces that failure (the «Riprova» test) at once; every other
 * answer comes after `delayMs`, so a test can catch a run while it is still going.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BillExtractor, ExtractorOutcome } from './extractor';
import { EXTRACTION_MODEL } from './pricing';
import { ExtractionSchema } from './schema';

const FAKE_USAGE = { inputTokens: 10_000, outputTokens: 5_000 };
const FAILURE_CODES = [
  'refusal',
  'truncated',
  'invalid_output',
  'unavailable',
  'api_error',
  'timeout',
] as const;
type FakeFailureCode = (typeof FAILURE_CODES)[number];

function isFailureCode(value: unknown): value is FakeFailureCode {
  return typeof value === 'string' && (FAILURE_CODES as readonly string[]).includes(value);
}

export function createFakeExtractor(
  dir: string,
  options: { delayMs: number } = { delayMs: 0 },
): BillExtractor {
  const wait = () =>
    options.delayMs > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, options.delayMs))
      : Promise.resolve();
  return {
    async extract(input): Promise<ExtractorOutcome> {
      const [first] = input.documents;
      const invalid: ExtractorOutcome = {
        ok: false,
        code: 'invalid_output',
        message: 'Nessuna estrazione di prova per questo file.',
        usage: FAKE_USAGE,
        model: EXTRACTION_MODEL,
      };
      if (!first) {
        await wait();
        return invalid;
      }
      const sha256 = createHash('sha256').update(first.bytes).digest('hex');
      let file = join(dir, `${sha256}.json`);
      if (!existsSync(file) && first.contentType === 'image/jpeg') {
        file = join(dir, 'photo-default.json');
      }
      if (!existsSync(file)) {
        await wait();
        return invalid;
      }
      const json: unknown = JSON.parse(await readFile(file, 'utf8'));
      if (typeof json === 'object' && json !== null && 'fail' in json) {
        const code = isFailureCode(json.fail) ? json.fail : 'invalid_output';
        return {
          ok: false,
          code,
          message: 'Errore simulato dell’estrazione di prova.',
          usage: null,
          model: null,
        };
      }
      await wait();
      const parsed = ExtractionSchema.safeParse(json);
      if (!parsed.success) return invalid;
      return { ok: true, extraction: parsed.data, usage: FAKE_USAGE, model: EXTRACTION_MODEL };
    },
  };
}
