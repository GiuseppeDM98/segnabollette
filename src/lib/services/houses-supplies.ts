/**
 * Houses and their supplies. Deleting either removes everything under it explicitly, children
 * before parents, in one batch: the app tables have no ON DELETE CASCADE (remote Turso does not
 * enforce foreign keys), and archived supplies and replaced bills are deleted like the others.
 */
import type { BatchItem } from 'drizzle-orm/batch';
import { nanoid } from 'nanoid';
import type { Db } from '@/lib/db/create-db';
import * as billsRepository from '@/lib/db/repositories/bills';
import type { HouseRow } from '@/lib/db/repositories/houses';
import * as housesRepository from '@/lib/db/repositories/houses';
import * as readingsRepository from '@/lib/db/repositories/readings';
import type { SupplyRow } from '@/lib/db/repositories/supplies';
import * as suppliesRepository from '@/lib/db/repositories/supplies';
import { normalizeSupplyIdentifier, SUPPLY_KINDS, type SupplyKind } from '@/lib/domain/types';
import { DomainError } from '@/lib/errors';
import { runBatch } from './batch';

const NAME_MAX_LENGTH = 60;
const HOUSE_NAME_MESSAGE = 'Il nome della casa deve avere da 1 a 60 caratteri.';
const SUPPLY_LABEL_MESSAGE = 'Il nome della fornitura deve avere da 1 a 60 caratteri.';
const PHOTOVOLTAIC_MESSAGE = 'Il fotovoltaico vale solo per la luce.';

export interface SupplyInput {
  houseId: string;
  kind: SupplyKind;
  label: string;
  supplierName: string | null;
  identifier: string | null;
  hasPhotovoltaic: boolean;
}

export type SupplyPatchInput = Partial<
  Pick<SupplyInput, 'houseId' | 'label' | 'supplierName' | 'identifier' | 'hasPhotovoltaic'>
>;

function isValidName(name: string): boolean {
  return name.length >= 1 && name.length <= NAME_MAX_LENGTH;
}

function houseName(raw: string): string {
  const name = raw.trim();
  if (!isValidName(name)) throw new DomainError('VALIDATION', undefined, [HOUSE_NAME_MESSAGE]);
  return name;
}

function blankToNull(raw: string | null): string | null {
  const value = raw?.trim() ?? '';
  return value === '' ? null : value;
}

function normalizedIdentifier(raw: string | null): string | null {
  const identifier = raw === null ? '' : normalizeSupplyIdentifier(raw);
  return identifier === '' ? null : identifier;
}

async function getHouseOrThrow(db: Db, userId: string, houseId: string) {
  const house = await housesRepository.getHouse(db, userId, houseId);
  if (!house) throw new DomainError('NOT_FOUND');
  return house;
}

async function getSupplyOrThrow(db: Db, userId: string, supplyId: string) {
  const supply = await suppliesRepository.getSupply(db, userId, supplyId);
  if (!supply) throw new DomainError('NOT_FOUND');
  return supply;
}

/** A supply's identifier is unique per user; `exceptSupplyId` is the supply being edited. */
async function assertIdentifierFree(
  db: Db,
  userId: string,
  identifier: string | null,
  exceptSupplyId?: string,
): Promise<void> {
  if (identifier === null) return;
  const existing = await suppliesRepository.getSupplyByIdentifier(db, userId, identifier);
  if (existing && existing.id !== exceptSupplyId) throw new DomainError('DUPLICATE_IDENTIFIER');
}

