/**
 * Bills and their lines. The replacement chain lives in two columns: a bill replaced by another
 * has status 'replaced' and replaced_by_bill_id pointing at it; restoring clears both.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/lib/db/create-db';
import { billLines, bills, meterReadings } from '@/lib/db/schema/app';
import type { ExistingBillPeriod } from '@/lib/domain/bill-checks';
import type { BillInput, BillLineInput } from '@/lib/domain/bill-input';
import type { BillSource } from '@/lib/domain/types';
import type { EngineBill } from '@/lib/engine/types';

export type BillRow = typeof bills.$inferSelect;
export type BillLineRow = typeof billLines.$inferSelect;

/** The columns a bill takes from BillInput: what an edit may change. */
type BillValues = Pick<
  BillInput,
  | 'periodStart'
  | 'periodEnd'
  | 'issueDate'
  | 'dueDate'
  | 'supplierName'
  | 'offerName'
  | 'totalCents'
  | 'amountDueCents'
  | 'conversionFactor'
  | 'calorificValueGj'
  | 'isEstimated'
>;

/** Pick the bill columns out of a value that may carry more (a whole BillInput). */
function billColumns(values: BillValues): BillValues {
  return {
    periodStart: values.periodStart,
    periodEnd: values.periodEnd,
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    supplierName: values.supplierName,
    offerName: values.offerName,
    totalCents: values.totalCents,
    amountDueCents: values.amountDueCents,
    conversionFactor: values.conversionFactor,
    calorificValueGj: values.calorificValueGj,
    isEstimated: values.isEstimated,
  };
}

/** Newest billing period first, then the latest entered. */
export async function listBills(
  db: Db,
  userId: string,
  options: { supplyId?: string; limit: number; offset: number },
): Promise<BillRow[]> {
  return db
    .select()
    .from(bills)
    .where(
      and(
        eq(bills.userId, userId),
        options.supplyId === undefined ? undefined : eq(bills.supplyId, options.supplyId),
      ),
    )
    .orderBy(desc(bills.periodEnd), desc(bills.createdAt))
    .limit(options.limit)
    .offset(options.offset);
}

export async function getBill(db: Db, userId: string, billId: string): Promise<BillRow | null> {
  const [row] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.userId, userId), eq(bills.id, billId)));
  return row ?? null;
}

