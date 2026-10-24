/**
 * App tables. Foreign keys are declared without ON DELETE CASCADE on purpose: remote Turso does
 * not enforce them, so services delete children explicitly, and local databases (which do
 * enforce them) make a forgotten delete fail in tests.
 *
 * WARNING: every table with user_id must also be deleted in src/lib/services/user-data.ts.
 */
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';
import type {
  Band,
  BillSource,
  BillStatus,
  IsoDate,
  LineCategory,
  LineComponent,
  QuantityUnit,
  ReadingRegister,
  ReadingSource,
  SupplyKind,
} from '@/lib/domain/types';
import { users } from './auth';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => nanoid());
const userId = () =>
  text('user_id')
    .notNull()
    .references(() => users.id);
const createdAt = () =>
  integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now());
const updatedAt = () =>
  integer('updated_at')
    .notNull()
    .$defaultFn(() => Date.now())
    .$onUpdate(() => Date.now());

export const houses = sqliteTable(
  'houses',
  {
    id: id(),
    userId: userId(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('houses_user_id_idx').on(t.userId)],
);

export const supplies = sqliteTable(
  'supplies',
  {
    id: id(),
    userId: userId(),
    houseId: text('house_id')
      .notNull()
      .references(() => houses.id),
    kind: text('kind').$type<SupplyKind>().notNull(),
    label: text('label').notNull(),
    supplierName: text('supplier_name'),
    identifier: text('identifier'),
    hasPhotovoltaic: integer('has_photovoltaic', { mode: 'boolean' }).notNull().default(false),
    archivedAt: integer('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('supplies_user_id_idx').on(t.userId),
    index('supplies_house_id_idx').on(t.houseId),
    uniqueIndex('supplies_user_identifier_uq').on(t.userId, t.identifier),
  ],
);

export const bills = sqliteTable(
  'bills',
  {
    id: id(),
    userId: userId(),
    supplyId: text('supply_id')
      .notNull()
      .references(() => supplies.id),
    status: text('status').$type<BillStatus>().notNull().default('confirmed'),
    replacedByBillId: text('replaced_by_bill_id').references((): AnySQLiteColumn => bills.id),
    periodStart: text('period_start').$type<IsoDate>().notNull(),
    periodEnd: text('period_end').$type<IsoDate>().notNull(),
    issueDate: text('issue_date').$type<IsoDate>(),
    dueDate: text('due_date').$type<IsoDate>(),
    supplierName: text('supplier_name'),
    offerName: text('offer_name'),
    totalCents: integer('total_cents').notNull(),
    amountDueCents: integer('amount_due_cents'),
    conversionFactor: real('conversion_factor'),
    calorificValueGj: real('calorific_value_gj'),
    isEstimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
    source: text('source').$type<BillSource>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('bills_user_id_idx').on(t.userId),
    index('bills_supply_period_idx').on(t.supplyId, t.periodStart),
  ],
);

export const billLines = sqliteTable(
  'bill_lines',
  {
    id: id(),
    userId: userId(),
    billId: text('bill_id')
      .notNull()
      .references(() => bills.id),
    position: integer('position').notNull(),
    description: text('description').notNull(),
    category: text('category').$type<LineCategory>().notNull(),
    component: text('component').$type<LineComponent>().notNull(),
    periodStart: text('period_start').$type<IsoDate>().notNull(),
    periodEnd: text('period_end').$type<IsoDate>().notNull(),
    quantity: real('quantity'),
    quantityUnit: text('quantity_unit').$type<QuantityUnit>(),
    unitPriceMicros: integer('unit_price_micros'),
    amountCents: integer('amount_cents').notNull(),
    band: text('band').$type<Band>(),
    isRecalculation: integer('is_recalculation', { mode: 'boolean' }).notNull().default(false),
    isEstimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
    vatRateBp: integer('vat_rate_bp'),
  },
  (t) => [
    index('bill_lines_user_id_idx').on(t.userId),
    index('bill_lines_bill_id_idx').on(t.billId),
  ],
);

export const meterReadings = sqliteTable(
  'meter_readings',
  {
    id: id(),
    userId: userId(),
    supplyId: text('supply_id')
      .notNull()
      .references(() => supplies.id),
    billId: text('bill_id').references(() => bills.id),
    readOn: text('read_on').$type<IsoDate>().notNull(),
    register: text('register').$type<ReadingRegister>().notNull(),
    value: real('value').notNull(),
    source: text('source').$type<ReadingSource>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('meter_readings_user_id_idx').on(t.userId),
    index('meter_readings_supply_read_on_idx').on(t.supplyId, t.readOn),
    index('meter_readings_bill_id_idx').on(t.billId),
  ],
);
