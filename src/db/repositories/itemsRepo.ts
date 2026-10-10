import { getDb } from '../index';
import {
  mapItemWithStock,
  mapMovement,
  mapUnit,
  type ItemRow,
  type ItemUnitRow,
  type StockMovementRow,
} from '../mappers';
import { newRowMeta } from '../meta';
import { bumpRevision } from '../store';
import type { Item, ItemUnit, ItemWithStock, StockMovement } from '../types';

export type ItemFilters = {
  search?: string;
  category?: string;
};

export type ItemUnitInput = {
  id?: string;
  unitName: string;
  unitsPerBase: number;
  sellingPrice: number;
  isBase?: boolean;
  sortOrder?: number;
  /** Barcode for this specific selling unit (unique across the business). */
  barcode?: string | null;
};

export type ItemInput = {
  name: string;
  category: string;
  tracksStock: boolean;
  lowStockLevel: number;
  costPrice: number;
  sellingPrice: number;
  units: ItemUnitInput[];
};

const STOCK_SELECT = `
  i.*,
  COALESCE((
    SELECT SUM(sm.quantity_base)
      FROM stock_movements sm
     WHERE sm.item_id = i.id AND sm.deleted_at IS NULL
  ), 0) AS stock
`;

/** List items with their derived stock level. */
export async function listItems(filters: ItemFilters = {}): Promise<ItemWithStock[]> {
  const db = getDb();
  const where: string[] = ['i.deleted_at IS NULL'];
  const params: (string | number)[] = [];

  const search = filters.search?.trim() ?? '';
  if (search) {
    where.push(`(
      i.name LIKE ?
      OR EXISTS (
        SELECT 1 FROM item_units u
         WHERE u.item_id = i.id
           AND u.deleted_at IS NULL
           AND u.barcode IS NOT NULL
           AND u.barcode <> ''
           AND u.barcode = ? COLLATE NOCASE
         LIMIT 1
      )
    )`);
    params.push(`%${search}%`, search);
  }
  const category = filters.category?.trim() ?? '';
  if (category) {
    where.push('i.category = ?');
    params.push(category);
  }

  const rows = await db.getAllAsync<ItemRow>(
    `SELECT ${STOCK_SELECT}
       FROM items i
      WHERE ${where.join(' AND ')}
      ORDER BY i.name COLLATE NOCASE ASC`,
    ...params,
  );
  return rows.map(mapItemWithStock);
}

/** All non-deleted items with stock, used by reports and the sell screen. */
export async function listAllItemsWithStock(): Promise<ItemWithStock[]> {
  return listItems();
}

export async function getItem(id: string): Promise<ItemWithStock | null> {
  const db = getDb();
  const row = await db.getFirstAsync<ItemRow>(
    `SELECT ${STOCK_SELECT} FROM items i WHERE i.id = ? AND i.deleted_at IS NULL`,
    id,
  );
  return row ? mapItemWithStock(row) : null;
}

export type BarcodeLookup = { item: ItemWithStock; unit: ItemUnit };

