/**
 * Self readings: the meter values the person reads between bills. Readings printed on a bill
 * belong to the bill and change only by editing it.
 */
import { nanoid } from 'nanoid';
import type { Db } from '@/lib/db/create-db';
import * as billsRepository from '@/lib/db/repositories/bills';
import * as housesRepository from '@/lib/db/repositories/houses';
import type { ReadingRow } from '@/lib/db/repositories/readings';
import * as readingsRepository from '@/lib/db/repositories/readings';
import * as suppliesRepository from '@/lib/db/repositories/supplies';
import { SelfReadingInputSchema } from '@/lib/domain/bill-input';
import {
  allowedRegisters,
  type IsoDate,
  isMetered,
  type ReadingRegister,
  type SupplyKind,
} from '@/lib/domain/types';
import { pickReadings } from '@/lib/engine/readings';
import type { EngineReading } from '@/lib/engine/types';
import { DomainError } from '@/lib/errors';
import { formatSupplyLabel } from '@/lib/format';

const DEFAULT_LIST_LIMIT = 100;

/**
 * One row per register, all on the same day. `today` is the caller's Rome calendar day
 * (romeToday(Date.now())): a reading cannot be in the future, while bill dates stay free.
 */
export async function createSelfReadings(
  db: Db,
  userId: string,
  rawInput: unknown,
  options: { today: IsoDate },
): Promise<{ readingIds: string[] }> {
  const parsed = SelfReadingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION',
      undefined,
      parsed.error.issues.map((issue) => issue.message),
    );
  }
  const input = parsed.data;
  if (input.readOn > options.today) {
    throw new DomainError('VALIDATION', undefined, ['La lettura non può essere nel futuro.']);
  }
  const supply = await suppliesRepository.getSupply(db, userId, input.supplyId);
  if (!supply) throw new DomainError('NOT_FOUND');
  if (!isMetered(supply.kind)) {
    throw new DomainError('VALIDATION', undefined, ['Una fornitura a canone non ha letture.']);
  }
  const registers = allowedRegisters(supply.kind, supply.hasPhotovoltaic);
  if (input.values.some((value) => !registers.includes(value.register))) {
    throw new DomainError('VALIDATION', undefined, [
      'Una lettura usa un registro che questa fornitura non ha.',
    ]);
  }

  const rows = input.values.map((value) => ({
    id: nanoid(),
    supplyId: supply.id,
    billId: null,
    readOn: input.readOn,
    register: value.register,
    value: value.value,
    source: 'self' as const,
  }));
  await readingsRepository.insertReadingsQuery(db, userId, rows);
  return { readingIds: rows.map((row) => row.id) };
}

export async function deleteReading(db: Db, userId: string, readingId: string): Promise<void> {
  const reading = await readingsRepository.getReading(db, userId, readingId);
  if (!reading) throw new DomainError('NOT_FOUND');
  if (reading.source !== 'self') {
    throw new DomainError('VALIDATION', undefined, [
      'Le letture di una bolletta si cambiano modificando la bolletta.',
    ]);
  }
  await readingsRepository.deleteReadingQuery(db, userId, readingId);
}

/** Latest reading day first, then the latest entered; 100 rows unless `limit` says otherwise. */
export async function listReadings(
  db: Db,
  userId: string,
  options: { supplyId?: string; limit?: number },
): Promise<Array<ReadingRow & { supplyLabel: string }>> {
  const rows = await readingsRepository.listReadings(db, userId, {
    supplyId: options.supplyId,
    limit: options.limit ?? DEFAULT_LIST_LIMIT,
  });
  const supplies = await suppliesRepository.listSupplies(db, userId, { includeArchived: true });
  const houses = await housesRepository.listHouses(db, userId);
  const houseNameById = new Map(houses.map((house) => [house.id, house.name]));
  const labelById = new Map(
    supplies.map((supply) => [
      supply.id,
      formatSupplyLabel(supply.label, houseNameById.get(supply.houseId) ?? '', houses.length),
    ]),
  );
  return rows.flatMap((row) => {
    const supplyLabel = labelById.get(row.supplyId);
    return supplyLabel === undefined ? [] : [{ ...row, supplyLabel }];
  });
}

/**
 * The readings the engine counts for a supply: self readings and those printed on confirmed
 * bills (a replaced bill's readings leave with it). The supply must be the user's and metered.
 */
async function listCountedReadings(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<{ hasPhotovoltaic: boolean; kind: SupplyKind; readings: EngineReading[] }> {
  const supply = await suppliesRepository.getSupply(db, userId, supplyId);
  if (!supply) throw new DomainError('NOT_FOUND');
  if (!isMetered(supply.kind)) {
    throw new DomainError('VALIDATION', undefined, ['Una fornitura a canone non ha letture.']);
  }
  const confirmedBillIds = new Set(
    (await billsRepository.listBillPeriods(db, userId, supplyId)).map((bill) => bill.id),
  );
  const readings = (await readingsRepository.listEngineReadings(db, userId, supplyId)).filter(
    (reading) => reading.billId === null || confirmedBillIds.has(reading.billId),
  );
  return { hasPhotovoltaic: supply.hasPhotovoltaic, kind: supply.kind, readings };
}

/**
 * The registers a new self reading should ask for. Banded F1/F2/F3 as soon as any counted
 * reading uses a band, the same rule by which the engine picks its registers: a 'single' self
 * reading on a supply with banded readings would never count in the readings consumption.
 */
export async function suggestedRegisters(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<ReadingRegister[]> {
  const { kind, hasPhotovoltaic, readings } = await listCountedReadings(db, userId, supplyId);
  const usesBands =
    kind === 'electricity' &&
    readings.some((r) => r.register === 'F1' || r.register === 'F2' || r.register === 'F3');
  const registers: ReadingRegister[] = usesBands ? ['F1', 'F2', 'F3'] : ['single'];
  return hasPhotovoltaic && kind === 'electricity'
    ? [...registers, 'feed_in', 'production']
    : registers;
}

/** For each register, the most recent counted reading (one per day, as the engine picks them). */
export async function latestReadings(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<Partial<Record<ReadingRegister, { value: number; readOn: IsoDate }>>> {
  const { readings } = await listCountedReadings(db, userId, supplyId);
  const latest: Partial<Record<ReadingRegister, { value: number; readOn: IsoDate }>> = {};
  // pickReadings sorts by day, oldest first: the last one seen for a register wins.
  for (const reading of pickReadings(readings)) {
    latest[reading.register] = { value: reading.value, readOn: reading.readOn };
  }
  return latest;
}
