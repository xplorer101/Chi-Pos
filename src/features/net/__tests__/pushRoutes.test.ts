/* eslint-disable import/first */
import { MIGRATIONS } from '@/db/migrations';
import { TestDb } from '@/db/__tests__/testDb';
import type { HttpRequest } from '../http';

jest.mock('@/lib/device', () => ({
  getDeviceId: async () => 'admin-device',
  peekDeviceId: () => 'admin-device',
}));

jest.mock('@/lib/id', () => {
  let n = 0;
  return { newId: () => `test-id-${n++}` };
});

jest.mock('@/db/index', () => ({
  getDb: () => (globalThis as unknown as { __testDb?: unknown }).__testDb,
}));

jest.mock('../tokens', () => ({
  generateClaimSecret: async () => 'claim',
  generateDeviceToken: async () => 'tok-new',
  generatePairingKey: async () => 'AAAA-BBBB',
  hashSecret: async (value: string) => value,
  safeEqual: (a: string | null, b: string | null) => a === b,
}));

import { createHandler } from '../routes';
import { getCustomerOwed } from '@/db/repositories/customersRepo';

const NOW = new Date(2026, 9, 11, 12, 0, 0, 0).getTime();

function seed(db: TestDb, tokenHash: string, userId: string, role: string): void {
  db.exec(
    `INSERT INTO users (id, name, role, is_active, created_at, updated_at, device_id)
     VALUES (?, 'Sara', ?, 1, ?, ?, 'admin')`,
    userId,
    role,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO devices (id, client_id, name, user_id, role, status, token_hash, created_at, updated_at)
     VALUES ('d1', 'c1', 'Till 1', ?, ?, 'approved', ?, ?, ?)`,
    userId,
    role,
    tokenHash,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO items (id, name, category, tracks_stock, low_stock_level, cost_price,
        selling_price, created_at, updated_at, device_id)
     VALUES ('i1', 'Rice', 'Staples', 1, 0, 100, 200, ?, ?, 'admin')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO item_units (id, item_id, unit_name, units_per_base, selling_price, is_base,
        sort_order, created_at, updated_at, device_id)
     VALUES ('u1', 'i1', 'Single', 1, 200, 1, 0, ?, ?, 'admin')`,
    NOW,
    NOW,
  );
}

function request(method: string, path: string, body?: unknown, token?: string): HttpRequest {
  return {
    method,
    path,
    headers: token ? { 'x-device-token': token } : {},
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

const META = { remoteAddress: '192.168.1.5', remotePort: 5555 };

const SALE_PAYLOAD = {
  saleId: 'sale-uuid-1',
  deviceId: 'cashier-device',
  soldAt: NOW,
  customerId: null,
  discount: 0,
  lines: [{ itemId: 'i1', unitId: 'u1', quantity: 2 }],
  payments: [{ method: 'cash', amount: 400 }],
};

describe('POST /sales', () => {
  let db: TestDb;
  let handler: ReturnType<typeof createHandler>;

  beforeEach(async () => {
    db = new TestDb();
    await db.apply(MIGRATIONS);
    seed(db, 'good-token', 'u-cashier', 'cashier');
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
    handler = createHandler({ getPairingKey: () => null });
  });

  afterEach(() => {
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = undefined;
  });

  it('rejects a request with no device token', async () => {
    const res = await handler(request('POST', '/sales', SALE_PAYLOAD), META);
    expect(res.status).toBe(401);
  });

  it('creates the sale once and replays idempotently by sale id', async () => {
    const first = await handler(request('POST', '/sales', SALE_PAYLOAD, 'good-token'), META);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, saleId: 'sale-uuid-1', receiptNo: '0001' });

    const second = await handler(request('POST', '/sales', SALE_PAYLOAD, 'good-token'), META);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ created: false, saleId: 'sale-uuid-1', receiptNo: '0001' });

    const sales = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sales');
    const lines = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM sale_lines');
    const movements = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM stock_movements');
    expect(sales[0].count).toBe(1);
    expect(lines[0].count).toBe(1);
    expect(movements[0].count).toBe(1);

    const movement = await db.getFirstAsync<{ quantity_base: number; device_id: string }>(
      'SELECT quantity_base, device_id FROM stock_movements',
    );
    expect(movement?.quantity_base).toBe(-2);
    expect(movement?.device_id).toBe('admin-device');

    const sale = await db.getFirstAsync<{ device_id: string; user_id: string }>(
      'SELECT device_id, user_id FROM sales',
    );
    expect(sale?.device_id).toBe('cashier-device');
    expect(sale?.user_id).toBe('u-cashier');
  });
});

describe('POST /debtor-payments', () => {
  let db: TestDb;
  let handler: ReturnType<typeof createHandler>;

  beforeEach(async () => {
    db = new TestDb();
    await db.apply(MIGRATIONS);
    seed(db, 'good-token', 'u-cashier', 'cashier');
    db.exec(
      `INSERT INTO customers (id, name, created_at, updated_at, device_id)
       VALUES ('c1', 'Ade', ?, ?, 'admin')`,
      NOW,
      NOW,
    );
    // A credit sale made this customer owe 500.
    db.exec(
      `INSERT INTO sales (id, receipt_no, customer_id, subtotal, discount, total, status, sold_at,
          user_id, created_at, updated_at, device_id)
       VALUES ('s-old', '0001', 'c1', 500, 0, 500, 'completed', ?, 'u-cashier', ?, ?, 'admin')`,
      NOW,
      NOW,
      NOW,
    );
    db.exec(
      `INSERT INTO payments (id, sale_id, customer_id, method, amount, paid_at, user_id,
          created_at, updated_at, device_id)
       VALUES ('p-credit', 's-old', 'c1', 'credit', 500, ?, 'u-cashier', ?, ?, 'admin')`,
      NOW,
      NOW,
      NOW,
    );
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
    handler = createHandler({ getPairingKey: () => null });
  });

  afterEach(() => {
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = undefined;
  });

  it('applies a payment once, even when pushed twice', async () => {
    const payload = {
      paymentId: 'pay-uuid-1',
      deviceId: 'cashier-device',
      customerId: 'c1',
      amount: 200,
      method: 'cash',
      paidAt: NOW,
      note: null,
    };

    const first = await handler(request('POST', '/debtor-payments', payload, 'good-token'), META);
    expect(first.status).toBe(201);

    const second = await handler(request('POST', '/debtor-payments', payload, 'good-token'), META);
    expect(second.status).toBe(201);

    const payments = await db.getAllAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM payments WHERE id = 'pay-uuid-1'",
    );
    expect(payments[0].count).toBe(1);

    expect(await getCustomerOwed('c1')).toBe(300);
  });
});
