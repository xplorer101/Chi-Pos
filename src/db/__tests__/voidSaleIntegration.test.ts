/* eslint-disable import/first */
import { MIGRATIONS } from '../migrations';
import { TestDb } from './testDb';
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

import { getCustomer } from '../repositories/customersRepo';
import { getItem } from '../repositories/itemsRepo';
import { voidSale } from '../repositories/salesRepo';

const NOW = new Date(2026, 9, 11, 12, 0, 0, 0).getTime();
const OWNER: ActingUser = { id: 'u-owner', name: 'Owner', role: 'owner' };

function seed(db: TestDb): void {
  db.exec(
    `INSERT INTO users (id, name, role, is_active, created_at, updated_at, device_id)
     VALUES (?, 'Owner', 'owner', 1, ?, ?, 'test')`,
    OWNER.id,
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
    `INSERT INTO item_units (id, item_id, unit_name, units_per_base, selling_price, is_base,
        sort_order, created_at, updated_at, device_id)
     VALUES ('iu1', 'i1', 'Single', 1, 200, 1, 0, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO customers (id, name, created_at, updated_at, device_id)
     VALUES ('c1', 'Ade', ?, ?, 'test')`,
    NOW,
    NOW,
  );

  // Opening stock of 10 base units.
  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, created_at,
        updated_at, device_id)
     VALUES ('sm-open', 'i1', 'restock', 10, 100, ?, ?, 'test')`,
    NOW,
    NOW,
  );

  // A 5-unit credit sale with a part payment: 400 cash + 600 credit = 1000.
  db.exec(
    `INSERT INTO sales (id, receipt_no, customer_id, subtotal, discount, total, status, sold_at,
        user_id, created_at, updated_at, device_id)
     VALUES ('s1', '0001', 'c1', 1000, 0, 1000, 'completed', ?, 'u-owner', ?, ?, 'test')`,
    NOW,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO sale_lines (id, sale_id, item_id, unit_id, unit_name, quantity, units_per_base,
        quantity_base, unit_price, line_total, unit_cost, created_at, updated_at, device_id)
     VALUES ('sl1', 's1', 'i1', 'iu1', 'Single', 5, 1, 5, 200, 1000, 100, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, reference_id,
        created_at, updated_at, device_id)
     VALUES ('sm-sale', 'i1', 'sale', -5, 100, 's1', ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO payments (id, sale_id, customer_id, method, amount, paid_at, user_id,
        created_at, updated_at, device_id)
     VALUES ('p1', 's1', 'c1', 'cash', 400, ?, 'u-owner', ?, ?, 'test')`,
    NOW,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO payments (id, sale_id, customer_id, method, amount, paid_at, user_id,
        created_at, updated_at, device_id)
     VALUES ('p2', 's1', 'c1', 'credit', 600, ?, 'u-owner', ?, ?, 'test')`,
    NOW,
    NOW,
    NOW,
  );
}

describe('voiding a part-payment credit sale', () => {
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

  it('returns the customer balance and stock exactly to their pre-sale values', async () => {
    const stockBefore = (await getItem('i1'))!.stock;
    const owedBefore = (await getCustomer('c1'))!.owed;
    expect(stockBefore).toBe(5);
    expect(owedBefore).toBe(600);

    const voided = await voidSale(OWNER, 's1', 'Customer changed their mind');
    expect(voided.status).toBe('voided');
    expect(voided.voidedByName).toBe('Owner');
    expect(voided.voidReason).toBe('Customer changed their mind');

    // Stock is back to the 10 units held before the sale.
    const stockAfter = (await getItem('i1'))!.stock;
    expect(stockAfter).toBe(10);
    expect(stockAfter).toBe(stockBefore + 5);

    // The 600 credit that was owed disappears, so the balance returns to zero.
    const owedAfter = (await getCustomer('c1'))!.owed;
    expect(owedAfter).toBe(0);
    expect(owedAfter).toBe(owedBefore - 600);

    // Both payments are soft-deleted, not hard-deleted.
    const livePayments = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM payments WHERE sale_id = ? AND deleted_at IS NULL',
      's1',
    );
    expect(livePayments?.c).toBe(0);
    const allPayments = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM payments WHERE sale_id = ?',
      's1',
    );
    expect(allPayments?.c).toBe(2);
  });

  it('writes one stock-adjustment movement per sold line to reverse the sale', async () => {
    await voidSale(OWNER, 's1', 'mistake');

    const adjustments = await db.getAllAsync<{ quantity_base: number; reference_id: string }>(
      "SELECT quantity_base, reference_id FROM stock_movements WHERE type = 'adjustment' AND reference_id = 's1'",
    );
    expect(adjustments).toEqual([{ quantity_base: 5, reference_id: 's1' }]);

    const total = await db.getFirstAsync<{ total: number }>(
      'SELECT SUM(quantity_base) AS total FROM stock_movements WHERE item_id = ? AND deleted_at IS NULL',
      'i1',
    );
    expect(total?.total).toBe(10);
  });
});
