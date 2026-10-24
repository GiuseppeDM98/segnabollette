/**
 * The vocabulary of bills shared by the schema, the engine, the forms and the extraction.
 *
 * WARNING: a value added to one of these lists must also be handled in:
 * src/lib/engine/types.ts (emptyCosts) and src/lib/engine/supply-months.ts (cost buckets,
 * consumption units).
 */
export const SUPPLY_KINDS = ['electricity', 'gas', 'water', 'telecom', 'waste'] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];

export const METERED_KINDS = [
  'electricity',
  'gas',
  'water',
] as const satisfies readonly SupplyKind[];
export type MeteredKind = (typeof METERED_KINDS)[number];

export function isMetered(kind: SupplyKind): kind is MeteredKind {
  return (METERED_KINDS as readonly SupplyKind[]).includes(kind);
}

export type ConsumptionUnit = 'kWh' | 'Smc' | 'm3';
export type ReadingUnit = 'kWh' | 'm3';

export function consumptionUnitOf(kind: MeteredKind): ConsumptionUnit {
  return kind === 'electricity' ? 'kWh' : kind === 'gas' ? 'Smc' : 'm3';
}

/** Gas meters count cubic metres; the bill converts them to Smc with the coefficient C. */
export function readingUnitOf(kind: MeteredKind): ReadingUnit {
  return kind === 'electricity' ? 'kWh' : 'm3';
}

export const LINE_CATEGORIES = [
  'commodity',
  'sale',
  'network',
  'system',
  'excise',
  'vat',
  'other',
  'feed_in',
  'outside',
] as const;
export type LineCategory = (typeof LINE_CATEGORIES)[number];
export type CostCategory = Exclude<LineCategory, 'outside'>;
export const COST_CATEGORIES = LINE_CATEGORIES.filter((c): c is CostCategory => c !== 'outside');

export const LINE_COMPONENTS = ['variable', 'fixed', 'power', 'lump'] as const;
export type LineComponent = (typeof LINE_COMPONENTS)[number];

export const QUANTITY_UNITS = ['kWh', 'Smc', 'm3', 'kW', 'day', 'month', 'year', 'unit'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const BANDS = ['single', 'F1', 'F2', 'F3', 'F23'] as const;
export type Band = (typeof BANDS)[number];

export const READING_REGISTERS = ['single', 'F1', 'F2', 'F3', 'feed_in', 'production'] as const;
export type ReadingRegister = (typeof READING_REGISTERS)[number];

export const READING_SOURCES = ['bill_actual', 'bill_estimated', 'self'] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

export type BillStatus = 'confirmed' | 'replaced';
export type BillSource = 'manual' | 'extraction';

/** A calendar day, 'YYYY-MM-DD'. Periods, readings and due dates are days, not instants. */
export type IsoDate = string;
/** A calendar month, 'YYYY-MM'. */
export type MonthKey = string;

/** POD/PDR/utility codes are printed with varying spaces and dashes; compare them normalized. */
export function normalizeSupplyIdentifier(raw: string): string {
  return raw.replace(/[\s\-.]/g, '').toUpperCase();
}

export function allowedRegisters(kind: SupplyKind, hasPhotovoltaic: boolean): ReadingRegister[] {
  if (kind === 'electricity') {
    return hasPhotovoltaic
      ? ['single', 'F1', 'F2', 'F3', 'feed_in', 'production']
      : ['single', 'F1', 'F2', 'F3'];
  }
  return isMetered(kind) ? ['single'] : [];
}
