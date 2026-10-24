/**
 * Calendar-day arithmetic on 'YYYY-MM-DD' strings, done at UTC midnight so that daylight saving
 * never makes a 23- or 25-hour day. Only romeToday touches a real instant and a time zone.
 */
import type { IsoDate, MonthKey } from './types';

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export function parseIsoDate(value: IsoDate): number {
  if (!isIsoDate(value)) throw new RangeError(`Not a calendar date: ${value}`);
  return Date.parse(`${value}T00:00:00Z`);
}

function toIsoDate(utcMs: number): IsoDate {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(parseIsoDate(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` comes first). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / DAY_MS);
}

/** Days in the closed interval [start, end]; 0 when end precedes start. */
export function daysInclusive(start: IsoDate, end: IsoDate): number {
  return Math.max(0, daysBetween(start, end) + 1);
}

export function monthKeyOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

function monthParts(month: MonthKey): [number, number] {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) throw new RangeError(`Not a month: ${month}`);
  return [year, mon];
}

export function daysInMonth(month: MonthKey): number {
  const [year, mon] = monthParts(month);
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

export function monthStart(month: MonthKey): IsoDate {
  return `${month}-01`;
}

export function monthEnd(month: MonthKey): IsoDate {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, mon] = monthParts(month);
  return new Date(Date.UTC(year, mon - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Every month from `from` to `to`, both included ('YYYY-MM' compares correctly as a string). */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  for (let month = from; month <= to; month = shiftMonth(month, 1)) months.push(month);
  return months;
}

/** The months a closed day interval touches, with the number of its days in each. */
export function eachMonthOverlap(
  start: IsoDate,
  end: IsoDate,
): Array<{ month: MonthKey; days: number }> {
  if (end < start) return [];
  const overlaps: Array<{ month: MonthKey; days: number }> = [];
  for (let month = monthKeyOf(start); month <= monthKeyOf(end); month = shiftMonth(month, 1)) {
    const from = start > monthStart(month) ? start : monthStart(month);
    const to = end < monthEnd(month) ? end : monthEnd(month);
    overlaps.push({ month, days: daysInclusive(from, to) });
  }
  return overlaps;
}

// 'en-CA' formats a date as YYYY-MM-DD; the Intl database owns Italy's DST rules.
const romeDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar day in Rome at an instant; pages pass Date.now(), pure code never reads the clock. */
export function romeToday(nowMs: number): IsoDate {
  return romeDateFormatter.format(new Date(nowMs));
}
