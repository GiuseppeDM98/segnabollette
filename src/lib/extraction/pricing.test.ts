import { describe, expect, it, vi } from 'vitest';
import { costMicroUsd, estimateExtractionCost } from './pricing';

describe('costMicroUsd', () => {
  it('prices a million input tokens of Opus 5.5 at 4 dollars', () => {
    expect(costMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, 'claude-opus-5-5')).toBe(
      4_000_000,
    );
  });

  it('prices output tokens at 20 dollars a million', () => {
    expect(costMicroUsd({ inputTokens: 0, outputTokens: 1_000_000 }, 'claude-opus-5-5')).toBe(
      20_000_000,
    );
  });

  it('prices an unknown model as claude-opus-5 and says so in the log', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const cost = costMicroUsd({ inputTokens: 1_000_000, outputTokens: 0 }, 'claude-futuro-9');

    expect(cost).toBe(5_000_000);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('estimateExtractionCost', () => {
  it('estimates an eight-page PDF at 0.312 dollars', () => {
    expect(estimateExtractionCost({ pdfPages: 8, photos: 0 })).toBe(312_000);
  });
});
