/**
 * The bill form edits a draft of strings, not a BillInput: a field must be able to hold what the
 * person is typing ('12,', '', '0,0990001') until they submit. draftFromInput writes numbers the
 * Italian way at the precision of each field; inputFromDraft reads them back, reports every field
 * error by path ('lines.3.amountCents', 'totalCents', 'readings.0.value') and validates the
 * result with BillInputSchema. A pure module: the form, its tests and later the review use it.
 */
import { type BillInput, BillInputSchema, type BillLineInput } from '@/lib/domain/bill-input';
import { centsFromEuro, microsFromEuro } from '@/lib/domain/money';
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

export type BillReadingDraft = Omit<BillInput['readings'][number], 'value'> & { value: string };

export type BillDraft = Omit<
  BillInput,
  'totalCents' | 'amountDueCents' | 'conversionFactor' | 'calorificValueGj' | 'lines' | 'readings'
> & {
  totalCents: string;
  amountDueCents: string;
  conversionFactor: string;
  calorificValueGj: string;
  lines: BillLineDraft[];
  readings: BillReadingDraft[];
};

// Field precision: cents for amounts, micro-euros for unit prices, basis points for VAT. Quantities
// and readings are never rounded: a yearly fee pro rata (30/365) must come back identical.
const AMOUNT_DIGITS = 2;
const PRICE_DIGITS = 6;
const VAT_DIGITS = 2;
const EXACT_DIGITS = 20;

const AMOUNT_REQUIRED = 'Importo obbligatorio';
const TOTAL_REQUIRED = 'Totale obbligatorio';
const VALUE_REQUIRED = 'Valore obbligatorio';
const NOT_A_NUMBER = 'Numero non valido';
const tooManyDigits = (digits: number) => `Al massimo ${digits} decimali`;

function numberText(value: number | null, digits: number, scale = 1): string {
  return value === null ? '' : formatDecimalInput(value / scale, digits);
}

export function draftFromInput(
  input: BillInput,
  options: { blankAmounts?: boolean } = {},
): BillDraft {
  const blank = options.blankAmounts === true;
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
    readings: input.readings.map((reading) => ({
      ...reading,
      value: numberText(reading.value, EXACT_DIGITS),
    })),
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
  const readings = draft.readings.map((reading, index) => ({
    ...reading,
    value: readNumber(reading.value, `readings.${index}.value`, errors, {
      required: VALUE_REQUIRED,
    }),
  }));
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
      const path = issue.path.join('.');
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
