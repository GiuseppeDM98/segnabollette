import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { createAnthropicExtractor } from './anthropic-extractor';
import type { ExtractorInput } from './extractor';
import { fixtureBytes, fixtureExtraction } from './testing/fixture-bills';

const NOW = 1_000_000_000_000;
const USAGE = { input_tokens: 12_000, output_tokens: 6_000 };

interface Call {
  params: Record<string, unknown>;
  options: Record<string, unknown>;
}

/** A client whose stream records its two arguments and ends as `finalMessage` says. */
function fakeClient(finalMessage: () => Promise<unknown>) {
  const calls: Call[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.push({ params, options });
          return { finalMessage };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

function message(fields: { stop_reason: string; text: string; stop_details?: unknown }) {
  return async () => ({
    model: 'claude-opus-5-5',
    usage: USAGE,
    stop_details: fields.stop_details ?? null,
    stop_reason: fields.stop_reason,
    content: [{ type: 'text', text: fields.text }],
  });
}

function input(deadlineMs = NOW + 280_000): ExtractorInput {
  return {
    documents: [{ contentType: 'application/pdf', bytes: fixtureBytes('luce-pellicano.pdf') }],
    today: '2026-10-25',
    expectedKind: null,
    deadlineMs,
  };
}

function extractorWith(finalMessage: () => Promise<unknown>) {
  const { client, calls } = fakeClient(finalMessage);
  const extractor = createAnthropicExtractor({ apiKey: 'unused', clock: () => NOW, client });
  return { extractor, calls };
}

const VALID_JSON = JSON.stringify(fixtureExtraction('luce-pellicano.pdf'));

describe('createAnthropicExtractor', () => {
  it('asks exactly for the documented call', async () => {
    const { extractor, calls } = extractorWith(
      message({ stop_reason: 'end_turn', text: VALID_JSON }),
    );

    await extractor.extract(input());

    const [call] = calls;
    if (!call) throw new Error('stream was not called');
    const { params, options } = call;
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.max_tokens).toBe(32_000);
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.fallbacks).toBe('default');
    expect(params).not.toHaveProperty('temperature');
    const outputConfig = params.output_config as {
      effort: string;
      format: Record<string, unknown>;
    };
    expect(outputConfig.effort).toBe('high');
    expect(outputConfig.format).toHaveProperty('type');
    expect(outputConfig.format).toHaveProperty('schema');
    expect(outputConfig.format).not.toHaveProperty('parse');
    const [turn] = params.messages as Array<{ content: Array<{ type: string }> }>;
    expect(turn?.content.map((block) => block.type)).toEqual(['document', 'text']);
    expect(options.maxRetries).toBe(0);
    expect(options.timeout).toBe(280_000);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('reads a valid answer', async () => {
    const { extractor } = extractorWith(message({ stop_reason: 'end_turn', text: VALID_JSON }));

    const outcome = await extractor.extract(input());

    expect(outcome).toMatchObject({
      ok: true,
      model: 'claude-opus-5-5',
      usage: { inputTokens: 12_000, outputTokens: 6_000 },
    });
  });

  it('keeps the tokens of a refusal and names its category', async () => {
    const { extractor } = extractorWith(
      message({
        stop_reason: 'refusal',
        text: '',
        stop_details: { type: 'refusal', category: 'cyber' },
      }),
    );

    const outcome = await extractor.extract(input());

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('refusal');
    expect(outcome.message).toContain('(cyber)');
    expect(outcome.usage).toEqual({ inputTokens: 12_000, outputTokens: 6_000 });
  });

  it('keeps the tokens of an answer cut by max_tokens', async () => {
    const { extractor } = extractorWith(
      message({ stop_reason: 'max_tokens', text: VALID_JSON.slice(0, 200) }),
    );

    const outcome = await extractor.extract(input());

    expect(outcome).toMatchObject({ ok: false, code: 'truncated', usage: { inputTokens: 12_000 } });
  });

  it('refuses valid JSON that breaks the schema, with tokens and model', async () => {
    const { extractor } = extractorWith(
      message({ stop_reason: 'end_turn', text: JSON.stringify({ isBill: 'forse' }) }),
    );

    const outcome = await extractor.extract(input());

    expect(outcome).toMatchObject({
      ok: false,
      code: 'invalid_output',
      model: 'claude-opus-5-5',
      usage: { outputTokens: 6_000 },
    });
  });

  it('turns a rate limit into unavailable', async () => {
    const { extractor } = extractorWith(async () => {
      throw new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers());
    });

    await expect(extractor.extract(input())).resolves.toMatchObject({
      ok: false,
      code: 'unavailable',
      usage: null,
    });
  });

  it('turns the deadline abort into timeout', async () => {
    const { extractor } = extractorWith(async () => {
      throw new Anthropic.APIUserAbortError();
    });

    await expect(extractor.extract(input())).resolves.toMatchObject({ ok: false, code: 'timeout' });
  });

  it('turns a broken stream into unavailable', async () => {
    const { extractor } = extractorWith(async () => {
      throw new Anthropic.AnthropicError('stream ended without a message');
    });

    await expect(extractor.extract(input())).resolves.toMatchObject({
      ok: false,
      code: 'unavailable',
    });
  });

  it('does not call at all with ten seconds left', async () => {
    const { extractor, calls } = extractorWith(
      message({ stop_reason: 'end_turn', text: VALID_JSON }),
    );

    const outcome = await extractor.extract(input(NOW + 10_000));

    expect(outcome).toMatchObject({ ok: false, code: 'timeout', usage: null });
    expect(calls).toHaveLength(0);
  });
});
