/** The one place that formats and reads numbers and dates for people (Italian conventions). */
import type {
  ConsumptionUnit,
  IsoDate,
  LineCategory,
  LineComponent,
  MonthKey,
  QuantityUnit,
  ReadingRegister,
  SupplyKind,
} from '@/lib/domain/types';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const unitPrice = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const linePrice = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
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
const monthName = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', month: 'short' });

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
  return formatEuroValue(cents / 100);
}

/** An amount already in euros (the chart series); formatEuro takes cents. */
export function formatEuroValue(euroAmount: number): string {
  return euro.format(euroAmount);
}

export function formatUnitPrice(micros: number, unit: ConsumptionUnit): string {
  return formatUnitPriceValue(micros / 1_000_000, unit);
}

/** A unit price already in euros per unit (the chart series); formatUnitPrice takes micro-euros. */
export function formatUnitPriceValue(euroPerUnit: number, unit: ConsumptionUnit): string {
  return `${unitPrice.format(euroPerUnit)} €/${UNIT_LABELS[unit]}`;
}

/** "Per unit" reads in the singular: €/anno, not €/anni. */
const PER_UNIT_LABELS: Record<QuantityUnit, string> = {
  ...UNIT_LABELS,
  day: 'giorno',
  month: 'mese',
  year: 'anno',
};

/** A bill line's printed unit price, at the precision it was typed (up to micro-euros). */
export function formatLinePrice(micros: number, unit: QuantityUnit): string {
  return `${linePrice.format(micros / 1_000_000)} €/${PER_UNIT_LABELS[unit]}`;
}

const percent = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/** A change in percent with its sign and one decimal: '+10,0 %', '−4,5 %' (typographic minus). */
export function formatPercentChange(change: number): string {
  return `${percent.format(change).replace('-', '−')} %`;
}

const people = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

/** The people in a house: «1 persona», «4 persone»; an average «3,4 persone in media». */
export function formatPeople(count: number): string {
  if (Number.isInteger(count)) return count === 1 ? '1 persona' : `${count} persone`;
  return `${people.format(count)} persone in media`;
}

const usd = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** An extraction's cost, stored in micro-dollars: '0,31 $' (the symbol after, as Italians write). */
export function formatUsd(microUsd: number): string {
  return `${usd.format(microUsd / 1_000_000)} $`;
}

const fileSize = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

/** A file's size as a person reads it: '340 kB', '1,2 MB'. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${fileSize.format(Math.max(1, Math.round(bytes / 1024)))} kB`;
  return `${fileSize.format(bytes / (1024 * 1024))} MB`;
}

export function formatQuantity(value: number, unit: QuantityUnit): string {
  return `${quantity.format(value)} ${UNIT_LABELS[unit]}`;
}

export function formatDate(date: IsoDate): string {
  return day.format(new Date(`${date}T00:00:00Z`));
}

const instant = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** An instant (epoch ms) as a day and time in Rome: '25/10/2026, 14:30'. */
export function formatInstant(ms: number): string {
  return instant.format(new Date(ms));
}

export function formatMonth(key: MonthKey): string {
  return month.format(new Date(`${key}-01T00:00:00Z`));
}

/** The month without its year, 1 to 12: «gen». */
export function formatMonthName(monthNumber: number): string {
  return monthName.format(new Date(Date.UTC(2000, monthNumber - 1, 1)));
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

/**
 * A number as a form field shows it: rounded to `maxFractionDigits` (the field's precision), then
 * the shortest text that reads back as the same number, with the Italian decimal comma and no
 * thousands separators or trailing zeros (1234.5 → '1234,5', 30/365 at 20 digits → itself).
 * `scale` is how many stored units make one shown unit (100 for cents and for VAT basis points,
 * 1_000_000 for micro-euros): the division happens here, so that the bill form never divides.
 */
export function formatDecimalInput(value: number, maxFractionDigits: number, scale = 1): string {
  return String(Number((value / scale).toFixed(maxFractionDigits))).replace('.', ',');
}

// WARNING: these maps follow the lists in src/lib/domain/types.ts; a new value there needs its
// label here (the Record types make the compiler say so).
export const CATEGORY_LABELS: Record<LineCategory, string> = {
  commodity: 'Materia prima',
  sale: 'Altre spese di vendita',
  network: 'Rete e contatore',
  system: 'Oneri di sistema',
  excise: 'Accise e imposte',
  vat: 'IVA',
  other: 'Altre partite',
  feed_in: 'Energia ceduta',
  outside: 'Fuori bolletta',
};

export const COMPONENT_LABELS: Record<LineComponent, string> = {
  variable: 'a consumo',
  fixed: 'fissa',
  power: 'a potenza',
  lump: 'importo unico',
};

/** A supply's name in lists: with more than one house, two «Luce» need their house to differ. */
export function formatSupplyLabel(label: string, houseName: string, houseCount: number): string {
  return houseCount > 1 ? `${label} · ${houseName}` : label;
}

export const KIND_LABELS: Record<SupplyKind, string> = {
  electricity: 'Luce',
  gas: 'Gas',
  water: 'Acqua',
  telecom: 'Internet e telefono',
  waste: 'TARI',
};

export const REGISTER_LABELS: Record<ReadingRegister, string> = {
  single: 'Lettura',
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  feed_in: 'Immessa',
  production: 'Produzione',
};

// Only the supply identifier is stored, never a customer code beyond it: for internet and the
// waste tax the field is optional and may stay empty.
export const IDENTIFIER_HINTS: Record<SupplyKind, string> = {
  electricity: 'POD (es. IT001E…)',
  gas: 'PDR (14 cifre)',
  water: 'Codice utenza',
  telecom: 'Numero di linea o codice cliente (facoltativo)',
  waste: 'Codice contribuente (facoltativo)',
};
