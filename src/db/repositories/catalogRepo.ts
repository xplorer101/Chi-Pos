import type { SQLiteDatabase } from 'expo-sqlite';

import { getDeviceId } from '@/lib/device';

import { getDb } from '../index';
import type {
  CatalogBalance,
  CatalogCustomer,
  CatalogItem,
  CatalogSnapshot,
  CatalogStock,
  CatalogUnit,
} from '../types';

/**
 * The read-only catalog a cashier pulls from the admin host.
 *
 * The admin side reads straight from the authoritative items/units/movements.
 * The cashier side mirrors that data into its own items/item_units tables (so
 * the existing sell flow works unchanged) and snapshots derived stock into
 * `stock_snapshot`, which `STOCK_SELECT` falls back to when there are no local
 * movements. Cashiers never write items, units or movements themselves.
 */

const CATALOG_SYNCED_AT = 'catalog_synced_at';

// --- Admin side ---------------------------------------------------------

type ItemRow = {
  id: string;
  name: string;
  category: string;
  tracks_stock: number;
  low_stock_level: number;
  cost_price: number;
  selling_price: number;
  updated_at: number;
  deleted_at: number | null;
};

type UnitRow = {
  id: string;
  item_id: string;
  unit_name: string;
  units_per_base: number;
  selling_price: number;
  is_base: number;
  sort_order: number;
  barcode: string | null;
  updated_at: number;
  deleted_at: number | null;
};

/** Authoritative derived stock for every item that has movements. */
export async function readStock(): Promise<CatalogStock[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ item_id: string; quantity_base: number }>(
    `SELECT item_id, SUM(quantity_base) AS quantity_base
       FROM stock_movements
      WHERE deleted_at IS NULL
      GROUP BY item_id`,
  );
  return rows.map((row) => ({ itemId: row.item_id, quantityBase: row.quantity_base ?? 0 }));
}

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  updated_at: number;
  deleted_at: number | null;
};

/** Authoritative outstanding balance for every customer, derived from payments. */
export async function readBalances(): Promise<CatalogBalance[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ customer_id: string; owed: number }>(
    `SELECT c.id AS customer_id,
            COALESCE((
              SELECT SUM(
                CASE
                  WHEN p.sale_id IS NOT NULL AND p.method = 'credit' THEN p.amount
                  WHEN p.sale_id IS NULL THEN -p.amount
                  ELSE 0
                END
              )
              FROM payments p
              WHERE p.customer_id = c.id AND p.deleted_at IS NULL
            ), 0) AS owed
       FROM customers c
      WHERE c.deleted_at IS NULL`,
  );
  return rows.map((row) => ({ customerId: row.customer_id, owed: row.owed ?? 0 }));
}

/** Read everything changed after `since` (0 = full catalog) plus derived snapshots. */
export async function readCatalog(since: number): Promise<CatalogSnapshot> {
  const db = getDb();
  const [itemRows, unitRows, stock, customerRows, balances] = await Promise.all([
    db.getAllAsync<ItemRow>(
      `SELECT id, name, category, tracks_stock, low_stock_level, cost_price,
              selling_price, updated_at, deleted_at
         FROM items
        WHERE updated_at > ?
        ORDER BY updated_at ASC`,
      since,
    ),
    db.getAllAsync<UnitRow>(
      `SELECT id, item_id, unit_name, units_per_base, selling_price, is_base,
              sort_order, barcode, updated_at, deleted_at
         FROM item_units
        WHERE updated_at > ?
        ORDER BY updated_at ASC`,
      since,
    ),
    readStock(),
    db.getAllAsync<CustomerRow>(
      `SELECT id, name, phone, notes, updated_at, deleted_at
         FROM customers
        WHERE updated_at > ?
        ORDER BY updated_at ASC`,
      since,
    ),
    readBalances(),
  ]);

  const items: CatalogItem[] = itemRows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    tracksStock: row.tracks_stock === 1,
    lowStockLevel: row.low_stock_level,
    costPrice: row.cost_price,
    sellingPrice: row.selling_price,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));

  const units: CatalogUnit[] = unitRows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    unitName: row.unit_name,
    unitsPerBase: row.units_per_base,
    sellingPrice: row.selling_price,
    isBase: row.is_base === 1,
    sortOrder: row.sort_order,
    barcode: row.barcode,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));

  const customers: CatalogCustomer[] = customerRows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));

  return { serverTime: Date.now(), items, units, stock, customers, balances };
}

// --- Cashier side -------------------------------------------------------

