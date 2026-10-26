/**
 * The bill form edits a draft of strings, not a BillInput: a field must be able to hold what the
 * person is typing ('12,', '', '0,0990001') until they submit. draftFromInput writes numbers the
 * Italian way at the precision of each field; inputFromDraft reads them back, reports every field
 * error by path ('lines.3.amountCents', 'totalCents', 'readings.0.F1') and validates the
 * result with BillInputSchema. A pure module: the form, its tests and later the review use it.
 * Readings are drafted the way a bill prints them: one row per date, one value per register.
 */
import { type BillInput, BillInputSchema, type BillLineInput } from '@/lib/domain/bill-input';
import { centsFromEuro, microsFromEuro } from '@/lib/domain/money';
import { READING_REGISTERS, type ReadingRegister } from '@/lib/domain/types';
import { formatDecimalInput, parseDecimalInput } from '@/lib/format';

/** Field path → the message shown under that field. */
export type FieldErrors = Record<string, string>;

export type BillLineDraft = Omit<
  BillLineInput,
  'quantity' | 'unitPriceMicros' | 'amountCents' | 'vatRateBp'
> & {
  quantity: string;
  unitPriceMicros: string;
  amountCents: string;
  vatRateBp: string;
  /** True when the line has a period of its own (a recalculation), shown with its own dates. */
  hasOwnPeriod: boolean;
};

/** One date of the readings; an empty value means the bill prints nothing for that register. */
export interface BillReadingRowDraft {
  readOn: string;
  source: BillInput['readings'][number]['source'];
  values: Partial<Record<ReadingRegister, string>>;
}

export type BillDraft = Omit<
  BillInput,
  'totalCents' | 'amountDueCents' | 'conversionFactor' | 'calorificValueGj' | 'lines' | 'readings'
> & {
  totalCents: string;
  amountDueCents: string;
  conversionFactor: string;
  calorificValueGj: string;
  lines: BillLineDraft[];
  readings: BillReadingRowDraft[];
  /** The registers shown as columns, in READING_REGISTERS order. */
  readingRegisters: ReadingRegister[];
};

// Field precision: cents for amounts, micro-euros for unit prices, basis points for VAT. Quantities
// and readings are never rounded: a yearly fee pro rata (30/365) must come back identical.
const AMOUNT_DIGITS = 2;
const PRICE_DIGITS = 6;
const VAT_DIGITS = 2;
const EXACT_DIGITS = 20;

const AMOUNT_REQUIRED = 'Importo obbligatorio';
const TOTAL_REQUIRED = 'Totale obbligatorio';
const NOT_A_NUMBER = 'Numero non valido';
const tooManyDigits = (digits: number) => `Al massimo ${digits} decimali`;

function numberText(value: number | null, digits: number, scale = 1): string {
  return value === null ? '' : formatDecimalInput(value, digits, scale);
}

/** Registers in READING_REGISTERS order, each once. */
export function orderedRegisters(registers: Iterable<ReadingRegister>): ReadingRegister[] {
  const set = new Set(registers);
  return READING_REGISTERS.filter((register) => set.has(register));
}

/** The bill's readings grouped by date and type, in the order they come. */
function readingRows(readings: BillInput['readings']): BillReadingRowDraft[] {
  const rows = new Map<string, BillReadingRowDraft>();
  for (const reading of readings) {
    const key = `${reading.readOn}|${reading.source}`;
    const row = rows.get(key) ?? { readOn: reading.readOn, source: reading.source, values: {} };
    row.values[reading.register] = numberText(reading.value, EXACT_DIGITS);
    rows.set(key, row);
  }
  return [...rows.values()];
}

/**
 * defaultRegisters: the columns of a bill with no readings yet (the form knows the supply's kind).
 */
export function draftFromInput(
  input: BillInput,
  options: { blankAmounts?: boolean; defaultRegisters?: ReadingRegister[] } = {},
): BillDraft {
  const blank = options.blankAmounts === true;
  const used = orderedRegisters(input.readings.map((reading) => reading.register));
  return {
    ...input,
    totalCents: blank ? '' : numberText(input.totalCents, AMOUNT_DIGITS, 100),
    amountDueCents: numberText(input.amountDueCents, AMOUNT_DIGITS, 100),
    conversionFactor: numberText(input.conversionFactor, EXACT_DIGITS),
    calorificValueGj: numberText(input.calorificValueGj, EXACT_DIGITS),
    lines: input.lines.map((line) => ({
      ...line,
      quantity: numberText(line.quantity, EXACT_DIGITS),
      unitPriceMicros: numberText(line.unitPriceMicros, PRICE_DIGITS, 1_000_000),
      amountCents: blank ? '' : numberText(line.amountCents, AMOUNT_DIGITS, 100),
      vatRateBp: numberText(line.vatRateBp, VAT_DIGITS, 100),
      hasOwnPeriod: line.periodStart !== input.periodStart || line.periodEnd !== input.periodEnd,
    })),
    readings: readingRows(input.readings),
    readingRegisters: used.length > 0 ? used : (options.defaultRegisters ?? []),
  };
}

