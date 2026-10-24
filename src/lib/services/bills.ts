/**
 * Confirming, editing and deleting bills.
 *
 * Overlaps: a bill covering days already covered by a confirmed bill of the same supply needs a
 * decision. 'sum' keeps both (an adjustment bill); 'replace' marks every overlapping confirmed
 * bill as replaced by the new one, which keeps it archived but out of the figures. A replaced
 * bill is never edited: one deletes it, or the bill that replaced it. Deleting or editing the
 * replacing bill hands the replaced ones back (see deleteBill and confirmBill).
 */
import type { BatchItem } from 'drizzle-orm/batch';
import { nanoid } from 'nanoid';
import type { Db } from '@/lib/db/create-db';
import type { BillLineRow, BillRow } from '@/lib/db/repositories/bills';
import * as billsRepository from '@/lib/db/repositories/bills';
import type { ReadingRow } from '@/lib/db/repositories/readings';
import * as readingsRepository from '@/lib/db/repositories/readings';
import type { SupplyRow } from '@/lib/db/repositories/supplies';
import * as suppliesRepository from '@/lib/db/repositories/supplies';
import { findOverlappingBills } from '@/lib/domain/bill-checks';
import { type BillInput, BillInputSchema } from '@/lib/domain/bill-input';
import {
  allowedRegisters,
  type BillSource,
  consumptionUnitOf,
  isMetered,
  type QuantityUnit,
  type SupplyKind,
} from '@/lib/domain/types';
import { DomainError } from '@/lib/errors';
import { UNIT_LABELS } from '@/lib/format';
import { runBatch } from './batch';

const PAGE_SIZE = 50;
const CONSUMPTION_UNITS: readonly QuantityUnit[] = ['kWh', 'Smc', 'm3'];

export interface ConfirmBillOptions {
  /** Where a new bill comes from; an edited bill keeps the source it was born with. */
  source: BillSource;
  /** Present when an existing bill is being edited: its lines and readings are replaced. */
  billId?: string;
}

/**
 * The checks that need the supply: the bill's lines and readings must make sense for its kind.
 * Every violation is collected, so the person sees them all at once.
 */
export function assertInputFitsSupply(
  supply: Pick<SupplyRow, 'kind' | 'hasPhotovoltaic'>,
  input: BillInput,
): void {
  const errors = new Set<string>();
  if (isMetered(supply.kind)) {
    const unit = consumptionUnitOf(supply.kind);
    const commodityWithQuantity = input.lines.filter(
      (line) => line.category === 'commodity' && line.quantity !== null,
    );
    if (!commodityWithQuantity.some((line) => line.quantityUnit === unit)) {
      errors.add(`Serve almeno una voce della materia prima in ${UNIT_LABELS[unit]}.`);
    }
    if (commodityWithQuantity.some((line) => line.quantityUnit !== unit)) {
      errors.add(`Le voci della materia prima vanno in ${UNIT_LABELS[unit]}.`);
    }
    const registers = allowedRegisters(supply.kind, supply.hasPhotovoltaic);
    if (input.readings.some((reading) => !registers.includes(reading.register))) {
      errors.add('Una lettura usa un registro che questa fornitura non ha.');
    }
  } else {
    if (input.readings.length > 0) errors.add('Una fornitura a canone non ha letture.');
    if (
      input.lines.some((line) => line.quantityUnit && CONSUMPTION_UNITS.includes(line.quantityUnit))
    ) {
      errors.add('Una fornitura a canone non ha consumi: togli kWh, Smc e m³ dalle voci.');
    }
  }
  if (supply.kind !== 'electricity' && input.lines.some((line) => line.band !== null)) {
    errors.add('La fascia vale solo per la luce.');
  }
  if (
    supply.kind !== 'gas' &&
    (input.conversionFactor !== null || input.calorificValueGj !== null)
  ) {
    errors.add('Coefficiente C e potere calorifico valgono solo per il gas.');
  }
  if (errors.size > 0) throw new DomainError('VALIDATION', undefined, [...errors]);
}

function parseBillInput(rawInput: unknown): BillInput {
  const parsed = BillInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION',
      undefined,
      parsed.error.issues.map((issue) => issue.message),
    );
  }
  return parsed.data;
}

