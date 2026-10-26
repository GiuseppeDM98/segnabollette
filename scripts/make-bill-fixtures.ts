/**
 * `pnpm fixture:bills`: the synthetic bills of the tests and the extraction each one should give.
 *
 * The PDFs are written by hand (Catalog, Pages, one Page per 50 lines, Helvetica, an xref table
 * with computed offsets): no dependency, and the same bytes at every run, so the SHA-256 that
 * names each expected extraction never changes. Invented suppliers and identifiers, round figures,
 * periods of 2024 (before every seed window), no address: real bills never enter the repository.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Extraction, type ExtractionLine, ExtractionSchema } from '@/lib/extraction/schema';

const BILLS_DIR = 'tests/fixtures/bills';
const EXTRACTIONS_DIR = 'tests/fixtures/extractions';
const LINES_PER_PAGE = 50;

/** A PDF literal string: backslash and parentheses escaped. The texts are plain ASCII. */
function pdfString(text: string): string {
  return `(${text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
}

function makePdf(lines: readonly string[]): Uint8Array {
  const pages: string[][] = [];
  for (let start = 0; start < lines.length; start += LINES_PER_PAGE) {
    pages.push(lines.slice(start, start + LINES_PER_PAGE));
  }
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  for (const [index, page] of pages.entries()) {
    const contentId = 5 + index * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const stream = `BT /F1 10 Tf 40 800 Td 13 TL\n${page.map((line) => `${pdfString(line)} '`).join('\n')}\nET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, body] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function line(
  fields: Partial<ExtractionLine> &
    Pick<ExtractionLine, 'description' | 'category' | 'component' | 'amountCents'>,
): ExtractionLine {
  return {
    periodStart: '',
    periodEnd: '',
    quantity: 0,
    quantityUnit: 'none',
    unitPriceMicros: 0,
    band: 'none',
    isRecalculation: false,
    isEstimated: false,
    vatRatePercent: -1,
    ...fields,
  };
}

const ELECTRICITY: Extraction = {
  isBill: true,
  supplyKind: 'electricity',
  supplierName: 'Pellicano Energia',
  offerName: 'Pellicano Luce Fissa',
  supplyIdentifier: 'IT001E00000011',
  periodStart: '2024-09-01',
  periodEnd: '2024-09-30',
  issueDate: '2024-10-05',
  dueDate: '2024-10-25',
  totalCents: 6600,
  amountDueCents: 7500,
  conversionFactor: 0,
  calorificValueGj: 0,
  consumptionEstimated: false,
  lines: [
    ...(['F1', 'F2', 'F3'] as const).map((band, index) =>
      line({
        description: `Energia ${band}`,
        category: 'commodity',
        component: 'variable',
        quantity: [100, 80, 120][index] ?? 0,
        quantityUnit: 'kWh',
        unitPriceMicros: 100_000,
        amountCents: [1000, 800, 1200][index] ?? 0,
        band,
        vatRatePercent: 10,
      }),
    ),
    line({
      description: 'Commercializzazione',
      category: 'sale',
      component: 'fixed',
      quantity: 1,
      quantityUnit: 'month',
      unitPriceMicros: 10_000_000,
      amountCents: 1000,
      vatRatePercent: 10,
    }),
    line({
      description: 'Trasporto e gestione del contatore',
      category: 'network',
      component: 'variable',
      quantity: 300,
      quantityUnit: 'kWh',
      unitPriceMicros: 20_000,
      amountCents: 600,
      vatRatePercent: 10,
    }),
    line({
      description: 'Quota fissa trasporto',
      category: 'network',
      component: 'fixed',
      quantity: 1,
      quantityUnit: 'month',
      unitPriceMicros: 2_000_000,
      amountCents: 200,
      vatRatePercent: 10,
    }),
    line({
      description: 'Oneri di sistema ASOS',
      category: 'system',
      component: 'variable',
      quantity: 300,
      quantityUnit: 'kWh',
      unitPriceMicros: 30_000,
      amountCents: 900,
      vatRatePercent: 10,
    }),
    line({
      description: 'Accise',
      category: 'excise',
      component: 'variable',
      quantity: 300,
      quantityUnit: 'kWh',
      unitPriceMicros: 10_000,
      amountCents: 300,
      vatRatePercent: 10,
    }),
    line({
      description: 'IVA 10%',
      category: 'vat',
      component: 'lump',
      amountCents: 600,
      vatRatePercent: 10,
    }),
    line({
      description: 'Canone di abbonamento alla televisione',
      category: 'outside',
      component: 'lump',
      amountCents: 900,
    }),
  ],
  readings: [
    { date: '2024-08-31', register: 'F1', value: 1000, kind: 'actual' },
    { date: '2024-08-31', register: 'F2', value: 1000, kind: 'actual' },
    { date: '2024-08-31', register: 'F3', value: 1000, kind: 'actual' },
    { date: '2024-09-30', register: 'F1', value: 1100, kind: 'actual' },
    { date: '2024-09-30', register: 'F2', value: 1080, kind: 'actual' },
    { date: '2024-09-30', register: 'F3', value: 1120, kind: 'actual' },
  ],
  warnings: [],
};

