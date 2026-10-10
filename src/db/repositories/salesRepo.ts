import { cartTotals, validatePaymentSplit, type CartLine } from '@/features/sell/cart';

import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '../index';
import {
  mapPayment,
  mapSale,
  mapSaleLine,
  type PaymentRow,
  type SaleLineRow,
  type SaleRow,
} from '../mappers';
import { newRowMeta } from '../meta';
import { bumpRevision } from '../store';
import type { PaymentMethod, Sale, SaleWithDetails } from '../types';

export type SaleLineInput = {
  itemId: string;
  unitId: string | null;
  quantity: number;
};

export type SalePaymentInput = {
  method: PaymentMethod;
  amount: number;
};

export type CreateSaleInput = {
  customerId?: string | null;
  /** Discount in kobo, clamped to the subtotal. */
  discount?: number;
  lines: SaleLineInput[];
  payments: SalePaymentInput[];
  /** Business time of the sale. Defaults to now. */
  soldAt?: number;
};

export class SaleError extends Error {}

/** Next sequential receipt number, e.g. `0001`. Call inside the sale transaction. */
async function nextReceiptNo(txn: Pick<SQLiteDatabase, 'getFirstAsync'>): Promise<string> {
  const row = await txn.getFirstAsync<{ receipt_no: string }>(
    "SELECT receipt_no FROM sales WHERE deleted_at IS NULL AND receipt_no GLOB '[0-9]*' ORDER BY CAST(receipt_no AS INTEGER) DESC LIMIT 1",
  );
  const last = row ? Number.parseInt(row.receipt_no, 10) : 0;
  const next = Number.isFinite(last) ? last + 1 : 1;
  return String(next).padStart(4, '0');
}

/**
 * Create a sale atomically.
 *
 * The sale row, its lines, its payments and the resulting stock movements are
 * written inside a single exclusive transaction: a crash mid-way rolls the
 * whole thing back, so the database never holds a partial sale.
 */
