import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysInclusive,
  eachMonthOverlap,
  isIsoDate,
  monthRange,
  romeToday,
} from './dates';

describe('calendar dates', () => {
  it('counts the days across the spring daylight-saving change', () => {
    expect(daysInclusive('2026-03-28', '2026-03-30')).toBe(3);
  });

  it('adds one day on both daylight-saving change days of 2026', () => {
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('splits an interval into the days of each month it touches', () => {
    expect(eachMonthOverlap('2026-01-20', '2026-03-05')).toEqual([
      { month: '2026-01', days: 12 },
      { month: '2026-02', days: 28 },
      { month: '2026-03', days: 5 },
    ]);
  });

  it('lists every month of a range across the new year', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('gives the Rome calendar day of an instant late in the UTC evening', () => {
    expect(romeToday(Date.parse('2026-03-31T22:30:00Z'))).toBe('2026-04-01');
  });

  it('rejects a day that does not exist', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
  });
});