const ELECTRICITY_TEXT = (issueDate: string) => [
  'PELLICANO ENERGIA',
  'Bolletta luce - Offerta Pellicano Luce Fissa',
  `Data emissione: ${issueDate}   Scadenza: 25/10/2024`,
  'POD: IT001E00000011',
  'Periodo di fatturazione: dal 01/09/2024 al 30/09/2024',
  '',
  'Totale bolletta: 66,00 EUR',
  'Canone TV: 9,00 EUR',
  'Totale da pagare: 75,00 EUR',
  '',
  'Elementi di dettaglio',
  'Spesa per la materia energia',
  'Energia F1   100 kWh x 0,100000 EUR/kWh   10,00',
  'Energia F2    80 kWh x 0,100000 EUR/kWh    8,00',
  'Energia F3   120 kWh x 0,100000 EUR/kWh   12,00',
  'Commercializzazione   1 mese x 10,000000 EUR/mese   10,00',
  'Spesa per il trasporto e la gestione del contatore',
  'Trasporto e gestione del contatore   300 kWh x 0,020000 EUR/kWh   6,00',
  'Quota fissa trasporto   1 mese x 2,000000 EUR/mese   2,00',
  'Spesa per oneri di sistema',
  'Oneri di sistema ASOS   300 kWh x 0,030000 EUR/kWh   9,00',
  'Imposte',
  'Accise   300 kWh x 0,010000 EUR/kWh   3,00',
  'IVA 10% su 60,00   6,00',
  'Altre partite',
  'Canone di abbonamento alla televisione   9,00',
  '',
  'Letture',
  'Data         F1     F2     F3    Tipo',
  '31/08/2024   1000   1000   1000  rilevata',
  '30/09/2024   1100   1080   1120  rilevata',
];

