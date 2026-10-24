/**
 * Self readings: the meter values the person reads between bills. Readings printed on a bill
 * belong to the bill and change only by editing it.
 */
import { nanoid } from 'nanoid';
import type { Db } from '@/lib/db/create-db';
import type { ReadingRow } from '@/lib/db/repositories/readings';
import * as readingsRepository from '@/lib/db/repositories/readings';
import * as suppliesRepository from '@/lib/db/repositories/supplies';
import { SelfReadingInputSchema } from '@/lib/domain/bill-input';
import { allowedRegisters, type IsoDate, isMetered } from '@/lib/domain/types';
import { DomainError } from '@/lib/errors';

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
  const labelById = new Map(supplies.map((supply) => [supply.id, supply.label]));
  return rows.flatMap((row) => {
    const supplyLabel = labelById.get(row.supplyId);
    return supplyLabel === undefined ? [] : [{ ...row, supplyLabel }];
  });
}
