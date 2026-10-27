/**
 * The people living in a house over time: a list of changes («dal <data> N persone»), each valid
 * until the next one. Typed by hand on «Forniture»; the dashboards read it for the marks on the
 * cost charts and the per-person tiles.
 */
import { nanoid } from 'nanoid';
import type { Db } from '@/lib/db/create-db';
import type { HouseholdSizeRow } from '@/lib/db/repositories/household-sizes';
import * as householdRepository from '@/lib/db/repositories/household-sizes';
import * as housesRepository from '@/lib/db/repositories/houses';
import { isIsoDate } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';
import { DomainError } from '@/lib/errors';
import { formatDate } from '@/lib/format';

export const MAX_PEOPLE = 20;
const PEOPLE_MESSAGE = `Le persone in casa sono un numero intero da 1 a ${MAX_PEOPLE}.`;
const DATE_MESSAGE = 'Data non valida.';
const FUTURE_MESSAGE = 'La data non può essere dopo oggi.';

export interface HouseholdSizeInput {
  houseId: string;
  validFrom: string;
  people: number;
}

async function assertHouse(db: Db, userId: string, houseId: string): Promise<void> {
  if (!(await housesRepository.getHouse(db, userId, houseId))) throw new DomainError('NOT_FOUND');
}

export async function listHousehold(
  db: Db,
  userId: string,
  houseId: string,
): Promise<HouseholdSizeRow[]> {
  await assertHouse(db, userId, houseId);
  return householdRepository.listHouseholdSizes(db, userId, houseId);
}

/** One change per house and day: a second one on the same day is refused, not merged. */
export async function addHouseholdSize(
  db: Db,
  userId: string,
  input: HouseholdSizeInput,
  options: { today: IsoDate },
): Promise<{ householdSizeId: string }> {
  await assertHouse(db, userId, input.houseId);
  const errors: string[] = [];
  if (!Number.isInteger(input.people) || input.people < 1 || input.people > MAX_PEOPLE) {
    errors.push(PEOPLE_MESSAGE);
  }
  if (!isIsoDate(input.validFrom)) errors.push(DATE_MESSAGE);
  else if (input.validFrom > options.today) errors.push(FUTURE_MESSAGE);
  if (errors.length > 0) throw new DomainError('VALIDATION', undefined, errors);

  const existing = await householdRepository.listHouseholdSizes(db, userId, input.houseId);
  if (existing.some((row) => row.validFrom === input.validFrom)) {
    throw new DomainError('VALIDATION', undefined, [
      `Dal ${formatDate(input.validFrom)} c'è già un numero di persone: elimina quello prima.`,
    ]);
  }
  const householdSizeId = nanoid();
  await householdRepository.insertHouseholdSizeQuery(db, userId, {
    id: householdSizeId,
    houseId: input.houseId,
    validFrom: input.validFrom,
    people: input.people,
  });
  return { householdSizeId };
}

export async function deleteHouseholdSize(
  db: Db,
  userId: string,
  householdSizeId: string,
): Promise<void> {
  if (!(await householdRepository.getHouseholdSize(db, userId, householdSizeId))) {
    throw new DomainError('NOT_FOUND');
  }
  await householdRepository.deleteHouseholdSizeQuery(db, userId, householdSizeId);
}