const GAS: Extraction = {
  isBill: true,
  supplyKind: 'gas',
  supplierName: 'Pellicano Energia',
  offerName: 'Pellicano Gas Fisso',
  supplyIdentifier: '00000000000011',
  periodStart: '2024-09-01',
  periodEnd: '2024-09-30',
  issueDate: '2024-10-05',
  dueDate: '2024-10-25',
  totalCents: 3040,
  amountDueCents: 3040,
  conversionFactor: 1.02,
  calorificValueGj: 0.0388,
  consumptionEstimated: false,
  lines: [
    line({
      description: 'Gas',
      category: 'commodity',
      component: 'variable',
      periodStart: '2024-08-01',
      periodEnd: '2024-08-31',
      quantity: 10,
      quantityUnit: 'Smc',
      unitPriceMicros: 500_000,
      amountCents: 500,
      isRecalculation: true,
      vatRatePercent: 10,
    }),
    line({
      description: 'Gas (voce di ricalcolo)',
      category: 'commodity',
      component: 'variable',
      periodStart: '2024-08-01',
      periodEnd: '2024-08-31',
      quantity: -8,
      quantityUnit: 'Smc',
      unitPriceMicros: 500_000,
      amountCents: -400,
      isRecalculation: true,
      vatRatePercent: 10,
    }),
    line({
      description: 'Gas',
      category: 'commodity',
      component: 'variable',
      quantity: 20,
      quantityUnit: 'Smc',
      unitPriceMicros: 500_000,
      amountCents: 1000,
      vatRatePercent: 10,
    }),
    line({
      description: 'Quota fissa vendita',
      category: 'sale',
      component: 'fixed',
      quantity: 1,
      quantityUnit: 'month',
      unitPriceMicros: 5_000_000,
      amountCents: 500,
      vatRatePercent: 22,
    }),
    line({
      description: 'Trasporto',
      category: 'network',
      component: 'variable',
      quantity: 20,
      quantityUnit: 'Smc',
      unitPriceMicros: 100_000,
      amountCents: 200,
      vatRatePercent: 22,
    }),
    line({
      description: 'Quota fissa trasporto',
      category: 'network',
      component: 'fixed',
      quantity: 1,
      quantityUnit: 'month',
      unitPriceMicros: 3_000_000,
      amountCents: 300,
      vatRatePercent: 22,
    }),
    line({
      description: 'Oneri di sistema',
      category: 'system',
      component: 'variable',
      quantity: 20,
      quantityUnit: 'Smc',
      unitPriceMicros: 50_000,
      amountCents: 100,
      vatRatePercent: 22,
    }),
    line({
      description: 'Accisa',
      category: 'excise',
      component: 'variable',
      quantity: 20,
      quantityUnit: 'Smc',
      unitPriceMicros: 150_000,
      amountCents: 300,
      vatRatePercent: 22,
    }),
    line({
      description: 'Addizionale regionale',
      category: 'excise',
      component: 'variable',
      quantity: 20,
      quantityUnit: 'Smc',
      unitPriceMicros: 50_000,
      amountCents: 100,
      vatRatePercent: 22,
    }),
    line({
      description: 'IVA 10%',
      category: 'vat',
      component: 'lump',
      amountCents: 110,
      vatRatePercent: 10,
    }),
    line({
      description: 'IVA 22%',
      category: 'vat',
      component: 'lump',
      amountCents: 330,
      vatRatePercent: 22,
    }),
  ],
  readings: [
    { date: '2024-08-31', register: 'single', value: 2000, kind: 'actual' },
    { date: '2024-09-30', register: 'single', value: 2020, kind: 'actual' },
  ],
  warnings: [],
};

const GAS_TEXT = [
  'PELLICANO ENERGIA',
  'Bolletta gas - Offerta Pellicano Gas Fisso',
  'Data emissione: 05/10/2024   Scadenza: 25/10/2024',
  'PDR: 00000000000011',
  'Periodo di fatturazione: dal 01/09/2024 al 30/09/2024',
  'Coefficiente C: 1,0200000   Potere calorifico superiore: 38,80 MJ/Smc',
  '',
  'Totale bolletta: 30,40 EUR',
  'Totale da pagare: 30,40 EUR',
  '',
  'Elementi di dettaglio',
  'Periodo di riferimento: dal 01/08/2024 al 31/08/2024',
  'Gas   10 Smc x 0,500000 EUR/Smc   5,00',
  'Gas (voce di ricalcolo)   -8 Smc x 0,500000 EUR/Smc   -4,00',
  'Periodo di riferimento: dal 01/09/2024 al 30/09/2024',
  'Spesa per la materia gas naturale',
  'Gas   20 Smc x 0,500000 EUR/Smc   10,00',
  'Quota fissa vendita   1 mese x 5,000000 EUR/mese   5,00',
  'Spesa per il trasporto e la gestione del contatore',
  'Trasporto   20 Smc x 0,100000 EUR/Smc   2,00',
  'Quota fissa trasporto   1 mese x 3,000000 EUR/mese   3,00',
  'Spesa per oneri di sistema',
  'Oneri di sistema   20 Smc x 0,050000 EUR/Smc   1,00',
  'Imposte',
  'Accisa   20 Smc x 0,150000 EUR/Smc   3,00',
  'Addizionale regionale   20 Smc x 0,050000 EUR/Smc   1,00',
  'IVA 10% su 11,00   1,10',
  'IVA 22% su 15,00   3,30',
  '',
  'Letture (metri cubi)',
  '31/08/2024   2000   rilevata',
  '30/09/2024   2020   rilevata',
];

