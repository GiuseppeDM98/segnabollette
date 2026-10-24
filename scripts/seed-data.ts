/**
 * The seed: two identities shared by `pnpm db:seed`, Playwright and the guided verifications, and
 * the invented bills they own. Every figure is round and made up; names are decoy words.
 */
import type { BillInput, BillLineInput, BillReadingInput } from '@/lib/domain/bill-input';
import { monthEnd, monthStart, shiftMonth } from '@/lib/domain/dates';
import type {
  IsoDate,
  LineCategory,
  LineComponent,
  MonthKey,
  SupplyKind,
} from '@/lib/domain/types';

export const SEED_USERS = [
  { key: 'a', name: 'Seed Fenicottero', email: 'seed-a@example.test', password: 'seed-password-1' },
  { key: 'b', name: 'Seed Ornitorinco', email: 'seed-b@example.test', password: 'seed-password-1' },
] as const;

export const SEED_SUPPLIERS: Record<'electricity' | 'gas' | 'water' | 'telecom', string> = {
  electricity: 'Fenicottero Energia',
  gas: 'Fenicottero Energia',
  water: 'Ornitorinco Acque',
  telecom: 'Lemure Telecomunicazioni',
};

/** Every electricity counter (F1, F2, F3) and the gas counter start here the day before the first month. */
export const SEED_ELECTRICITY_START_KWH = 1000;
export const SEED_GAS_START_M3 = 5000;
/** Monthly growth of F1/F2/F3 on the seed electricity bills (shares 40% / 30% / 30%). */
export const SEED_BAND_KWH = { F1: 80, F2: 60, F3: 60 } as const;

// The TV licence fee is charged on the electricity bill in ten monthly instalments, January to
// October; it is outside the bill total but inside the amount due.
const TV_FEE_MONTHS = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
const GAS_WINTER_MONTHS = new Set(['10', '11', '12', '01', '02', '03']);

interface LineSpec {
  description: string;
  category: LineCategory;
  component: LineComponent;
  amountCents: number;
}

function line(spec: LineSpec, start: IsoDate, end: IsoDate): BillLineInput {
  return {
    ...spec,
    periodStart: start,
    periodEnd: end,
    quantity: null,
    quantityUnit: null,
    unitPriceMicros: null,
    band: null,
    isRecalculation: false,
    isEstimated: false,
    vatRateBp: null,
  };
}

function commodity(
  description: string,
  quantity: number,
  unit: 'kWh' | 'Smc' | 'm3',
  unitPriceMicros: number,
  start: IsoDate,
  end: IsoDate,
): BillLineInput {
  return {
    ...line(
      {
        description,
        category: 'commodity',
        component: 'variable',
        amountCents: Math.round((quantity * unitPriceMicros) / 10_000),
      },
      start,
      end,
    ),
    quantity,
    quantityUnit: unit,
    unitPriceMicros,
  };
}

/** Totals from the lines: the bill total leaves out the 'outside' lines, the amount due does not. */
function bill(
  kind: keyof typeof SEED_SUPPLIERS,
  supplyId: string,
  start: IsoDate,
  end: IsoDate,
  lines: BillLineInput[],
  extra: Partial<BillInput> = {},
): BillInput {
  return {
    supplyId,
    periodStart: start,
    periodEnd: end,
    issueDate: null,
    dueDate: null,
    supplierName: SEED_SUPPLIERS[kind],
    offerName: null,
    totalCents: lines
      .filter((l) => l.category !== 'outside')
      .reduce((sum, l) => sum + l.amountCents, 0),
    amountDueCents: lines.reduce((sum, l) => sum + l.amountCents, 0),
    conversionFactor: null,
    calorificValueGj: null,
    isEstimated: false,
    lines,
    readings: [],
    overlapDecision: null,
    ...extra,
  };
}

function reading(readOn: IsoDate, register: BillReadingInput['register'], value: number) {
  return { readOn, register, value, source: 'bill_actual' as const };
}

/**
 * Monthly electricity bills of a single-rate offer. The first one is estimated; the second
 * re-bills the first month with a recalculation pair of opposite sign, so that month ends up
 * actual. F1/F2/F3 readings at the end of the previous month and of the month.
 */
