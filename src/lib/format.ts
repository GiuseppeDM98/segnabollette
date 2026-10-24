/** The one place that formats and reads numbers and dates for people (Italian conventions). */
import type { ConsumptionUnit, IsoDate, MonthKey, QuantityUnit } from '@/lib/domain/types';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const unitPrice = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const quantity = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
const day = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const month = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});

export const UNIT_LABELS: Record<QuantityUnit, string> = {
  kWh: 'kWh',
  Smc: 'Smc',
  m3: 'm³',
  kW: 'kW',
  day: 'giorni',
  month: 'mesi',
  year: 'anni',
  unit: 'pz',
};

export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

export function formatUnitPrice(micros: number, unit: ConsumptionUnit): string {
  return `${unitPrice.format(micros / 1_000_000)} €/${UNIT_LABELS[unit]}`;
}

export function formatQuantity(value: number, unit: QuantityUnit): string {
  return `${quantity.format(value)} ${UNIT_LABELS[unit]}`;
}

export function formatDate(date: IsoDate): string {
  return day.format(new Date(`${date}T00:00:00Z`));
}

export function formatMonth(key: MonthKey): string {
  return month.format(new Date(`${key}-01T00:00:00Z`));
}

/**
 * Read a decimal typed the Italian way or the dotted way: '1.234,56' and '1234,56' and '1234.56'
 * are all 1234.56. With a comma present, dots are thousands separators; without one, a dot is the
 * decimal point. Returns null for anything that is not a finite number.
 */
export function parseDecimalInput(text: string): number | null {
  const compact = text.replace(/\s/g, '');
  if (compact === '') return null;
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
