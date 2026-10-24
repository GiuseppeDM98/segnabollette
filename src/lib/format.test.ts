import { describe, expect, it } from 'vitest';
import { formatEuro, formatUnitPrice, parseDecimalInput } from './format';

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
});
