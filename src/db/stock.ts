/**
 * Pure stock maths.
 *
 * Stock is never a stored, overwritten number. It is always derived by summing
 * `stock_movements.quantity_base` (restocks positive, sales negative).
 */

export type MovementLike = {
  quantity_base: number;
  deleted_at?: number | null;
};

export type MovementWithItem = MovementLike & { item_id: string };

export type ItemLike = {
  id: string;
  tracks_stock?: boolean;
  low_stock_level?: number;
};

/** Sum signed base-unit movements into a current stock level. */
export function computeStock(movements: MovementLike[]): number {
  let stock = 0;
  for (const m of movements) {
    if (m.deleted_at != null) continue;
    if (typeof m.quantity_base === 'number' && Number.isFinite(m.quantity_base)) {
      stock += m.quantity_base;
    }
  }
  return stock;
}

/** Map of item id -> current stock for every item passed in. */
export function computeStockMap<T extends ItemLike>(
  items: T[],
  movements: MovementWithItem[],
): Map<string, number> {
  const stock = new Map<string, number>();
  for (const item of items) stock.set(item.id, 0);
  for (const m of movements) {
    if (m.deleted_at != null) continue;
    if (!stock.has(m.item_id)) continue;
    if (typeof m.quantity_base !== 'number' || !Number.isFinite(m.quantity_base)) continue;
    stock.set(m.item_id, (stock.get(m.item_id) ?? 0) + m.quantity_base);
  }
  return stock;
}

/** Stock level a cart would leave behind. `quantityBaseDelta` is negative for sales. */
export function projectStock(currentStock: number, quantityBaseDelta: number): number {
  return currentStock + quantityBaseDelta;
}

export type StockCheck =
  | { level: 'ok' }
  | { level: 'negative'; projected: number }
  | { level: 'low'; projected: number; threshold: number };

/**
 * Non-blocking stock check used by the sell screen: warn when a sale would go
 * negative or drop an item below its low-stock level, but never block.
 */
export function checkStock(
  item: ItemLike,
  currentStock: number,
  quantityBaseDelta: number,
): StockCheck {
  if (item.tracks_stock === false) return { level: 'ok' };
  const projected = projectStock(currentStock, quantityBaseDelta);
  if (projected < 0) return { level: 'negative', projected };
  const threshold = item.low_stock_level ?? 0;
  if (threshold > 0 && projected <= threshold) {
    return { level: 'low', projected, threshold };
  }
  return { level: 'ok' };
}

/** True when a tracked item is at or below its low-stock level. */
export function isLowStock(item: ItemLike, stock: number): boolean {
  if (item.tracks_stock === false) return false;
  return stock <= (item.low_stock_level ?? 0);
}