/**
 * Find a selling unit by its own barcode, together with its parent item.
 * Barcodes are unique per business across all units, so at most one unit matches.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookup | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;
  const db = getDb();
  const row = await db.getFirstAsync<ItemUnitRow>(
    `SELECT * FROM item_units
      WHERE deleted_at IS NULL
        AND barcode IS NOT NULL AND barcode <> ''
        AND barcode = ? COLLATE NOCASE
      LIMIT 1`,
    trimmed,
  );
  if (!row) return null;
  const unit = mapUnit(row);
  const item = await getItem(unit.itemId);
  return item ? { item, unit } : null;
}

export async function getCategories(): Promise<string[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ category: string }>(
    `SELECT DISTINCT category FROM items
      WHERE deleted_at IS NULL AND category != ''
      ORDER BY category COLLATE NOCASE ASC`,
  );
  return rows.map((r) => r.category);
}

export async function getItemUnits(itemId: string): Promise<ItemUnit[]> {
  const db = getDb();
  const rows = await db.getAllAsync<ItemUnitRow>(
    `SELECT * FROM item_units
      WHERE item_id = ? AND deleted_at IS NULL
      ORDER BY sort_order ASC, unit_name COLLATE NOCASE ASC`,
    itemId,
  );
  return rows.map(mapUnit);
}

/** Units for many items at once (avoids N+1 when rendering a list). */
export async function getUnitsForItems(itemIds: string[]): Promise<Map<string, ItemUnit[]>> {
  const result = new Map<string, ItemUnit[]>();
  if (itemIds.length === 0) return result;
  const db = getDb();
  const placeholders = itemIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<ItemUnitRow>(
    `SELECT * FROM item_units
      WHERE item_id IN (${placeholders}) AND deleted_at IS NULL
      ORDER BY sort_order ASC, unit_name COLLATE NOCASE ASC`,
    ...itemIds,
  );
  for (const row of rows) {
    const mapped = mapUnit(row);
    const list = result.get(mapped.itemId) ?? [];
    list.push(mapped);
    result.set(mapped.itemId, list);
  }
  return result;
}

type NormalisedUnit = {
  id?: string;
  unitName: string;
  unitsPerBase: number;
  sellingPrice: number;
  barcode: string | null;
  isBase: boolean;
  sortOrder: number;
};

function normaliseUnits(input: ItemUnitInput[], fallbackPrice: number): NormalisedUnit[] {
  const units = input
    .filter((u) => u.unitName.trim().length > 0)
    .map((u, index) => ({
      id: u.id,
      unitName: u.unitName.trim(),
      unitsPerBase: Math.max(1, Math.trunc(u.unitsPerBase || 1)),
      sellingPrice: Math.max(0, Math.round(u.sellingPrice || 0)),
      barcode: u.barcode?.trim().toUpperCase() || null,
      isBase: u.isBase === true,
      sortOrder: u.sortOrder ?? index,
    }));

  if (units.length === 0) {
    return [
      {
        id: undefined,
        unitName: 'Single',
        unitsPerBase: 1,
        sellingPrice: fallbackPrice,
        barcode: null,
        isBase: true,
        sortOrder: 0,
      },
    ];
  }

  const baseIndex = units.findIndex((u) => u.isBase);
  if (baseIndex === -1) {
    // Exactly one base unit is required: pick the smallest pack, else the first.
    let smallest = 0;
    units.forEach((u, i) => {
      if (u.unitsPerBase < units[smallest].unitsPerBase) smallest = i;
    });
    units[smallest].isBase = true;
  } else {
    units.forEach((u, i) => {
      u.isBase = i === baseIndex;
    });
  }
  return units;
}

/**
 * Every barcode is unique across all selling units in the business.
 * Throws a friendly error when a draft barcode is already in use.
 * `freedUnitIds` are units being edited away from a barcode this save, so their
 * barcode is available to reuse (moves between units, or units being deleted).
 */
async function assertUnitBarcodesUnique(
  units: { id?: string; barcode?: string | null }[],
  freedUnitIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  const claimed = new Set<string>();
  for (const unit of units) {
    const code = unit.barcode?.trim().toUpperCase();
    if (!code) continue;
    if (claimed.has(code)) {
      throw new Error(`Barcode ${code} is used by more than one unit.`);
    }
    claimed.add(code);
  }

  for (const unit of units) {
    const code = unit.barcode?.trim().toUpperCase();
    if (!code) continue;
    const existing = await lookupBarcode(code);
    if (!existing) continue;
    const isSameUnit = unit.id != null && existing.unit.id === unit.id;
    if (isSameUnit || freedUnitIds.has(existing.unit.id)) continue;
    throw new Error(`Barcode ${code} is already used by ${existing.item.name}.`);
  }
}