const WATER: Extraction = {
  isBill: true,
  supplyKind: 'water',
  supplierName: 'Castoro Acque',
  offerName: '',
  supplyIdentifier: '00011',
  periodStart: '2024-07-01',
  periodEnd: '2024-09-30',
  issueDate: '2024-10-10',
  dueDate: '2024-11-10',
  totalCents: 6600,
  amountDueCents: 6600,
  conversionFactor: 0,
  calorificValueGj: 0,
  consumptionEstimated: false,
  lines: [
    line({
      description: 'Acquedotto quota variabile 1 scaglione',
      category: 'commodity',
      component: 'variable',
      quantity: 30,
      quantityUnit: 'm3',
      unitPriceMicros: 500_000,
      amountCents: 1500,
      vatRatePercent: 10,
    }),
    line({
      description: 'Acquedotto quota variabile 2 scaglione',
      category: 'commodity',
      component: 'variable',
      quantity: 10,
      quantityUnit: 'm3',
      unitPriceMicros: 1_000_000,
      amountCents: 1000,
      vatRatePercent: 10,
    }),
    line({
      description: 'Acquedotto quota fissa',
      category: 'sale',
      component: 'fixed',
      quantity: 3,
      quantityUnit: 'month',
      unitPriceMicros: 2_000_000,
      amountCents: 600,
      vatRatePercent: 10,
    }),
    line({
      description: 'Fognatura',
      category: 'network',
      component: 'variable',
      quantity: 40,
      quantityUnit: 'm3',
      unitPriceMicros: 200_000,
      amountCents: 800,
      vatRatePercent: 10,
    }),
    line({
      description: 'Depurazione',
      category: 'network',
      component: 'variable',
      quantity: 40,
      quantityUnit: 'm3',
      unitPriceMicros: 500_000,
      amountCents: 2000,
      vatRatePercent: 10,
    }),
    ...(['UI1', 'UI2', 'UI3', 'UI4'] as const).map((component, index) =>
      line({
        description: `Componente ${component}`,
        category: 'system',
        component: 'variable',
        quantity: 40,
        quantityUnit: 'm3',
        unitPriceMicros: index === 1 ? 10_000 : 5_000,
        amountCents: index === 1 ? 40 : 20,
        vatRatePercent: 10,
      }),
    ),
    line({
      description: 'IVA 10%',
      category: 'vat',
      component: 'lump',
      amountCents: 600,
      vatRatePercent: 10,
    }),
  ],
  readings: [
    { date: '2024-06-30', register: 'single', value: 100, kind: 'actual' },
    { date: '2024-09-30', register: 'single', value: 140, kind: 'actual' },
  ],
  warnings: [],
};

const WATER_TEXT = [
  'CASTORO ACQUE',
  'Bolletta servizio idrico integrato',
  'Data emissione: 10/10/2024   Scadenza: 10/11/2024',
  'Codice utenza: 00011',
  'Periodo di fatturazione: dal 01/07/2024 al 30/09/2024',
  '',
  'Totale bolletta: 66,00 EUR',
  'Totale da pagare: 66,00 EUR',
  '',
  'Dettaglio importi',
  'Acquedotto quota variabile 1 scaglione   30 m3 x 0,500000 EUR/m3   15,00',
  'Acquedotto quota variabile 2 scaglione   10 m3 x 1,000000 EUR/m3   10,00',
  'Acquedotto quota fissa   3 mesi x 2,000000 EUR/mese   6,00',
  'Fognatura   40 m3 x 0,200000 EUR/m3   8,00',
  'Depurazione   40 m3 x 0,500000 EUR/m3   20,00',
  'Componente UI1   40 m3 x 0,005000 EUR/m3   0,20',
  'Componente UI2   40 m3 x 0,010000 EUR/m3   0,40',
  'Componente UI3   40 m3 x 0,005000 EUR/m3   0,20',
  'Componente UI4   40 m3 x 0,005000 EUR/m3   0,20',
  'IVA 10% su 60,00   6,00',
  '',
  'Letture (metri cubi)',
  '30/06/2024   100   rilevata',
  '30/09/2024   140   rilevata',
];