async function applyItems(
  txn: SQLiteDatabase,
  items: CatalogItem[],
  deviceId: string,
): Promise<void> {
  const now = Date.now();
  for (const item of items) {
    await txn.runAsync(
      `INSERT INTO items
         (id, name, category, tracks_stock, low_stock_level, cost_price, selling_price,
          created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         category = excluded.category,
         tracks_stock = excluded.tracks_stock,
         low_stock_level = excluded.low_stock_level,
         cost_price = excluded.cost_price,
         selling_price = excluded.selling_price,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at`,
      item.id,
      item.name,
      item.category,
      item.tracksStock ? 1 : 0,
      item.lowStockLevel,
      item.costPrice,
      item.sellingPrice,
      now,
      item.updatedAt,
      item.deletedAt,
      deviceId,
    );
  }
}

async function applyUnits(
  txn: SQLiteDatabase,
  units: CatalogUnit[],
  incomingItemIds: ReadonlySet<string>,
  deviceId: string,
): Promise<void> {
  // A unit may arrive without its item when only the unit changed. Only apply it
  // when the parent item already exists locally, or it came in this same batch.
  const orphanCandidates = Array.from(
    new Set(units.filter((unit) => !incomingItemIds.has(unit.itemId)).map((unit) => unit.itemId)),
  );
  const knownItemIds = new Set(incomingItemIds);
  if (orphanCandidates.length > 0) {
    const db = getDb();
    const placeholders = orphanCandidates.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM items WHERE id IN (${placeholders})`,
      ...orphanCandidates,
    );
    for (const row of rows) knownItemIds.add(row.id);
  }

  const now = Date.now();
  for (const unit of units) {
    if (!knownItemIds.has(unit.itemId)) continue;
    await txn.runAsync(
      `INSERT INTO item_units
         (id, item_id, unit_name, units_per_base, selling_price, is_base, sort_order,
          barcode, created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         item_id = excluded.item_id,
         unit_name = excluded.unit_name,
         units_per_base = excluded.units_per_base,
         selling_price = excluded.selling_price,
         is_base = excluded.is_base,
         sort_order = excluded.sort_order,
         barcode = excluded.barcode,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at`,
      unit.id,
      unit.itemId,
      unit.unitName,
      unit.unitsPerBase,
      unit.sellingPrice,
      unit.isBase ? 1 : 0,
      unit.sortOrder,
      unit.barcode,
      now,
      unit.updatedAt,
      unit.deletedAt,
      deviceId,
    );
  }
}

async function applyCustomers(
  txn: SQLiteDatabase,
  customers: CatalogCustomer[],
  deviceId: string,
): Promise<void> {
  const now = Date.now();
  for (const customer of customers) {
    await txn.runAsync(
      `INSERT INTO customers (id, name, phone, notes, created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         notes = excluded.notes,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at`,
      customer.id,
      customer.name,
      customer.phone,
      customer.notes,
      now,
      customer.updatedAt,
      customer.deletedAt,
      deviceId,
    );
  }
}

/** Mirror an admin catalog snapshot into this cashier's local tables. */
export async function writeCatalog(snapshot: CatalogSnapshot): Promise<void> {
  const db = getDb();
  const deviceId = await getDeviceId();
  const incomingItemIds = new Set(snapshot.items.map((item) => item.id));

  await db.withExclusiveTransactionAsync(async (txn) => {
    await applyItems(txn, snapshot.items, deviceId);
    await applyUnits(txn, snapshot.units, incomingItemIds, deviceId);
    await applyCustomers(txn, snapshot.customers, deviceId);

    const syncedAt = Date.now();
    await txn.runAsync('DELETE FROM stock_snapshot');
    for (const row of snapshot.stock) {
      await txn.runAsync(
        `INSERT INTO stock_snapshot (item_id, quantity_base, synced_at) VALUES (?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET quantity_base = excluded.quantity_base, synced_at = excluded.synced_at`,
        row.itemId,
        row.quantityBase,
        syncedAt,
      );
    }

    await txn.runAsync('DELETE FROM customer_balance_snapshot');
    for (const row of snapshot.balances) {
      await txn.runAsync(
        `INSERT INTO customer_balance_snapshot (customer_id, owed, synced_at) VALUES (?, ?, ?)
         ON CONFLICT(customer_id) DO UPDATE SET owed = excluded.owed, synced_at = excluded.synced_at`,
        row.customerId,
        row.owed,
        syncedAt,
      );
    }
  });
}

export async function getCatalogSyncedAt(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_meta WHERE key = ?',
    CATALOG_SYNCED_AT,
  );
  const value = Number(row?.value ?? '0');
  return Number.isFinite(value) ? value : 0;
}

export async function setCatalogSyncedAt(timestamp: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    CATALOG_SYNCED_AT,
    String(timestamp),
    Date.now(),
  );
}