export async function createItem(input: ItemInput): Promise<Item> {
  const db = getDb();
  const meta = await newRowMeta();
  const units = normaliseUnits(input.units, input.sellingPrice);
  await assertUnitBarcodesUnique(units);
  const unitMetas = await Promise.all(units.map(() => newRowMeta()));

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO items
         (id, name, category, tracks_stock, low_stock_level, cost_price,
          selling_price, created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      meta.id,
      input.name.trim(),
      input.category.trim(),
      input.tracksStock ? 1 : 0,
      Math.max(0, Math.trunc(input.lowStockLevel || 0)),
      Math.max(0, Math.round(input.costPrice || 0)),
      Math.max(0, Math.round(input.sellingPrice || 0)),
      meta.now,
      meta.now,
      meta.deviceId,
    );
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      const unitMeta = unitMetas[i];
      await txn.runAsync(
        `INSERT INTO item_units
           (id, item_id, unit_name, units_per_base, selling_price, is_base, sort_order,
            barcode, created_at, updated_at, deleted_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        unitMeta.id,
        meta.id,
        unit.unitName,
        unit.unitsPerBase,
        unit.sellingPrice,
        unit.isBase ? 1 : 0,
        unit.sortOrder,
        unit.barcode,
        meta.now,
        meta.now,
        unitMeta.deviceId,
      );
    }
  });

  bumpRevision();
  const created = await getItem(meta.id);
  return created!;
}

export async function updateItem(id: string, input: ItemInput): Promise<Item> {
  const db = getDb();
  const now = Date.now();
  const units = normaliseUnits(input.units, input.sellingPrice);
  const existingUnits = await getItemUnits(id);
  const keptIds = new Set(units.map((u) => u.id).filter(Boolean));
  const freedUnitIds = new Set<string>();
  for (const old of existingUnits) {
    if (!keptIds.has(old.id)) freedUnitIds.add(old.id);
  }
  const draftBarcodeById = new Map<string, string | null>(
    units.flatMap((u) => (u.id ? [[u.id, u.barcode]] : [])),
  );
  for (const old of existingUnits) {
    if (draftBarcodeById.get(old.id) !== old.barcode) freedUnitIds.add(old.id);
  }
  await assertUnitBarcodesUnique(units, freedUnitIds);
  const newUnitMetas = await Promise.all(
    units.filter((u) => !u.id).map(() => newRowMeta()),
  );
  let newUnitIndex = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `UPDATE items
          SET name = ?, category = ?, tracks_stock = ?, low_stock_level = ?,
              cost_price = ?, selling_price = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      input.name.trim(),
      input.category.trim(),
      input.tracksStock ? 1 : 0,
      Math.max(0, Math.trunc(input.lowStockLevel || 0)),
      Math.max(0, Math.round(input.costPrice || 0)),
      Math.max(0, Math.round(input.sellingPrice || 0)),
      now,
      id,
    );

    const keptIds = new Set<string>();
    for (const unit of units) {
      if (unit.id) {
        keptIds.add(unit.id);
        await txn.runAsync(
          `UPDATE item_units
              SET unit_name = ?, units_per_base = ?, selling_price = ?, is_base = ?,
                  sort_order = ?, barcode = ?, updated_at = ?
            WHERE id = ? AND item_id = ?`,
          unit.unitName,
          unit.unitsPerBase,
          unit.sellingPrice,
          unit.isBase ? 1 : 0,
          unit.sortOrder,
          unit.barcode,
          now,
          unit.id,
          id,
        );
      } else {
        const unitMeta = newUnitMetas[newUnitIndex];
        newUnitIndex += 1;
        await txn.runAsync(
          `INSERT INTO item_units
             (id, item_id, unit_name, units_per_base, selling_price, is_base, sort_order,
              barcode, created_at, updated_at, deleted_at, device_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
          unitMeta.id,
          id,
          unit.unitName,
          unit.unitsPerBase,
          unit.sellingPrice,
          unit.isBase ? 1 : 0,
          unit.sortOrder,
          unit.barcode,
          now,
          now,
          unitMeta.deviceId,
        );
      }
    }

    for (const old of existingUnits) {
      if (!keptIds.has(old.id)) {
        await txn.runAsync(
          'UPDATE item_units SET deleted_at = ?, updated_at = ? WHERE id = ?',
          now,
          now,
          old.id,
        );
      }
    }
  });

  bumpRevision();
  const updated = await getItem(id);
  return updated!;
}

/** Soft-delete an item together with its units. Stock history is kept. */
export async function deleteItem(id: string): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      'UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
    await txn.runAsync(
      'UPDATE item_units SET deleted_at = ?, updated_at = ? WHERE item_id = ? AND deleted_at IS NULL',
      now,
      now,
      id,
    );
  });
  bumpRevision();
}

export type RestockInput = {
  itemId: string;
  /** Positive quantity in base units. */
  quantityBase: number;
  /** Cost per base unit in kobo. */
  unitCost: number;
  note?: string;
};

/**
 * Record a restock as a stock movement. The item's cost price follows the
 * last restock cost (last-cost valuation).
 */
export async function recordRestock(input: RestockInput): Promise<void> {
  const quantity = Math.trunc(input.quantityBase);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Restock quantity must be greater than zero.');
  }
  await recordMovement({
    itemId: input.itemId,
    type: 'restock',
    quantityBase: quantity,
    unitCost: Math.max(0, Math.round(input.unitCost || 0)),
    note: input.note?.trim() || null,
    updateCostPrice: true,
  });
}

export type AdjustmentInput = {
  itemId: string;
  /** Signed quantity in base units: positive adds stock, negative removes it. */
  quantityBase: number;
  reason: string;
  unitCost?: number;
};

/** Record a manual stock adjustment (damage, expiry, stocktake, theft...). */
export async function recordAdjustment(input: AdjustmentInput): Promise<void> {
  const quantity = Math.trunc(input.quantityBase);
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error('Adjustment quantity cannot be zero.');
  }
  if (!input.reason.trim()) {
    throw new Error('Please give a reason for the adjustment.');
  }
  await recordMovement({
    itemId: input.itemId,
    type: 'adjustment',
    quantityBase: quantity,
    unitCost: Math.max(0, Math.round(input.unitCost || 0)),
    note: input.reason.trim(),
    updateCostPrice: false,
  });
}

async function recordMovement(params: {
  itemId: string;
  type: 'restock' | 'adjustment';
  quantityBase: number;
  unitCost: number;
  note: string | null;
  updateCostPrice: boolean;
}): Promise<void> {
  const db = getDb();
  const meta = await newRowMeta();

  await db.withExclusiveTransactionAsync(async (txn) => {
    const item = await txn.getFirstAsync<{ id: string }>(
      'SELECT id FROM items WHERE id = ? AND deleted_at IS NULL',
      params.itemId,
    );
    if (!item) throw new Error('Item not found.');

    await txn.runAsync(
      `INSERT INTO stock_movements
         (id, item_id, type, quantity_base, unit_cost, reference_id, note,
          created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?)`,
      meta.id,
      params.itemId,
      params.type,
      params.quantityBase,
      params.unitCost,
      params.note,
      meta.now,
      meta.now,
      meta.deviceId,
    );

    if (params.updateCostPrice && params.unitCost > 0) {
      await txn.runAsync(
        'UPDATE items SET cost_price = ?, updated_at = ? WHERE id = ?',
        params.unitCost,
        meta.now,
        params.itemId,
      );
    }
  });

  bumpRevision();
}

export type StockMovementWithMeta = StockMovement & { itemName: string };

export async function listMovements(itemId: string, limit = 100): Promise<StockMovementWithMeta[]> {
  const db = getDb();
  const rows = await db.getAllAsync<StockMovementRow & { item_name: string }>(
    `SELECT sm.*, COALESCE(i.name, '') AS item_name
       FROM stock_movements sm
       LEFT JOIN items i ON i.id = sm.item_id
      WHERE sm.item_id = ? AND sm.deleted_at IS NULL
      ORDER BY sm.created_at DESC
      LIMIT ?`,
    itemId,
    limit,
  );
  return rows.map((row) => ({ ...mapMovement(row), itemName: row.item_name }));
}