const TELECOM: Extraction = {
  isBill: true,
  supplyKind: 'telecom',
  supplierName: 'Armadillo Telecomunicazioni',
  offerName: 'Armadillo Fibra',
  supplyIdentifier: '',
  periodStart: '2024-09-01',
  periodEnd: '2024-09-30',
  issueDate: '2024-09-05',
  dueDate: '2024-09-25',
  totalCents: 3050,
  amountDueCents: 3050,
  conversionFactor: 0,
  calorificValueGj: 0,
  consumptionEstimated: false,
  lines: [
    line({
      description: 'Canone Armadillo Fibra',
      category: 'sale',
      component: 'fixed',
      quantity: 1,
      quantityUnit: 'month',
      unitPriceMicros: 25_000_000,
      amountCents: 2500,
      vatRatePercent: 22,
    }),
    line({
      description: 'IVA 22%',
      category: 'vat',
      component: 'lump',
      amountCents: 550,
      vatRatePercent: 22,
    }),
  ],
  readings: [],
  warnings: ['Importi stampati IVA inclusa: netto ricavato dal riepilogo IVA'],
};

const TELECOM_TEXT = [
  'ARMADILLO TELECOMUNICAZIONI',
  'Fattura servizi di telefonia e internet',
  'Data emissione: 05/09/2024   Scadenza: 25/09/2024',
  'Periodo: dal 01/09/2024 al 30/09/2024',
  '',
  'Canone Armadillo Fibra (IVA incl.)   30,50',
  '',
  'Riepilogo IVA',
  'Imponibile 22%: 25,00   IVA 22%: 5,50',
  '',
  'Totale fattura: 30,50 EUR',
];

function writeBill(name: string, text: readonly string[], expected: unknown): void {
  const pdf = makePdf(text);
  writeFileSync(join(BILLS_DIR, name), pdf);
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  writeFileSync(join(EXTRACTIONS_DIR, `${sha256}.json`), `${JSON.stringify(expected, null, 2)}\n`);
  console.log(`${name} → ${sha256}.json`);
}

function main(): void {
  for (const extraction of [ELECTRICITY, GAS, WATER, TELECOM]) ExtractionSchema.parse(extraction);
  mkdirSync(BILLS_DIR, { recursive: true });
  mkdirSync(EXTRACTIONS_DIR, { recursive: true });
  writeBill('luce-pellicano.pdf', ELECTRICITY_TEXT('05/10/2024'), ELECTRICITY);
  writeBill('gas-pellicano.pdf', GAS_TEXT, GAS);
  writeBill('acqua-castoro.pdf', WATER_TEXT, WATER);
  writeBill('internet-armadillo.pdf', TELECOM_TEXT, TELECOM);
  // The same electricity bill with another issue date: another SHA, and a failing extraction.
  writeBill('luce-pellicano-rotta.pdf', ELECTRICITY_TEXT('06/10/2024'), { fail: 'unavailable' });
  writeFileSync(
    join(EXTRACTIONS_DIR, 'photo-default.json'),
    `${JSON.stringify(TELECOM, null, 2)}\n`,
  );
  // Biome formats the JSON as the repository's check expects; the result is the same every run.
  execFileSync('pnpm', ['exec', 'biome', 'format', '--write', EXTRACTIONS_DIR], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

main();
