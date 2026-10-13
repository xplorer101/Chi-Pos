/* eslint-disable import/first */
import { MIGRATIONS } from '../migrations';
import { TestDb } from './testDb';
import { PermissionError } from '@/features/auth/permissions';
import type { ActingUser } from '../types';

jest.mock('@/lib/device', () => ({
  getDeviceId: async () => 'test-device',
  peekDeviceId: () => 'test-device',
}));

jest.mock('@/lib/id', () => {
  let n = 0;
  return { newId: () => `test-id-${n++}` };
});

jest.mock('@/db/index', () => ({
  getDb: () => (globalThis as unknown as { __testDb?: unknown }).__testDb,
}));

import { adminSetPin } from '../repositories/usersRepo';
import { deleteCustomer, recordDebtPayment } from '../repositories/customersRepo';
import { deleteItem, recordAdjustment } from '../repositories/itemsRepo';
import { getReport } from '../repositories/reportsRepo';
import { listSales, voidSale } from '../repositories/salesRepo';

const NOW = new Date(2026, 9, 11, 12, 0, 0, 0).getTime();
const OWNER: ActingUser = { id: 'u-owner', name: 'Owner', role: 'owner' };
const CASHIER: ActingUser = { id: 'u-cashier', name: 'Gift', role: 'cashier' };

function seed(db: TestDb): void {
  db.exec(
    `INSERT INTO users (id, name, role, is_active, created_at, updated_at, device_id)
     VALUES ('u-owner', 'Owner', 'owner', 1, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO items (id, name, category, tracks_stock, low_stock_level, cost_price,
        selling_price, created_at, updated_at, device_id)
     VALUES ('i1', 'Bag of rice', 'Staples', 1, 2, 100, 200, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO customers (id, name, created_at, updated_at, device_id)
     VALUES ('c1', 'Ade', ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO sales (id, receipt_no, customer_id, subtotal, discount, total, status, sold_at,
        user_id, created_at, updated_at, device_id)
     VALUES ('s1', '0001', 'c1', 200, 0, 200, 'completed', ?, 'u-cashier', ?, ?, 'test')`,
    NOW,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO payments (id, sale_id, customer_id, method, amount, paid_at, user_id,
        created_at, updated_at, device_id)
     VALUES ('p1', 's1', 'c1', 'credit', 200, ?, 'u-cashier', ?, ?, 'test')`,
    NOW,
    NOW,
    NOW,
  );
}

describe('cashier calling owner-only repository functions directly', () => {
  let db: TestDb;

  beforeEach(async () => {
    db = new TestDb();
    await db.apply(MIGRATIONS);
    seed(db);
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
  });

  afterEach(() => {
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = undefined;
  });

  it('refuses voidSale and leaves the sale untouched (UI bypassed)', async () => {
    await expect(voidSale(CASHIER, 's1', 'not allowed')).rejects.toBeInstanceOf(PermissionError);

    const sale = await db.getFirstAsync<{ status: string; void_reason: string | null }>(
      'SELECT status, void_reason FROM sales WHERE id = ?',
      's1',
    );
    expect(sale).toEqual({ status: 'completed', void_reason: null });
  });

  it('refuses reports, item management, stock, staff and customer deletion', async () => {
    await expect(getReport(CASHIER, 0, NOW)).rejects.toBeInstanceOf(PermissionError);
    await expect(deleteItem(CASHIER, 'i1')).rejects.toBeInstanceOf(PermissionError);
    await expect(
      recordAdjustment(CASHIER, { itemId: 'i1', quantityBase: -1, reason: 'test' }),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(adminSetPin(CASHIER, 'u-owner', '1234')).rejects.toBeInstanceOf(PermissionError);
    await expect(deleteCustomer(CASHIER, 'c1')).rejects.toBeInstanceOf(PermissionError);

    const item = await db.getFirstAsync<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM items WHERE id = ?',
      'i1',
    );
    const customer = await db.getFirstAsync<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM customers WHERE id = ?',
      'c1',
    );
    expect(item?.deleted_at).toBeNull();
    expect(customer?.deleted_at).toBeNull();
  });

  it('refuses a cashier asking to view another seller\u2019s sales', async () => {
    await expect(listSales(CASHIER, { userId: OWNER.id })).rejects.toBeInstanceOf(PermissionError);
    await expect(listSales(CASHIER, { userId: CASHIER.id })).resolves.toBeDefined();
  });

  it('still allows the day-to-day cashier permissions', async () => {
    await expect(
      recordDebtPayment(CASHIER, { customerId: 'c1', amount: 100, method: 'cash' }),
    ).resolves.toBeUndefined();
  });
});