/** The delete queries for supplies and everything under them, children first. */
async function deleteSuppliesQueries(
  db: Db,
  userId: string,
  supplyIds: string[],
): Promise<BatchItem<'sqlite'>[]> {
  if (supplyIds.length === 0) return [];
  const billIds = await billsRepository.listBillIdsOfSupplies(db, userId, supplyIds);
  const queries: BatchItem<'sqlite'>[] = [
    readingsRepository.deleteReadingsOfSuppliesQuery(db, userId, supplyIds),
  ];
  if (billIds.length > 0) {
    queries.push(
      billsRepository.deleteBillLinesQuery(db, userId, billIds),
      // Clears replaced_by_bill_id first: a bill pointing at another one would block its delete.
      billsRepository.restoreReplacedQuery(db, userId, billIds),
      billsRepository.deleteBillsQuery(db, userId, billIds),
    );
  }
  queries.push(suppliesRepository.deleteSuppliesQuery(db, userId, supplyIds));
  return queries;
}

export async function createHouse(
  db: Db,
  userId: string,
  input: { name: string },
): Promise<{ houseId: string }> {
  const houseId = nanoid();
  await housesRepository.insertHouseQuery(db, userId, { id: houseId, name: houseName(input.name) });
  return { houseId };
}

export async function renameHouse(
  db: Db,
  userId: string,
  houseId: string,
  name: string,
): Promise<void> {
  await getHouseOrThrow(db, userId, houseId);
  await housesRepository.renameHouseQuery(db, userId, houseId, houseName(name));
}

/** Files on Blob arrive later: the list is always empty for now. */
export async function deleteHouse(
  db: Db,
  userId: string,
  houseId: string,
): Promise<{ documentPathnames: string[] }> {
  await getHouseOrThrow(db, userId, houseId);
  const supplies = await suppliesRepository.listSupplies(db, userId, {
    houseId,
    includeArchived: true,
  });
  const queries = await deleteSuppliesQueries(
    db,
    userId,
    supplies.map((supply) => supply.id),
  );
  queries.push(housesRepository.deleteHouseQuery(db, userId, houseId));
  await runBatch(db, queries);
  return { documentPathnames: [] };
}

export async function createSupply(
  db: Db,
  userId: string,
  input: SupplyInput,
): Promise<{ supplyId: string }> {
  await getHouseOrThrow(db, userId, input.houseId);
  const label = input.label.trim();
  const errors: string[] = [];
  if (!isValidName(label)) errors.push(SUPPLY_LABEL_MESSAGE);
  if (input.hasPhotovoltaic && input.kind !== 'electricity') errors.push(PHOTOVOLTAIC_MESSAGE);
  if (errors.length > 0) throw new DomainError('VALIDATION', undefined, errors);
  const identifier = normalizedIdentifier(input.identifier);
  await assertIdentifierFree(db, userId, identifier);

  const supplyId = nanoid();
  await suppliesRepository.insertSupplyQuery(db, userId, {
    id: supplyId,
    houseId: input.houseId,
    kind: input.kind,
    label,
    supplierName: blankToNull(input.supplierName),
    identifier,
    hasPhotovoltaic: input.hasPhotovoltaic,
  });
  return { supplyId };
}

/** The kind of a supply never changes. */
export async function updateSupply(
  db: Db,
  userId: string,
  supplyId: string,
  patch: SupplyPatchInput,
): Promise<void> {
  const supply = await getSupplyOrThrow(db, userId, supplyId);
  if (patch.houseId !== undefined) await getHouseOrThrow(db, userId, patch.houseId);

  const changes: suppliesRepository.SupplyPatch = {};
  const errors: string[] = [];
  if (patch.houseId !== undefined) changes.houseId = patch.houseId;
  if (patch.label !== undefined) {
    changes.label = patch.label.trim();
    if (!isValidName(changes.label)) errors.push(SUPPLY_LABEL_MESSAGE);
  }
  if (patch.supplierName !== undefined) changes.supplierName = blankToNull(patch.supplierName);
  if (patch.hasPhotovoltaic !== undefined) {
    changes.hasPhotovoltaic = patch.hasPhotovoltaic;
    if (patch.hasPhotovoltaic && supply.kind !== 'electricity') errors.push(PHOTOVOLTAIC_MESSAGE);
  }
  if (errors.length > 0) throw new DomainError('VALIDATION', undefined, errors);
  if (patch.identifier !== undefined) {
    changes.identifier = normalizedIdentifier(patch.identifier);
    await assertIdentifierFree(db, userId, changes.identifier, supplyId);
  }

  if (Object.keys(changes).length === 0) return;
  await suppliesRepository.updateSupplyQuery(db, userId, supplyId, changes);
}