function electricityBills(supplyId: string, months: MonthKey[]): BillInput[] {
  return months.map((month, index) => {
    const start = monthStart(month);
    const end = monthEnd(month);
    const energy = commodity('Energia', 200, 'kWh', 100_000, start, end);
    const lines: BillLineInput[] = [
      { ...energy, isEstimated: index === 0 },
      line(
        {
          description: 'Commercializzazione',
          category: 'sale',
          component: 'fixed',
          amountCents: 600,
        },
        start,
        end,
      ),
      line(
        {
          description: 'Trasporto e gestione del contatore',
          category: 'network',
          component: 'lump',
          amountCents: 800,
        },
        start,
        end,
      ),
      line(
        {
          description: 'Oneri di sistema',
          category: 'system',
          component: 'lump',
          amountCents: 500,
        },
        start,
        end,
      ),
      line(
        { description: 'Accise', category: 'excise', component: 'lump', amountCents: 400 },
        start,
        end,
      ),
      line(
        { description: 'IVA', category: 'vat', component: 'lump', amountCents: 430 },
        start,
        end,
      ),
    ];
    const previous = months[index - 1];
    if (index === 1 && previous) {
      const [from, to] = [monthStart(previous), monthEnd(previous)];
      lines.push(
        { ...commodity('Energia', 200, 'kWh', 100_000, from, to), isRecalculation: true },
        {
          ...commodity('Energia (voce di ricalcolo)', -200, 'kWh', 100_000, from, to),
          isRecalculation: true,
        },
      );
    }
    if (TV_FEE_MONTHS.has(month.slice(5))) {
      lines.push(
        line(
          { description: 'Canone TV', category: 'outside', component: 'lump', amountCents: 900 },
          start,
          end,
        ),
      );
    }
    const before = monthEnd(shiftMonth(month, -1));
    const readings = (['F1', 'F2', 'F3'] as const).flatMap((register) => [
      reading(before, register, SEED_ELECTRICITY_START_KWH + SEED_BAND_KWH[register] * index),
      reading(end, register, SEED_ELECTRICITY_START_KWH + SEED_BAND_KWH[register] * (index + 1)),
    ]);
    return bill('electricity', supplyId, start, end, lines, { isEstimated: index === 0, readings });
  });
}

/** Monthly gas bills, 50 Smc in winter and 10 in summer, C = 1, cubic-metre readings. */
function gasBills(supplyId: string, months: MonthKey[]): BillInput[] {
  let counter = SEED_GAS_START_M3;
  return months.map((month) => {
    const start = monthStart(month);
    const end = monthEnd(month);
    const isWinter = GAS_WINTER_MONTHS.has(month.slice(5));
    const smc = isWinter ? 50 : 10;
    const lines: BillLineInput[] = [
      commodity('Gas naturale', smc, 'Smc', 500_000, start, end),
      line(
        {
          description: 'Commercializzazione',
          category: 'sale',
          component: 'lump',
          amountCents: 700,
        },
        start,
        end,
      ),
      line(
        {
          description: 'Trasporto e gestione del contatore',
          category: 'network',
          component: 'lump',
          amountCents: 600,
        },
        start,
        end,
      ),
      line(
        {
          description: 'Oneri di sistema',
          category: 'system',
          component: 'lump',
          amountCents: -100,
        },
        start,
        end,
      ),
      line(
        {
          description: 'Accise',
          category: 'excise',
          component: 'lump',
          amountCents: isWinter ? 300 : 100,
        },
        start,
        end,
      ),
      line(
        { description: 'IVA', category: 'vat', component: 'lump', amountCents: 400 },
        start,
        end,
      ),
    ];
    const readings = [
      reading(monthEnd(shiftMonth(month, -1)), 'single', counter),
      reading(end, 'single', counter + smc),
    ];
    counter += smc;
    return bill('gas', supplyId, start, end, lines, {
      conversionFactor: 1,
      calorificValueGj: 0.03852,
      readings,
    });
  });
}

/** Quarterly water bills: one every three of the given months, without readings. */
function waterBills(supplyId: string, months: MonthKey[]): BillInput[] {
  if (months.length % 3 !== 0) {
    throw new RangeError(
      `buildSeedBills: water needs a multiple of 3 months, got ${months.length}`,
    );
  }
  const bills: BillInput[] = [];
  for (let index = 0; index < months.length; index += 3) {
    const first = months[index];
    const last = months[index + 2];
    if (!first || !last) continue;
    const start = monthStart(first);
    const end = monthEnd(last);
    bills.push(
      bill('water', supplyId, start, end, [
        commodity('Quota variabile acquedotto', 30, 'm3', 1_000_000, start, end),
        line(
          {
            description: 'Fognatura e depurazione',
            category: 'network',
            component: 'lump',
            amountCents: 1500,
          },
          start,
          end,
        ),
        line(
          {
            description: 'Componenti perequative',
            category: 'system',
            component: 'lump',
            amountCents: 200,
          },
          start,
          end,
        ),
        line(
          { description: 'IVA', category: 'vat', component: 'lump', amountCents: 470 },
          start,
          end,
        ),
      ]),
    );
  }
  return bills;
}

function telecomBills(supplyId: string, months: MonthKey[]): BillInput[] {
  return months.map((month) => {
    const start = monthStart(month);
    const end = monthEnd(month);
    return bill('telecom', supplyId, start, end, [
      line(
        { description: 'Canone', category: 'sale', component: 'fixed', amountCents: 2500 },
        start,
        end,
      ),
      line(
        { description: 'IVA', category: 'vat', component: 'lump', amountCents: 550 },
        start,
        end,
      ),
    ]);
  });
}

/**
 * The seed bills of one supply: one per month for electricity, gas and telecom; for water the
 * months are grouped by three (15 consecutive months give 5 quarterly bills).
 */
export function buildSeedBills(
  kind: SupplyKind,
  supplyId: string,
  months: MonthKey[],
): BillInput[] {
  switch (kind) {
    case 'electricity':
      return electricityBills(supplyId, months);
    case 'gas':
      return gasBills(supplyId, months);
    case 'water':
      return waterBills(supplyId, months);
    case 'telecom':
      return telecomBills(supplyId, months);
    default:
      throw new RangeError(`buildSeedBills: no seed bills for ${kind}`);
  }
}