export async function confirmBill(
  db: Db,
  userId: string,
  rawInput: unknown,
  options: ConfirmBillOptions,
): Promise<{ billId: string; replacedBillIds: string[] }> {
  const input = parseBillInput(rawInput);

  // The supply and, when editing, the bill must be the user's.
  const supply = await suppliesRepository.getSupply(db, userId, input.supplyId);
  if (!supply) throw new DomainError('NOT_FOUND');
  if (options.billId !== undefined) {
    const existing = await billsRepository.getBill(db, userId, options.billId);
    if (!existing || existing.supplyId !== supply.id) throw new DomainError('NOT_FOUND');
    if (existing.status === 'replaced') {
      throw new DomainError('VALIDATION', undefined, [
        'Una bolletta sostituita non si modifica: elimina quella che la sostituisce, oppure eliminala.',
      ]);
    }
  }
  assertInputFitsSupply(supply, input);

  // Overlaps with the supply's confirmed bills need the person's decision.
  const period = { periodStart: input.periodStart, periodEnd: input.periodEnd };
  const overlaps = findOverlappingBills(
    { ...period, id: options.billId },
    await billsRepository.listBillPeriods(db, userId, supply.id),
  );
  if (overlaps.length > 0 && input.overlapDecision === null) {
    throw new DomainError('OVERLAP_DECISION_REQUIRED', undefined, overlaps);
  }

  const billId = options.billId ?? nanoid();
  const queries: BatchItem<'sqlite'>[] = [];
  if (options.billId !== undefined) {
    queries.push(
      billsRepository.deleteBillLinesQuery(db, userId, [billId]),
      readingsRepository.deleteReadingsOfBillsQuery(db, userId, [billId]),
      billsRepository.updateBillQuery(db, userId, billId, input),
    );
    // The bills this one had replaced and that the new period no longer touches come back.
    const replaced = await billsRepository.listBillsReplacedBy(db, userId, billId);
    const stillOverlapping = new Set(findOverlappingBills(period, replaced).map((b) => b.id));
    const toRestore = replaced.filter((b) => !stillOverlapping.has(b.id)).map((b) => b.id);
    if (toRestore.length > 0) {
      queries.push(billsRepository.restoreBillsQuery(db, userId, toRestore));
    }
  } else {
    queries.push(
      billsRepository.insertBillQuery(db, userId, {
        ...input,
        id: billId,
        supplyId: supply.id,
        source: options.source,
      }),
    );
  }
  queries.push(billsRepository.insertBillLinesQuery(db, userId, billId, input.lines));
  if (input.readings.length > 0) {
    queries.push(
      readingsRepository.insertReadingsQuery(
        db,
        userId,
        input.readings.map((reading) => ({ ...reading, supplyId: supply.id, billId })),
      ),
    );
  }
  const replacedBillIds =
    input.overlapDecision === 'replace' ? overlaps.map((overlap) => overlap.id) : [];
  if (replacedBillIds.length > 0) {
    queries.push(billsRepository.markReplacedQuery(db, userId, replacedBillIds, billId));
  }
  await runBatch(db, queries);
  return { billId, replacedBillIds };
}

/** Files on Blob arrive later: the list is always empty for now. */
export async function deleteBill(
  db: Db,
  userId: string,
  billId: string,
): Promise<{ documentPathnames: string[] }> {
  const bill = await billsRepository.getBill(db, userId, billId);
  if (!bill) throw new DomainError('NOT_FOUND');
  // A replaced bill hands the bills it had replaced over to its own replacement, so they stay
  // out of the figures; a confirmed one brings them back.
  const handOver =
    bill.status === 'replaced' && bill.replacedByBillId !== null
      ? billsRepository.reassignReplacedQuery(db, userId, billId, bill.replacedByBillId)
      : billsRepository.restoreReplacedQuery(db, userId, [billId]);
  await runBatch(db, [
    handOver,
    readingsRepository.deleteReadingsOfBillsQuery(db, userId, [billId]),
    billsRepository.deleteBillLinesQuery(db, userId, [billId]),
    billsRepository.deleteBillsQuery(db, userId, [billId]),
  ]);
  return { documentPathnames: [] };
}

export async function getBillDetail(
  db: Db,
  userId: string,
  billId: string,
): Promise<{ bill: BillRow; supply: SupplyRow; lines: BillLineRow[]; readings: ReadingRow[] }> {
  const bill = await billsRepository.getBill(db, userId, billId);
  if (!bill) throw new DomainError('NOT_FOUND');
  const supply = await suppliesRepository.getSupply(db, userId, bill.supplyId);
  if (!supply) throw new DomainError('NOT_FOUND');
  const lines = await billsRepository.listBillLines(db, userId, billId);
  const readings = await readingsRepository.listBillReadings(db, userId, billId);
  return { bill, supply, lines, readings };
}

/** Pages of 50, newest billing period first; `page` starts at 1. */
export async function listBills(
  db: Db,
  userId: string,
  options: { supplyId?: string; page: number },
): Promise<{
  bills: Array<BillRow & { supplyLabel: string; supplyKind: SupplyKind }>;
  hasNextPage: boolean;
}> {
  // One row more than a page tells whether another page exists.
  const rows = await billsRepository.listBills(db, userId, {
    supplyId: options.supplyId,
    limit: PAGE_SIZE + 1,
    offset: (options.page - 1) * PAGE_SIZE,
  });
  const supplies = await suppliesRepository.listSupplies(db, userId, { includeArchived: true });
  const supplyById = new Map(supplies.map((supply) => [supply.id, supply]));
  const bills = rows.slice(0, PAGE_SIZE).flatMap((bill) => {
    const supply = supplyById.get(bill.supplyId);
    return supply ? [{ ...bill, supplyLabel: supply.label, supplyKind: supply.kind }] : [];
  });
  return { bills, hasNextPage: rows.length > PAGE_SIZE };
}
