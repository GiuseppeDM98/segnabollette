/**
 * The starting point of a hand-typed bill. Real bills print 10–70 lines; typing them one by one
 * is not realistic, so a new bill starts from a few aggregated lines per kind and the person adds
 * detail lines on demand. A pure module (no 'use client'): the server page builds the initial
 * value and the client form reuses the templates.
 */
import type { BillInput, BillLineInput } from '@/lib/domain/bill-input';
import { monthEnd, monthKeyOf, monthStart, shiftMonth } from '@/lib/domain/dates';
import type { IsoDate, SupplyKind } from '@/lib/domain/types';

export type LineTemplate = Pick<
  BillLineInput,
  'description' | 'category' | 'component' | 'quantityUnit' | 'band'
>;

/**
 * The few aggregated lines a hand-typed bill starts from; detail lines are added on demand.
 * With photovoltaic panels an electricity bill also credits the energy fed into the grid.
 */
export function lineTemplateFor(kind: SupplyKind, hasPhotovoltaic: boolean): LineTemplate[] {
  const line = (
    description: string,
    category: LineTemplate['category'],
    component: LineTemplate['component'],
    quantityUnit: LineTemplate['quantityUnit'] = null,
  ): LineTemplate => ({ description, category, component, quantityUnit, band: null });
  switch (kind) {
    case 'electricity':
      return [
        line('Energia', 'commodity', 'variable', 'kWh'),
        line('Altre spese di vendita', 'sale', 'lump'),
        line('Trasporto e gestione del contatore', 'network', 'lump'),
        line('Oneri di sistema', 'system', 'lump'),
        line('Accise', 'excise', 'lump'),
        line('IVA', 'vat', 'lump'),
        ...(hasPhotovoltaic ? [line('Energia ceduta', 'feed_in', 'lump')] : []),
      ];
    case 'gas':
      return [
        line('Gas naturale', 'commodity', 'variable', 'Smc'),
        line('Altre spese di vendita', 'sale', 'lump'),
        line('Trasporto e gestione del contatore', 'network', 'lump'),
        line('Oneri di sistema', 'system', 'lump'),
        line('Accise e addizionale regionale', 'excise', 'lump'),
        line('IVA', 'vat', 'lump'),
      ];
    case 'water':
      return [
        line('Acquedotto (quota variabile)', 'commodity', 'variable', 'm3'),
        line('Quota fissa', 'sale', 'fixed'),
        line('Fognatura e depurazione', 'network', 'lump'),
        line('Componenti perequative', 'system', 'lump'),
        line('IVA', 'vat', 'lump'),
      ];
    case 'telecom':
      return [line('Canone', 'sale', 'fixed'), line('IVA', 'vat', 'lump')];
    case 'waste':
      return [line('TARI', 'sale', 'fixed')];
  }
}

/**
 * A new hand-typed bill for last month, built from the supply's line template. Amounts are 0 here;
 * the form shows them empty and requires them.
 */
export function emptyBillInput(
  supply: { id: string; kind: SupplyKind; supplierName: string | null; hasPhotovoltaic: boolean },
  today: IsoDate,
): BillInput {
  const month = shiftMonth(monthKeyOf(today), -1);
  const periodStart = monthStart(month);
  const periodEnd = monthEnd(month);
  return {
    supplyId: supply.id,
    periodStart,
    periodEnd,
    issueDate: null,
    dueDate: null,
    supplierName: supply.supplierName,
    offerName: null,
    totalCents: 0,
    amountDueCents: null,
    conversionFactor: null,
    calorificValueGj: null,
    isEstimated: false,
    lines: lineTemplateFor(supply.kind, supply.hasPhotovoltaic).map((template) => ({
      ...template,
      periodStart,
      periodEnd,
      // Only the consumption line carries a quantity: it starts at 0 in its own unit.
      quantity: template.category === 'commodity' && template.quantityUnit !== null ? 0 : null,
      unitPriceMicros: null,
      amountCents: 0,
      isRecalculation: false,
      isEstimated: false,
      vatRateBp: null,
    })),
    readings: [],
    overlapDecision: null,
  };
}
