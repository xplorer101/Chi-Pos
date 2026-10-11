import { assertPermission } from '@/features/auth/permissions';
import { customerDeleteBlocked } from '@/features/customers/customerDelete';

import { getDb } from '../index';
import {
  mapCustomerWithBalance,
  mapPayment,
  mapSale,
  type CustomerRow,
  type PaymentRow,
  type SaleRow,
} from '../mappers';
import { newRowMeta } from '../meta';
import { bumpRevision } from '../store';
import { recordAudit } from './auditRepo';
import type { ActingUser, Customer, CustomerWithBalance, Payment, Sale } from '../types';

/**
 * A customer's balance is derived, never stored:
 *   credit sales (payments with a sale) add to what they owe,
 *   debt payments (payments without a sale) reduce it.
 */
const OWED_SQL = `
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
`;

export type CustomerFilters = {
  search?: string;
  /**
   * Return only customers who owe money (balance > 0), sorted by how much
   * they owe (highest first) instead of by name.
   */
  owingOnly?: boolean;
};

export async function listCustomers(
  filters: CustomerFilters = {},
): Promise<CustomerWithBalance[]> {
  const db = getDb();
  const where: string[] = ['c.deleted_at IS NULL'];
  const params: string[] = [];

  const search = filters.search?.trim() ?? '';
  if (search) {
    where.push("(c.name LIKE ? OR COALESCE(c.phone, '') LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const orderBy =
    filters.owingOnly
      ? 'owed DESC, name COLLATE NOCASE ASC'
      : 'name COLLATE NOCASE ASC';

  const rows = await db.getAllAsync<CustomerRow>(
    `SELECT * FROM (
        SELECT c.*, ${OWED_SQL}
          FROM customers c
         WHERE ${where.join(' AND ')}
     )
     ${filters.owingOnly ? 'WHERE owed > 0' : ''}
     ORDER BY ${orderBy}`,
    ...params,
  );
  return rows.map(mapCustomerWithBalance);
}

export async function getCustomer(id: string): Promise<CustomerWithBalance | null> {
  const db = getDb();
  const row = await db.getFirstAsync<CustomerRow>(
    `SELECT c.*, ${OWED_SQL} FROM customers c WHERE c.id = ? AND c.deleted_at IS NULL`,
    id,
  );
  return row ? mapCustomerWithBalance(row) : null;
}

export async function getCustomerOwed(id: string): Promise<number> {
  const customer = await getCustomer(id);
  return customer?.owed ?? 0;
}

export async function createCustomer(
  actor: ActingUser,
  input: {
    name: string;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<Customer> {
  assertPermission(actor, 'manage_customers');
  const name = input.name.trim();
  if (!name) throw new Error('Customer name is required.');
  const meta = await newRowMeta();
  const db = getDb();
  await db.runAsync(
    `INSERT INTO customers (id, name, phone, notes, created_at, updated_at, deleted_at, device_id)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    meta.id,
    name,
    input.phone?.trim() || null,
    input.notes?.trim() || null,
    meta.now,
    meta.now,
    meta.deviceId,
  );
  bumpRevision();
  const created = await getCustomer(meta.id);
  return created!;
}

export async function updateCustomer(
  actor: ActingUser,
  id: string,
  input: { name: string; phone?: string | null; notes?: string | null },
): Promise<Customer> {
  assertPermission(actor, 'manage_customers');
  const name = input.name.trim();
  if (!name) throw new Error('Customer name is required.');
  const db = getDb();
  await db.runAsync(
    `UPDATE customers SET name = ?, phone = ?, notes = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    name,
    input.phone?.trim() || null,
    input.notes?.trim() || null,
    Date.now(),
    id,
  );
  bumpRevision();
  const updated = await getCustomer(id);
  return updated!;
}

export async function deleteCustomer(actor: ActingUser, id: string): Promise<void> {
  assertPermission(actor, 'delete_customer');
  const customer = await getCustomer(id);
  if (!customer) throw new Error('That customer no longer exists.');
  const blocked = customerDeleteBlocked(customer.owed);
  if (blocked) throw new Error(blocked);

  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    'UPDATE customers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    now,
    now,
    id,
  );
  await recordAudit({
    user: actor,
    action: 'customer_delete',
    entityType: 'customer',
    entityId: id,
    summary: `Deleted customer "${customer.name}"`,
  });
  bumpRevision();
}

export type CustomerHistoryEntry =
  | { kind: 'sale'; at: number; sale: Sale }
  | { kind: 'payment'; at: number; payment: Payment; saleReceiptNo: string | null };

/** Sales and debt payments for a customer, newest first. */
export async function getCustomerHistory(customerId: string): Promise<CustomerHistoryEntry[]> {
  const db = getDb();

  const saleRows = await db.getAllAsync<SaleRow>(
    `SELECT * FROM sales
      WHERE customer_id = ? AND deleted_at IS NULL
      ORDER BY sold_at DESC`,
    customerId,
  );
  const paymentRows = await db.getAllAsync<PaymentRow & { receipt_no: string | null }>(
    `SELECT p.*, s.receipt_no
       FROM payments p
       LEFT JOIN sales s ON s.id = p.sale_id
      WHERE p.customer_id = ? AND p.deleted_at IS NULL
      ORDER BY p.paid_at DESC`,
    customerId,
  );

  const sales: CustomerHistoryEntry[] = saleRows.map((row) => ({
    kind: 'sale',
    at: row.sold_at,
    sale: mapSale(row),
  }));
  const payments: CustomerHistoryEntry[] = paymentRows
    .filter((row) => row.sale_id === null)
    .map((row) => ({
      kind: 'payment',
      at: row.paid_at,
      payment: mapPayment(row),
      saleReceiptNo: row.receipt_no,
    }));

  return [...sales, ...payments].sort((a, b) => b.at - a.at);
}

export type DebtPaymentInput = {
  customerId: string;
  /** Amount in kobo. Partial payments are allowed. */
  amount: number;
  method: 'cash' | 'transfer' | 'pos';
  /** When the money was actually received. Defaults to now. */
  paidAt?: number;
  note?: string;
};

/** Record a payment against what a customer owes (reduces their balance). */
export async function recordDebtPayment(
  actor: ActingUser,
  input: DebtPaymentInput,
): Promise<void> {
  assertPermission(actor, 'record_debt_payment');
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  const paidAt = input.paidAt;
  if (paidAt != null && (!Number.isFinite(paidAt) || paidAt <= 0)) {
    throw new Error('Enter a valid payment date.');
  }
  const db = getDb();
  const owed = await getCustomerOwed(input.customerId);
  if (amount > owed) {
    throw new Error('Payment is more than this customer owes.');
  }

  const meta = await newRowMeta();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO payments
         (id, sale_id, customer_id, method, amount, paid_at, note,
          user_id, created_at, updated_at, deleted_at, device_id)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      meta.id,
      input.customerId,
      input.method,
      amount,
      paidAt ?? meta.now,
      input.note?.trim() || null,
      actor.id,
      meta.now,
      meta.now,
      meta.deviceId,
    );
  });
  bumpRevision();
}