/** The billing periods of the supply's confirmed bills: the ones a new bill may overlap. */
export async function listBillPeriods(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<ExistingBillPeriod[]> {
  return db
    .select({ id: bills.id, periodStart: bills.periodStart, periodEnd: bills.periodEnd })
    .from(bills)
    .where(
      and(eq(bills.userId, userId), eq(bills.supplyId, supplyId), eq(bills.status, 'confirmed')),
    );
}

export async function listBillsReplacedBy(
  db: Db,
  userId: string,
  billId: string,
): Promise<ExistingBillPeriod[]> {
  return db
    .select({ id: bills.id, periodStart: bills.periodStart, periodEnd: bills.periodEnd })
    .from(bills)
    .where(and(eq(bills.userId, userId), eq(bills.replacedByBillId, billId)));
}

/** Every bill of the supplies, whatever its status. */
export async function listBillIdsOfSupplies(
  db: Db,
  userId: string,
  supplyIds: string[],
): Promise<string[]> {
  if (supplyIds.length === 0) return [];
  const rows = await db
    .select({ id: bills.id })
    .from(bills)
    .where(and(eq(bills.userId, userId), inArray(bills.supplyId, supplyIds)));
  return rows.map((row) => row.id);
}

/**
 * Every bill of the supply (any status: the engine filters) with its lines and its own readings,
 * in the engine's shape. Two queries: bills joined to lines, then the readings of those bills.
 */
export async function listEngineBills(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<EngineBill[]> {
  const rows = await db
    .select({ bill: bills, line: billLines })
    .from(bills)
    .leftJoin(billLines, and(eq(billLines.billId, bills.id), eq(billLines.userId, userId)))
    .where(and(eq(bills.userId, userId), eq(bills.supplyId, supplyId)))
    .orderBy(asc(bills.periodStart), asc(bills.id), asc(billLines.position));
  const readings = await db
    .select()
    .from(meterReadings)
    .where(and(eq(meterReadings.userId, userId), eq(meterReadings.supplyId, supplyId)));

  const byId = new Map<string, EngineBill>();
  for (const { bill, line } of rows) {
    let engineBill = byId.get(bill.id);
    if (!engineBill) {
      engineBill = {
        id: bill.id,
        status: bill.status,
        periodStart: bill.periodStart,
        periodEnd: bill.periodEnd,
        conversionFactor: bill.conversionFactor,
        lines: [],
        readings: [],
      };
      byId.set(bill.id, engineBill);
    }
    if (line) {
      engineBill.lines.push({
        category: line.category,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        quantity: line.quantity,
        quantityUnit: line.quantityUnit,
        amountCents: line.amountCents,
        band: line.band,
        isRecalculation: line.isRecalculation,
        isEstimated: line.isEstimated,
      });
    }
  }
  for (const reading of readings) {
    if (reading.billId === null) continue;
    byId.get(reading.billId)?.readings.push({
      readOn: reading.readOn,
      register: reading.register,
      value: reading.value,
      source: reading.source,
      billId: reading.billId,
      createdAt: reading.createdAt,
    });
  }
  return [...byId.values()];
}

export function insertBillQuery(
  db: Db,
  userId: string,
  values: BillValues & { id: string; supplyId: string; source: BillSource },
) {
  return db.insert(bills).values({
    ...billColumns(values),
    id: values.id,
    supplyId: values.supplyId,
    source: values.source,
    userId,
  });
}

/** Only the fields that come from BillInput: source, status, the replacement and the supply stay. */
export function updateBillQuery(db: Db, userId: string, billId: string, values: BillValues) {
  return db
    .update(bills)
    .set(billColumns(values))
    .where(and(eq(bills.userId, userId), eq(bills.id, billId)));
}

/** The lines in the order given: each one's position is its index. */
export function insertBillLinesQuery(
  db: Db,
  userId: string,
  billId: string,
  lines: BillLineInput[],
) {
  return db
    .insert(billLines)
    .values(lines.map((line, position) => ({ ...line, userId, billId, position })));
}

export function deleteBillLinesQuery(db: Db, userId: string, billIds: string[]) {
  return db
    .delete(billLines)
    .where(and(eq(billLines.userId, userId), inArray(billLines.billId, billIds)));
}

export function markReplacedQuery(db: Db, userId: string, billIds: string[], byBillId: string) {
  return db
    .update(bills)
    .set({ status: 'replaced', replacedByBillId: byBillId })
    .where(and(eq(bills.userId, userId), inArray(bills.id, billIds)));
}

/** Bring back to 'confirmed' every bill replaced by one of byBillIds. */
export function restoreReplacedQuery(db: Db, userId: string, byBillIds: string[]) {
  return db
    .update(bills)
    .set({ status: 'confirmed', replacedByBillId: null })
    .where(and(eq(bills.userId, userId), inArray(bills.replacedByBillId, byBillIds)));
}

/** Bring back to 'confirmed' the bills billIds themselves. */
export function restoreBillsQuery(db: Db, userId: string, billIds: string[]) {
  return db
    .update(bills)
    .set({ status: 'confirmed', replacedByBillId: null })
    .where(and(eq(bills.userId, userId), inArray(bills.id, billIds)));
}

/** Hand the bills replaced by fromBillId over to toBillId; they stay 'replaced'. */
export function reassignReplacedQuery(
  db: Db,
  userId: string,
  fromBillId: string,
  toBillId: string,
) {
  return db
    .update(bills)
    .set({ replacedByBillId: toBillId })
    .where(and(eq(bills.userId, userId), eq(bills.replacedByBillId, fromBillId)));
}

export function deleteBillsQuery(db: Db, userId: string, billIds: string[]) {
  return db.delete(bills).where(and(eq(bills.userId, userId), inArray(bills.id, billIds)));
}

export async function listBillLines(
  db: Db,
  userId: string,
  billId: string,
): Promise<BillLineRow[]> {
  return db
    .select()
    .from(billLines)
    .where(and(eq(billLines.userId, userId), eq(billLines.billId, billId)))
    .orderBy(asc(billLines.position));
}
