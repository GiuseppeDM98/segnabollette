/**
 * What an extraction costs, in micro-dollars (integers, like the money of the bills). The cost is
 * computed with the price of the model that actually answered: with the server-side fallback that
 * may not be the one asked for.
 */
export const EXTRACTION_MODEL = 'claude-opus-5-5';

/** List prices in USD per million tokens (platform.claude.com pricing, read 2026-10-24). */
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

/**
 * Tokens × USD per million tokens = micro-dollars. An unknown model is priced as claude-opus-5,
 * the dearest of the known fallbacks, so that it is never priced too low.
 */
export function costMicroUsd(
  usage: { inputTokens: number; outputTokens: number },
  model: string,
): number {
  const known = MODEL_PRICES[model];
  if (!known) console.warn(`costMicroUsd: no price for ${model}, priced as claude-opus-5`);
  const price = known ?? MODEL_PRICES['claude-opus-5'];
  if (!price) throw new Error('MODEL_PRICES must contain claude-opus-5');
  return Math.round(usage.inputTokens * price.input + usage.outputTokens * price.output);
}

/**
 * A cautious figure shown before or during an extraction: 3,000 input tokens per PDF page (text plus
 * the page image), 4,800 per photo (the high-resolution image tier), 4,000 of instructions, and
 * 10,000 output tokens.
 */
export function estimateExtractionCost(pages: { pdfPages: number; photos: number }): number {
  const inputTokens = pages.pdfPages * 3_000 + pages.photos * 4_800 + 4_000;
  return costMicroUsd({ inputTokens, outputTokens: 10_000 }, EXTRACTION_MODEL);
}
