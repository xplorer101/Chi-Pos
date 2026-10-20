/* eslint-disable import/first */
import { MIGRATIONS } from '@/db/migrations';
import { TestDb } from '@/db/__tests__/testDb';
import type { HttpRequest } from '../http';

jest.mock('@/lib/device', () => ({
  getDeviceId: async () => 'cashier-device',
  peekDeviceId: () => 'cashier-device',
}));

jest.mock('@/lib/id', () => {
  let n = 0;
  return { newId: () => `push-id-${n++}` };
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

// The client's transport is swapped for a direct call into the admin handler,
// with the admin database active for the duration of the request.
jest.mock('../tcp', () => ({
  httpRequest: (options: unknown) =>
    (globalThis as unknown as { __mockHttpRequest: (o: unknown) => Promise<unknown> }).__mockHttpRequest(options),
  isTcpAvailable: () => true,
  createHttpServer: () => ({ listen: () => {}, stop: () => {} }),
}));

jest.mock('../pairing', () => ({
  getPairing: async () => ({
    host: '192.168.1.10',
    port: 8799,
    token: 'good-token',
    shopId: 'shop-1',
    clientId: 'client-1',
    userId: 'u-cashier',
    userName: 'Sara',
    role: 'cashier',
  }),
  savePairing: async () => {},
  clearPairing: async () => {},
}));

import { createHandler } from '../routes';
import { useClientStore } from '../clientStore';
import { setDeviceMode } from '../deviceMode';
import { enqueue, enqueueCustomer, getOutboxEntry, pendingCount } from '@/db/repositories/outboxRepo';
import { submitCustomer, submitSale } from '../salesQueue';

const NOW = new Date(2026, 9, 14, 10, 0, 0, 0).getTime();
const META = { remoteAddress: '192.168.1.5', remotePort: 5555 };

const ACTOR = { id: 'u-cashier', name: 'Sara', role: 'cashier' } as const;

const CATALOG_ITEM_SQL = `
  INSERT INTO items (id, name, category, tracks_stock, low_stock_level, cost_price,
      selling_price, created_at, updated_at, device_id)
  VALUES ('i1', 'Rice', 'Staples', 1, 0, 100, 200, ?, ?, 'admin')`;
const CATALOG_UNIT_SQL = `
  INSERT INTO item_units (id, item_id, unit_name, units_per_base, selling_price, is_base,
      sort_order, created_at, updated_at, device_id)
  VALUES ('u1', 'i1', 'Single', 1, 200, 1, 0, ?, ?, 'admin')`;

let adminDb: TestDb;
let cashierDb: TestDb;
let online = false;

type Store = { __testDb?: TestDb; __mockHttpRequest?: (options: unknown) => Promise<unknown> };
const globals = globalThis as unknown as Store;

function seedAdmin(db: TestDb): void {
  db.exec(
    `INSERT INTO users (id, name, role, is_active, created_at, updated_at, device_id)
     VALUES ('u-cashier', 'Sara', 'cashier', 1, ?, ?, 'admin')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO devices (id, client_id, name, user_id, role, status, token_hash, created_at, updated_at)
     VALUES ('d1', 'client-1', 'Till 1', 'u-cashier', 'cashier', 'approved', 'good-token', ?, ?)`,
    NOW,
    NOW,
  );
  db.exec(CATALOG_ITEM_SQL, NOW, NOW);
  db.exec(CATALOG_UNIT_SQL, NOW, NOW);
}

/** Admin-side transport: run the request through the real host handler. */
async function mockHttpRequest(raw: unknown): Promise<{ status: number; body: unknown }> {
  const options = raw as {
    host?: string;
    port?: number;
    method?: string;
    path: string;
    token?: string;
    body?: unknown;
  };
  const request: HttpRequest = {
    method: options.method ?? 'GET',
    path: options.path,
    headers: options.token ? { 'x-device-token': options.token } : {},
    body: options.body === undefined ? '' : JSON.stringify(options.body),
  };
  if (!online) throw new Error('The network is down.');
  const previous = globals.__testDb;
  globals.__testDb = adminDb;
  try {
    return await createHandler({ getPairingKey: () => null })(request, META);
  } finally {
    globals.__testDb = previous;
  }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function counts(): Promise<{ customers: number; sales: number; payments: number }> {
  const read = async (sql: string) => {
    const previous = globals.__testDb;
    globals.__testDb = adminDb;
    try {
      const row = await adminDb.getFirstAsync<{ c: number }>(sql);
      return row?.c ?? 0;
    } finally {
      globals.__testDb = previous;
    }
  };
  return {
    customers: await read('SELECT COUNT(*) AS c FROM customers'),
    sales: await read('SELECT COUNT(*) AS c FROM sales'),
    payments: await read('SELECT COUNT(*) AS c FROM payments'),
  };
}

describe('customer then sale over the wire', () => {
  beforeEach(async () => {
    online = false;
    adminDb = new TestDb();
    await adminDb.apply(MIGRATIONS);
    seedAdmin(adminDb);
    cashierDb = new TestDb();
    await cashierDb.apply(MIGRATIONS);
    cashierDb.exec(CATALOG_ITEM_SQL, NOW, NOW);
    cashierDb.exec(CATALOG_UNIT_SQL, NOW, NOW);
    globals.__testDb = cashierDb;
    globals.__mockHttpRequest = mockHttpRequest;
    await setDeviceMode('cashier');
    // Offline, so load() only picks up the pairing (ping fails fast).
    await useClientStore.getState().load();
  });

  afterEach(async () => {
    // Clears the retry timer a failed flush may have started.
    await useClientStore.getState().disconnect();
    globals.__testDb = undefined;
    globals.__mockHttpRequest = undefined;
  });

  it('queues the customer ahead of the sale and delivers both once after reconnecting', async () => {
    const customer = await submitCustomer(ACTOR, { name: 'Ade Okon', phone: '0803' });
    const sale = await submitSale(ACTOR, {
      customerId: customer.id,
      lines: [{ itemId: 'i1', unitId: 'u1', quantity: 2 }],
      payments: [{ method: 'credit', amount: 400 }],
    });
    await settle();

    // Offline: both are queued, customer first, so the admin can never be asked
    // for a sale whose customer it has not seen yet.
    globals.__testDb = cashierDb;
    const queued = await getOutboxEntry(customer.id);
    const queuedSale = await getOutboxEntry(sale.id);
    expect(queued?.kind).toBe('customer');
    expect(queuedSale?.kind).toBe('sale');
    // The network was down: the customer entry was attempted and parked, and
    // the flush stops at the first network error so the sale sits behind it,
    // untouched, for the retry.
    expect(queued?.status).toBe('failed');
    expect(queuedSale?.status).toBe('pending');
    expect(await pendingCount()).toBe(2);

    // Reconnect.
    online = true;
    await useClientStore.getState().flushOutbox();
    await settle();
    // Wait for the catalog pull the store fires after a clean flush.
    await useClientStore.getState().syncCatalog();

    expect(await counts()).toEqual({ customers: 1, sales: 1, payments: 1 });
    globals.__testDb = cashierDb;
    expect(await pendingCount()).toBe(0);
    expect((await getOutboxEntry(customer.id))?.status).toBe('sent');
    expect((await getOutboxEntry(sale.id))?.status).toBe('sent');

    // A repeat flush must not create anything a second time.
    await useClientStore.getState().flushOutbox();
    await settle();
    await useClientStore.getState().syncCatalog();
    expect(await counts()).toEqual({ customers: 1, sales: 1, payments: 1 });
  });

  it('recovers a sale the admin rejected because the customer was missing', async () => {
    online = true;
    const salePayload = {
      saleId: 'sale-orphan-1',
      deviceId: 'cashier-device',
      soldAt: NOW,
      customerId: 'cust-42',
      discount: 0,
      lines: [{ itemId: 'i1', unitId: 'u1', quantity: 1 }],
      payments: [{ method: 'credit', amount: 200 }],
    };

    // The sale reaches the admin on its own (legacy queue, or a race): rejected.
    await enqueue({ id: 'sale-orphan-1', kind: 'sale', payload: JSON.stringify(salePayload) });
    await useClientStore.getState().flushOutbox();
    await settle();
    globals.__testDb = cashierDb;
    expect((await getOutboxEntry('sale-orphan-1'))?.status).toBe('failed');
    expect(await counts()).toEqual({ customers: 0, sales: 0, payments: 0 });

    // The customer is queued later; the very next flush retries the failed sale
    // right behind it, so nothing stays stuck.
    await enqueueCustomer({
      id: 'cust-42',
      payload: JSON.stringify({
        customerId: 'cust-42',
        name: 'Ada Nwosu',
        phone: null,
        notes: null,
        updatedAt: NOW,
      }),
    });
    await useClientStore.getState().flushOutbox();
    await settle();
    await useClientStore.getState().syncCatalog();
    globals.__testDb = cashierDb;
    expect(await pendingCount()).toBe(0);
    expect((await getOutboxEntry('sale-orphan-1'))?.status).toBe('sent');
    expect(await counts()).toEqual({ customers: 1, sales: 1, payments: 1 });
  });
});