export async function archiveSupply(
  db: Db,
  userId: string,
  supplyId: string,
  options: { archived: boolean; now: number },
): Promise<void> {
  await getSupplyOrThrow(db, userId, supplyId);
  await suppliesRepository.updateSupplyQuery(db, userId, supplyId, {
    archivedAt: options.archived ? options.now : null,
  });
}

/** Files on Blob arrive later: the list is always empty for now. */
export async function deleteSupply(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<{ documentPathnames: string[] }> {
  await getSupplyOrThrow(db, userId, supplyId);
  await runBatch(db, await deleteSuppliesQueries(db, userId, [supplyId]));
  return { documentPathnames: [] };
}

/** Archived supplies last, then by kind in the app's order (electricity first), then by label. */
function compareSupplies(a: SupplyRow, b: SupplyRow): number {
  const archived = Number(a.archivedAt !== null) - Number(b.archivedAt !== null);
  if (archived !== 0) return archived;
  const kind = SUPPLY_KINDS.indexOf(a.kind) - SUPPLY_KINDS.indexOf(b.kind);
  if (kind !== 0) return kind;
  return a.label.localeCompare(b.label, 'it');
}

/** Every house of the user by name, each with its supplies (archived ones only on request). */
export async function listHousesWithSupplies(
  db: Db,
  userId: string,
  options: { includeArchived: boolean },
): Promise<Array<{ house: HouseRow; supplies: SupplyRow[] }>> {
  const houses = await housesRepository.listHouses(db, userId);
  const supplies = await suppliesRepository.listSupplies(db, userId, {
    includeArchived: options.includeArchived,
  });
  return [...houses]
    .sort((a, b) => a.name.localeCompare(b.name, 'it'))
    .map((house) => ({
      house,
      supplies: supplies.filter((supply) => supply.houseId === house.id).sort(compareSupplies),
    }));
}

export async function getSupplyDetail(
  db: Db,
  userId: string,
  supplyId: string,
): Promise<{ supply: SupplyRow; house: HouseRow }> {
  const supply = await getSupplyOrThrow(db, userId, supplyId);
  const house = await getHouseOrThrow(db, userId, supply.houseId);
  return { supply, house };
}

async function listTargetSupplies(
  db: Db,
  userId: string,
  target: { houseId: string } | { supplyId: string },
): Promise<SupplyRow[]> {
  if ('supplyId' in target) return [await getSupplyOrThrow(db, userId, target.supplyId)];
  await getHouseOrThrow(db, userId, target.houseId);
  return suppliesRepository.listSupplies(db, userId, {
    houseId: target.houseId,
    includeArchived: true,
  });
}

/**
 * What a delete would remove, for the confirmation dialog: supplies (archived included), bills
 * in any status, and every reading (printed on a bill or self-read).
 */
export async function getDeletionSummary(
  db: Db,
  userId: string,
  target: { houseId: string } | { supplyId: string },
): Promise<{ supplies: number; bills: number; readings: number }> {
  const supplyIds = (await listTargetSupplies(db, userId, target)).map((supply) => supply.id);
  const billIds = await billsRepository.listBillIdsOfSupplies(db, userId, supplyIds);
  const readingCounts = await Promise.all(
    supplyIds.map(
      async (supplyId) =>
        (await readingsRepository.listEngineReadings(db, userId, supplyId)).length,
    ),
  );
  return {
    supplies: supplyIds.length,
    bills: billIds.length,
    readings: readingCounts.reduce((sum, count) => sum + count, 0),
  };
}