export async function createSale(input: CreateSaleInput): Promise<SaleWithDetails> {
  const db = getDb();
  const meta = await newRowMeta();
  const soldAt = input.soldAt ?? meta.now;
  const discount = Math.max(0, Math.round(input.discount || 0));

  if (!input.lines.length) {
    throw new SaleError('Add at least one item to the sale.');
  }

  let saleId = '';

  const lineMetas = await Promise.all(
    input.lines.map(async () => ({ line: await newRowMeta(), movement: await newRowMeta() })),
  );
  const paymentMetas = await Promise.all(
    input.payments
      .filter((p) => Math.round(p.amount) > 0)
      .map(() => newRowMeta()),
  );

  await db.withExclusiveTransactionAsync(async (txn) => {
    type ResolvedLine = CartLine & {
      unitId: string | null;
      itemId: string;
      itemName: string;
      tracksStock: boolean;
      quantityBase: number;
      lineTotal: number;
    };

    const resolved: ResolvedLine[] = [];
    for (const line of input.lines) {
      const quantity = Math.trunc(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new SaleError('Quantities must be greater than zero.');
      }

      const item = await txn.getFirstAsync<{
        id: string;
        name: string;
        tracks_stock: number;
        cost_price: number;
        selling_price: number;
      }>(
        'SELECT id, name, tracks_stock, cost_price, selling_price FROM items WHERE id = ? AND deleted_at IS NULL',
        line.itemId,
      );
      if (!item) throw new SaleError('An item in this sale no longer exists.');

      let unitPrice = item.selling_price;
      let unitsPerBase = 1;
      let unitName = 'Single';

      if (line.unitId) {
        const unit = await txn.getFirstAsync<{
          unit_name: string;
          units_per_base: number;
          selling_price: number;
        }>(
          'SELECT unit_name, units_per_base, selling_price FROM item_units WHERE id = ? AND item_id = ? AND deleted_at IS NULL',
          line.unitId,
          line.itemId,
        );
        if (unit) {
          unitPrice = unit.selling_price;
          unitsPerBase = Math.max(1, unit.units_per_base);
          unitName = unit.unit_name;
        }
      }

      const lineTotal = quantity * unitPrice;
      const quantityBase = quantity * unitsPerBase;

      resolved.push({
        itemId: item.id,
        itemName: item.name,
        unitId: line.unitId,
        unitName,
        quantity,
        unitsPerBase,
        unitPrice,
        unitCost: item.cost_price,
        tracksStock: item.tracks_stock === 1,
        quantityBase,
        lineTotal,
      });
    }

    const totals = cartTotals(resolved, discount);

    const payments: SalePaymentInput[] = input.payments
      .filter((p) => Math.round(p.amount) > 0)
      .map((p) => ({ method: p.method, amount: Math.round(p.amount) }));

    const validation = validatePaymentSplit(payments, totals.total, Boolean(input.customerId));
    if (!validation.ok) throw new SaleError(validation.error);

    if (input.customerId) {
      const customer = await txn.getFirstAsync<{ id: string }>(
        'SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL',
        input.customerId,
      );
      if (!customer) throw new SaleError('Selected customer no longer exists.');
    }

    const receiptNo = await nextReceiptNo(txn);
    saleId = meta.id;

    await txn.runAsync(
      `INSERT INTO sales
         (id, receipt_no, customer_id, subtotal, discount, total, status, sold_at,
          created_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, NULL, ?)`,
      saleId,
      receiptNo,
      input.customerId ?? null,
      totals.subtotal,
      totals.discount,
      totals.total,
      soldAt,
      meta.now,
      meta.now,
      meta.deviceId,
    );

    for (let i = 0; i < resolved.length; i += 1) {
      const line = resolved[i];
      const lineMeta = lineMetas[i].line;
      await txn.runAsync(
        `INSERT INTO sale_lines
           (id, sale_id, item_id, unit_id, unit_name, quantity, units_per_base,
            quantity_base, unit_price, line_total, unit_cost,
            created_at, updated_at, deleted_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        lineMeta.id,
        saleId,
        line.itemId,
        line.unitId,
        line.unitName,
        line.quantity,
        line.unitsPerBase,
        line.quantityBase,
        line.unitPrice,
        line.lineTotal,
        line.unitCost,
        lineMeta.now,
        lineMeta.now,
        lineMeta.deviceId,
      );

      if (line.tracksStock) {
        const movementMeta = lineMetas[i].movement;
        await txn.runAsync(
          `INSERT INTO stock_movements
             (id, item_id, type, quantity_base, unit_cost, reference_id, note,
              created_at, updated_at, deleted_at, device_id)
           VALUES (?, ?, 'sale', ?, ?, ?, NULL, ?, ?, NULL, ?)`,
          movementMeta.id,
          line.itemId,
          -line.quantityBase,
          line.unitCost,
          saleId,
          movementMeta.now,
          movementMeta.now,
          movementMeta.deviceId,
        );
      }
    }

    for (let i = 0; i < payments.length; i += 1) {
      const payment = payments[i];
      const paymentMeta = paymentMetas[i];
      await txn.runAsync(
        `INSERT INTO payments
           (id, sale_id, customer_id, method, amount, paid_at, note,
            created_at, updated_at, deleted_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?)`,
        paymentMeta.id,
        saleId,
        input.customerId ?? null,
        payment.method,
        payment.amount,
        soldAt,
        paymentMeta.now,
        paymentMeta.now,
        paymentMeta.deviceId,
      );
    }
  });

  bumpRevision();
  const sale = await getSaleWithDetails(saleId);
  if (!sale) throw new SaleError('Sale could not be read back.');
  return sale;
}

export async function getSaleWithDetails(id: string): Promise<SaleWithDetails | null> {
  const db = getDb();
  const row = await db.getFirstAsync<SaleRow & { customer_name: string | null }>(
    `SELECT s.*, c.name AS customer_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = ? AND s.deleted_at IS NULL`,
    id,
  );
  if (!row) return null;

  const lineRows = await db.getAllAsync<SaleLineRow>(
    `SELECT sl.*, COALESCE(i.name, '') AS item_name
       FROM sale_lines sl
       LEFT JOIN items i ON i.id = sl.item_id
      WHERE sl.sale_id = ? AND sl.deleted_at IS NULL
      ORDER BY sl.created_at ASC`,
    id,
  );
  const paymentRows = await db.getAllAsync<PaymentRow>(
    'SELECT * FROM payments WHERE sale_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
    id,
  );

  return {
    ...mapSale(row),
    customerName: row.customer_name,
    lines: lineRows.map(mapSaleLine),
    payments: paymentRows.map(mapPayment),
  };
}

export type SaleListItem = Sale & { customerName: string | null; itemCount: number };

export async function listSales(options: {
  start?: number;
  end?: number;
  limit?: number;
}): Promise<SaleListItem[]> {
  const db = getDb();
  const where: string[] = ['s.deleted_at IS NULL'];
  const params: number[] = [];

  if (options.start != null) {
    where.push('s.sold_at >= ?');
    params.push(options.start);
  }
  if (options.end != null) {
    where.push('s.sold_at <= ?');
    params.push(options.end);
  }

  const rows = await db.getAllAsync<
    SaleRow & { customer_name: string | null; item_count: number }
  >(
    `SELECT s.*, c.name AS customer_name,
            (SELECT COUNT(*) FROM sale_lines sl
              WHERE sl.sale_id = s.id AND sl.deleted_at IS NULL) AS item_count
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.sold_at DESC
      LIMIT ?`,
    ...params,
    options.limit ?? 100,
  );

  return rows.map((row) => ({
    ...mapSale(row),
    customerName: row.customer_name,
    itemCount: row.item_count,
  }));
}
