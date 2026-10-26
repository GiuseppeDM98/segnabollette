/**
 * The real extractor: one streamed call to Claude per bill, structured output, server-side
 * fallback on a policy refusal. No automatic retry: a failure is shown with "Riprova", so the
 * owner decides whether to spend again.
 *
 * The output format is passed without its `parse` function. With it, the SDK parses the text as
 * soon as the stream ends, before anyone looks at stop_reason: a refusal or an answer cut by
 * max_tokens would throw "Failed to parse structured output" and the tokens paid for would be lost.
 * So stop_reason is checked first, and the JSON is parsed and validated here.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BillExtractor, ExtractorDocument, ExtractorOutcome } from './extractor';
import { EXTRACTION_MODEL } from './pricing';
import { buildExtractionInstruction, EXTRACTION_SYSTEM_PROMPT } from './prompt';
import { type Extraction, ExtractionSchema } from './schema';

/** Below this, a call could not finish before the deadline: fail without spending. */
const MIN_CALL_MS = 30_000;

const { parse: _sdkParse, ...EXTRACTION_FORMAT } = betaZodOutputFormat(ExtractionSchema);

export function createAnthropicExtractor(options: {
  apiKey: string;
  clock: () => number;
  client?: Anthropic;
}): BillExtractor {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
  return {
    async extract(input): Promise<ExtractorOutcome> {
      const remainingMs = input.deadlineMs - options.clock();
      if (remainingMs < MIN_CALL_MS) {
        return {
          ok: false,
          code: 'timeout',
          message: 'Tempo scaduto prima della chiamata.',
          usage: null,
          model: null,
        };
      }
      try {
        const stream = client.beta.messages.stream(
          {
            model: EXTRACTION_MODEL,
            max_tokens: 32_000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system: EXTRACTION_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  ...input.documents.map(toContentBlock),
                  {
                    type: 'text',
                    text: buildExtractionInstruction({
                      today: input.today,
                      expectedKind: input.expectedKind,
                    }),
                  },
                ],
              },
            ],
            output_config: { effort: 'high', format: EXTRACTION_FORMAT },
          },
          // The SDK timeout only covers the wait for the response headers; the signal bounds the
          // whole stream.
          { timeout: remainingMs, maxRetries: 0, signal: AbortSignal.timeout(remainingMs) },
        );
        const message = await stream.finalMessage();
        const usage = {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        };
        const model = message.model;
        if (message.stop_reason === 'refusal') {
          const category = message.stop_details?.category ?? 'senza categoria';
          return {
            ok: false,
            code: 'refusal',
            message: `Il modello ha rifiutato la richiesta (${category}).`,
            usage,
            model,
          };
        }
        if (message.stop_reason === 'max_tokens') {
          return {
            ok: false,
            code: 'truncated',
            message: 'La risposta è stata troncata: bolletta troppo lunga.',
            usage,
            model,
          };
        }
        const text = message.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .join('');
        const extraction = parseExtraction(text);
        if (!extraction) {
          return {
            ok: false,
            code: 'invalid_output',
            message: 'Risposta del modello non conforme allo schema.',
            usage,
            model,
          };
        }
        return { ok: true, extraction, usage, model };
      } catch (error) {
        return toFailure(error);
      }
    },
  };
}

function parseExtraction(text: string): Extraction | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const result = ExtractionSchema.safeParse(json);
  return result.success ? result.data : null;
}

function toContentBlock(document: ExtractorDocument) {
  const data = Buffer.from(document.bytes).toString('base64');
  return document.contentType === 'application/pdf'
    ? ({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data },
      } as const)
    : ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } } as const);
}

function toFailure(error: unknown): ExtractorOutcome {
  const failure = (
    code: 'timeout' | 'unavailable' | 'api_error',
    message: string,
  ): ExtractorOutcome => ({ ok: false, code, message, usage: null, model: null });
  // First: the deadline signal aborts the stream with an APIUserAbortError, a subclass of APIError,
  // and the connection timeout is a subclass of APIConnectionError.
  if (
    error instanceof Anthropic.APIUserAbortError ||
    error instanceof Anthropic.APIConnectionTimeoutError
  ) {
    return failure('timeout', 'Il modello non ha risposto in tempo.');
  }
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return failure(
      'unavailable',
      'Il servizio di Anthropic non è disponibile ora: riprova più tardi.',
    );
  }
  if (error instanceof Anthropic.APIError) {
    return failure('api_error', `Errore dell'API (${error.status ?? 'senza stato'}).`);
  }
  // With the format passed without `parse`, a plain AnthropicError means the stream broke off.
  if (error instanceof Anthropic.AnthropicError) {
    return failure('unavailable', 'La risposta si è interrotta: riprova più tardi.');
  }
  throw error;
}