/** Digits after the decimal separator, read the way parseDecimalInput reads the text. */
function fractionDigits(text: string): number {
  const compact = text.replace(/\s/g, '');
  const separator = compact.includes(',') ? ',' : '.';
  const at = compact.lastIndexOf(separator);
  return at === -1 ? 0 : compact.length - at - 1;
}

/**
 * Reads one numeric field into `errors` under `path`. Empty text is null, or the `required`
 * message; `maxDigits` caps the decimals a person may type.
 */
function readNumber(
  text: string,
  path: string,
  errors: FieldErrors,
  rules: { required?: string; maxDigits?: number } = {},
): number | null {
  if (text.trim() === '') {
    if (rules.required) errors[path] = rules.required;
    return null;
  }
  const value = parseDecimalInput(text);
  if (value === null) {
    errors[path] = NOT_A_NUMBER;
    return null;
  }
  if (rules.maxDigits !== undefined && fractionDigits(text) > rules.maxDigits) {
    errors[path] = tooManyDigits(rules.maxDigits);
    return null;
  }
  return value;
}

function blankToNull(text: string | null): string | null {
  const value = text?.trim() ?? '';
  return value === '' ? null : value;
}

export function inputFromDraft(draft: BillDraft): { input?: BillInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const amount = { maxDigits: AMOUNT_DIGITS };
  const totalCents = centsFromEuro(
    readNumber(draft.totalCents, 'totalCents', errors, { ...amount, required: TOTAL_REQUIRED }),
  );
  const amountDueCents = centsFromEuro(
    readNumber(draft.amountDueCents, 'amountDueCents', errors, amount),
  );
  const conversionFactor = readNumber(draft.conversionFactor, 'conversionFactor', errors);
  const calorificValueGj = readNumber(draft.calorificValueGj, 'calorificValueGj', errors);

  const lines = draft.lines.map((line, index) => {
    const path = `lines.${index}`;
    const { hasOwnPeriod, ...fields } = line;
    return {
      ...fields,
      periodStart: hasOwnPeriod ? line.periodStart : draft.periodStart,
      periodEnd: hasOwnPeriod ? line.periodEnd : draft.periodEnd,
      quantity: readNumber(line.quantity, `${path}.quantity`, errors),
      unitPriceMicros: microsFromEuro(
        readNumber(line.unitPriceMicros, `${path}.unitPriceMicros`, errors, {
          maxDigits: PRICE_DIGITS,
        }),
      ),
      amountCents: centsFromEuro(
        readNumber(line.amountCents, `${path}.amountCents`, errors, {
          ...amount,
          required: AMOUNT_REQUIRED,
        }),
      ),
      vatRateBp: (() => {
        const percent = readNumber(line.vatRateBp, `${path}.vatRateBp`, errors);
        return percent === null ? null : Math.round(percent * 100);
      })(),
    };
  });
  // Each reading keeps the path of its cell and of its row, for the schema's errors below.
  const readings: Array<Omit<BillInput['readings'][number], 'value'> & { value: number | null }> =
    [];
  const readingPaths: Array<{ cell: string; row: string }> = [];
  for (const [index, row] of draft.readings.entries()) {
    for (const register of draft.readingRegisters) {
      const text = row.values[register] ?? '';
      if (text.trim() === '') continue;
      const cell = `readings.${index}.${register}`;
      readings.push({
        readOn: row.readOn,
        register,
        source: row.source,
        value: readNumber(text, cell, errors),
      });
      readingPaths.push({ cell, row: `readings.${index}` });
    }
  }
  if (Object.keys(errors).length > 0) return { errors };

  const parsed = BillInputSchema.safeParse({
    ...draft,
    supplierName: blankToNull(draft.supplierName),
    offerName: blankToNull(draft.offerName),
    totalCents,
    amountDueCents,
    conversionFactor,
    calorificValueGj,
    lines,
    readings,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [head, at, field] = issue.path;
      const reading = head === 'readings' && typeof at === 'number' ? readingPaths[at] : undefined;
      let path = issue.path.join('.');
      if (reading) path = field === 'value' ? reading.cell : `${reading.row}.${String(field)}`;
      errors[path] ??= issue.message;
    }
    return { errors };
  }
  return { input: parsed.data, errors };
}

/**
 * The figures the live summary works on while the person types: a field that is empty or not
 * yet a number counts as 0 (amounts) or as missing (quantities, prices), never as an error.
 */
export function draftFigures(
  draft: BillDraft,
): Pick<BillInput, 'totalCents' | 'amountDueCents' | 'lines'> {
  const lenient = (text: string) => (text.trim() === '' ? null : parseDecimalInput(text));
  return {
    totalCents: centsFromEuro(lenient(draft.totalCents)) ?? 0,
    amountDueCents: centsFromEuro(lenient(draft.amountDueCents)),
    lines: draft.lines.map((line) => {
      const { hasOwnPeriod: _hasOwnPeriod, ...fields } = line;
      return {
        ...fields,
        quantity: lenient(line.quantity),
        unitPriceMicros: microsFromEuro(lenient(line.unitPriceMicros)),
        amountCents: centsFromEuro(lenient(line.amountCents)) ?? 0,
        vatRateBp: null,
      };
    }),
  };
}
