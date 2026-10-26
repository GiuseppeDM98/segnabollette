/**
 * The contract between the extraction service and whoever reads the bill: Claude in production
 * (anthropic-extractor.ts), fixture files under Playwright and in tests (fake-extractor.ts).
 */
import type {
  DocumentContentType,
  ExtractionErrorCode,
  IsoDate,
  SupplyKind,
} from '@/lib/domain/types';
import type { Extraction } from './schema';

export interface ExtractorDocument {
  contentType: DocumentContentType;
  bytes: Uint8Array;
}

export interface ExtractorInput {
  documents: ExtractorDocument[];
  today: IsoDate;
  expectedKind: SupplyKind | null;
  /** Epoch ms by which the call must be over. */
  deadlineMs: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * A failure carries the tokens whenever the API returned them (a refusal, a truncated or invalid
 * answer are paid for); a broken connection or a timeout has none.
 */
export type ExtractorOutcome =
  | { ok: true; extraction: Extraction; usage: TokenUsage; model: string }
  | {
      ok: false;
      code: Exclude<ExtractionErrorCode, 'not_a_bill' | 'document_invalid'>;
      message: string;
      usage: TokenUsage | null;
      model: string | null;
    };

export interface BillExtractor {
  extract(input: ExtractorInput): Promise<ExtractorOutcome>;
}
