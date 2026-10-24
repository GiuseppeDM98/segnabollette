import { describe, expect, it } from 'vitest';
import {
  formatDecimalInput,
  formatEuro,
  formatEuroValue,
  formatLinePrice,
  formatPercentChange,
  formatSupplyLabel,
  formatUnitPrice,
  formatUnitPriceValue,
  parseDecimalInput,
} from './format';

describe('parseDecimalInput', () => {
  it('reads dots as thousands separators when a comma is present', () => {
    expect(parseDecimalInput('1.234,56')).toBe(1234.56);
  });

  it('reads a lone dot as the decimal point', () => {
    expect(parseDecimalInput('1234.56')).toBe(1234.56);
  });

  it('reads a negative number with a decimal comma', () => {
    expect(parseDecimalInput('-3,5')).toBe(-3.5);
  });

  it('refuses text that is not a number, and empty text', () => {
    expect(parseDecimalInput('12a')).toBeNull();
    expect(parseDecimalInput('')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats cents as euros the Italian way', () => {
    const text = formatEuro(123456);

    expect(text.replace('.', '')).toContain('1234,56');
    expect(text).toContain('€');
  });

  it('formats a unit price with four decimals and its unit', () => {
    expect(formatUnitPrice(99_000, 'kWh')).toBe('0,0990 €/kWh');
  });

  it('formats an amount already in euros, not in cents', () => {
    const text = formatEuroValue(47.3);

    expect(text).toContain('47,30');
    expect(text).toContain('€');
  });

  it('formats a unit price already in euros per unit with four decimals', () => {
    expect(formatUnitPriceValue(0.1, 'kWh')).toBe('0,1000 €/kWh');
  });
});

describe('formatDecimalInput', () => {
  it('writes the shortest Italian text, without trailing zeros or thousands separators', () => {
    expect(formatDecimalInput(1234.5, 2)).toBe('1234,5');
    expect(formatDecimalInput(0.099, 6)).toBe('0,099');
    expect(formatDecimalInput(-1, 2)).toBe('-1');
    expect(formatDecimalInput(0.1, 20)).toBe('0,1');
  });

  it('reads back a pro-rata fraction exactly', () => {
    expect(parseDecimalInput(formatDecimalInput(30 / 365, 20))).toBe(30 / 365);
  });
});

describe('formatPercentChange', () => {
  it('writes the sign, one decimal and a typographic minus', () => {
    expect(formatPercentChange(10)).toBe('+10,0 %');
    expect(formatPercentChange(-4.54)).toBe('−4,5 %');
    expect(formatPercentChange(0)).toBe('0,0 %');
  });
});

describe('formatLinePrice', () => {
  it('keeps up to six decimals and at least two', () => {
    expect(formatLinePrice(99_123, 'kWh')).toBe('0,099123 €/kWh');
    expect(formatLinePrice(40_000_000, 'year')).toBe('40,00 €/anno');
  });
});

describe('formatSupplyLabel', () => {
  it('adds the house only when there is more than one', () => {
    expect(formatSupplyLabel('Luce', 'Casa Gamma', 1)).toBe('Luce');
    expect(formatSupplyLabel('Luce', 'Casa Gamma', 2)).toBe('Luce · Casa Gamma');
  });
});
