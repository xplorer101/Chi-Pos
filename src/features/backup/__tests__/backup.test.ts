/* eslint-disable import/first */
import { createHash as mockCreateHash, randomBytes as mockRandomBytes } from 'crypto';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algorithm: unknown, data: string) =>
    mockCreateHash('sha256').update(data).digest('hex'),
  ),
  getRandomBytesAsync: jest.fn(async (length: number) =>
    new Uint8Array(mockRandomBytes(length)),
  ),
  getRandomBytes: jest.fn((length: number) => new Uint8Array(mockRandomBytes(length))),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.1.0-test' } },
}));

jest.mock('expo-file-system', () => {
  const store = () => {
    const g = globalThis as unknown as {
      __memFs?: Map<string, { type: 'file' | 'dir'; contents?: string; lastModified?: number }>;
    };
    if (!g.__memFs) g.__memFs = new Map();
    return g.__memFs;
  };
  const join = (base: string, name: string) => `${base.replace(/\/$/, '')}/${name}`;
  const baseUri = (base: unknown) => (typeof base === 'string' ? base : (base as { uri: string }).uri);
  const parent = (uri: string) => uri.slice(0, uri.lastIndexOf('/'));

  class File {
    uri: string;
    name: string;
    constructor(base: unknown, name?: string) {
      const resolved = baseUri(base);
      this.uri = name ? join(resolved, name) : resolved;
      this.name = this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    create() {
      if (!store().has(this.uri)) {
        store().set(this.uri, { type: 'file', contents: '', lastModified: Date.now() });
      }
    }
    write(text: string) {
      store().set(this.uri, { type: 'file', contents: text, lastModified: Date.now() });
    }
    async text() {
      return store().get(this.uri)?.contents ?? '';
    }
    delete() {
      store().delete(this.uri);
    }
    get exists() {
      return store().has(this.uri);
    }
    get size() {
      return store().get(this.uri)?.contents?.length ?? 0;
    }
    get lastModified() {
      return store().get(this.uri)?.lastModified ?? null;
    }
  }

  class Directory {
    uri: string;
    name: string;
    constructor(base: unknown, name?: string) {
      const resolved = baseUri(base);
      this.uri = name ? join(resolved, name) : resolved;
      this.name = this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    create() {
      store().set(this.uri, { type: 'dir' });
    }
    list() {
      const out: File[] = [];
      for (const [uri, entry] of store()) {
        if (entry.type === 'file' && parent(uri) === this.uri) out.push(new File(uri));
      }
      return out;
    }
    get exists() {
      return store().get(this.uri)?.type === 'dir';
    }
  }

  return { File, Directory, Paths: { cache: '/cache', document: '/document' } };
});

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

import { MIGRATIONS } from '@/db/migrations';
import { TestDb } from '@/db/__tests__/testDb';
import { toActingUser, createOwner, createCashier, getOwner } from '@/db/repositories/usersRepo';
import { getCustomerOwed } from '@/db/repositories/customersRepo';
import type { ActingUser, User } from '@/db/types';
import { sha256Hex } from '../backupFormat';
import {
  buildBackup,
  inspectBackup,
  listSafetyCopies,
  restoreBackup,
  restoreSafetyCopy,
} from '../backupService';

const NOW = new Date(2026, 9, 13, 14, 15, 0, 0).getTime();

function setDb(db: TestDb | undefined): void {
  (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
}

async function freshDb(): Promise<TestDb> {
  const db = new TestDb();
  await db.apply(MIGRATIONS);
  db.exec('PRAGMA user_version = 7');
  return db;
}

/** One item, one customer, one completed credit sale and a part payment. */
function seedBusiness(db: TestDb, ownerId: string): void {
  db.exec(
    `INSERT INTO settings
       (id, shop_name, business_type, currency, receipt_footer, shop_address, shop_phone,
        auto_lock_minutes, created_at, updated_at, device_id)
     VALUES ('shop', 'Mama Ngozi Store', 'provision_shop', 'NGN', 'Thanks', '', '', 5, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO items (id, name, cost_price, selling_price, created_at, updated_at, device_id)
     VALUES ('i1', 'Bag of rice', 10000, 15000, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO customers (id, name, created_at, updated_at, device_id)
     VALUES ('c1', 'Ngozi', ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO sales
       (id, receipt_no, customer_id, subtotal, discount, total, status, sold_at,
        created_at, updated_at, device_id, user_id)
     VALUES ('s1', 'R-1', 'c1', 15000, 0, 15000, 'completed', ?, ?, ?, 'test', ?)`,
    NOW,
    NOW,
    NOW,
    ownerId,
  );
  db.exec(
    `INSERT INTO sale_lines
       (id, sale_id, item_id, unit_name, quantity, units_per_base, quantity_base, unit_price,
        line_total, unit_cost, cost_estimated, created_at, updated_at, device_id)
     VALUES ('sl1', 's1', 'i1', 'unit', 1, 1, 1, 15000, 15000, 10000, 0, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO payments
       (id, sale_id, customer_id, method, amount, paid_at, created_at, updated_at, device_id, user_id)
     VALUES ('p1', 's1', 'c1', 'credit', 15000, ?, ?, ?, 'test', ?)`,
    NOW,
    NOW,
    NOW,
    ownerId,
  );
  db.exec(
    `INSERT INTO payments
       (id, sale_id, customer_id, method, amount, paid_at, created_at, updated_at, device_id, user_id)
     VALUES ('p2', NULL, 'c1', 'cash', 5000, ?, ?, ?, 'test', ?)`,
    NOW,
    NOW,
    NOW,
    ownerId,
  );
}

async function bootstrap(): Promise<{ db: TestDb; owner: User; actor: ActingUser }> {
  const db = await freshDb();
  setDb(db);
  const { owner } = await createOwner({ name: 'Owner', pin: '1234' });
  seedBusiness(db, owner.id);
  return { db, owner, actor: toActingUser(owner) };
}

async function count(db: TestDb, table: string): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}"`);
  return row?.c ?? 0;
}

beforeEach(() => {
  (globalThis as unknown as { __memFs?: Map<string, unknown> }).__memFs = new Map();
});

afterEach(() => {
  setDb(undefined);
});

describe('backup round trip', () => {
  it('restores the exact data, counts and balances it captured', async () => {
    const { db, actor } = await bootstrap();
    const owedBefore = await getCustomerOwed('c1');
    expect(owedBefore).toBeGreaterThan(0);

    const prepared = await buildBackup(actor, { pin: '1234', now: NOW });
    expect(prepared.name).toBe('ShopPOS-backup-2026-10-13-1415.shoppos');
    expect(prepared.counts).toEqual({
      items: 1,
      customers: 1,
      sales: 1,
      outstandingDebt: owedBefore,
    });

    for (const table of ['payments', 'sale_lines', 'sales', 'items', 'customers']) {
      db.exec(`DELETE FROM "${table}"`);
    }
    expect(await count(db, 'items')).toBe(0);

    const result = await restoreBackup(actor, {
      pin: '1234',
      text: prepared.text,
      confirmWord: 'RESTORE',
    });

    expect(result.counts).toEqual(prepared.counts);
    expect(await count(db, 'items')).toBe(1);
    expect(await count(db, 'sales')).toBe(1);
    expect(await count(db, 'payments')).toBe(2);
    expect(await getCustomerOwed('c1')).toBe(owedBefore);
  });
});

describe('backup integrity', () => {
  it('refuses a file whose payload was edited (bad checksum)', async () => {
    const { actor } = await bootstrap();
    const prepared = await buildBackup(actor, { pin: '1234', now: NOW });

    const parsed = JSON.parse(prepared.text);
    parsed.payload.data.items[0].name = 'Hacked';

    await expect(inspectBackup(JSON.stringify(parsed))).rejects.toThrow(/corrupted|edited|checksum/i);
  });

  it('refuses a backup made by a newer data schema', async () => {
    const { db, actor } = await bootstrap();
    const prepared = await buildBackup(actor, { pin: '1234', now: NOW });

    const parsed = JSON.parse(prepared.text);
    parsed.header.schemaVersion = 99;

    await expect(
      restoreBackup(actor, {
        pin: '1234',
        text: JSON.stringify(parsed),
        confirmWord: 'RESTORE',
      }),
    ).rejects.toThrow(/NEWER version/i);

    expect(await count(db, 'items')).toBe(1);
  });

  it('rolls back and leaves data untouched when the insert fails mid-restore', async () => {
    const { db, actor } = await bootstrap();
    const prepared = await buildBackup(actor, { pin: '1234', now: NOW });

    const parsed = JSON.parse(prepared.text);
    parsed.payload.data.sales[0].status = 'not-a-valid-status';
    parsed.checksum = sha256Hex(JSON.stringify({ header: parsed.header, payload: parsed.payload }));

    await expect(
      restoreBackup(actor, {
        pin: '1234',
        text: JSON.stringify(parsed),
        confirmWord: 'RESTORE',
      }),
    ).rejects.toThrow();

    expect(await count(db, 'items')).toBe(1);
    expect(await count(db, 'sales')).toBe(1);
    const failed = await db.getFirstAsync<{ action: string }>(
      "SELECT action FROM audit_log WHERE action = 'restore_failed'",
    );
    expect(failed?.action).toBe('restore_failed');
  });
});

describe('backup permissions', () => {
  it('refuses a cashier', async () => {
    const { db, actor } = await bootstrap();
    const cashier = await createCashier(actor, { name: 'Cashier', pin: '4321' });

    await expect(buildBackup(toActingUser(cashier), { pin: '4321' })).rejects.toThrow(
      /Not allowed/i,
    );
    expect(await count(db, 'items')).toBe(1);
  });
});

describe('password-protected backups', () => {
  it('round-trips through encryption', async () => {
    const { db, actor } = await bootstrap();
    const prepared = await buildBackup(actor, { pin: '1234', password: 'hunter2', now: NOW });
    expect(JSON.parse(prepared.text).header.encrypted).toBe(true);

    const inspected = await inspectBackup(prepared.text, 'hunter2');
    expect(inspected.counts).toEqual(prepared.counts);

    db.exec("UPDATE items SET name = 'Changed' WHERE id = 'i1'");
    await restoreBackup(actor, {
      pin: '1234',
      text: prepared.text,
      password: 'hunter2',
      confirmWord: 'RESTORE',
    });
    expect(await db.getFirstAsync("SELECT name FROM items WHERE id = 'i1'")).toEqual({
      name: 'Bag of rice',
    });
  }, 60_000);

  it('refuses the wrong password and changes nothing', async () => {
    const { db, actor } = await bootstrap();
    const prepared = await buildBackup(actor, { pin: '1234', password: 'hunter2', now: NOW });

    await expect(inspectBackup(prepared.text, 'nope')).rejects.toThrow(/password is not correct/i);
    await expect(
      restoreBackup(actor, {
        pin: '1234',
        text: prepared.text,
        password: 'nope',
        confirmWord: 'RESTORE',
      }),
    ).rejects.toThrow(/password is not correct/i);
    expect(await count(db, 'items')).toBe(1);
  }, 60_000);
});

describe('safety copies', () => {
  it('keeps a copy of the pre-restore state and can restore it', async () => {
    const { db, actor } = await bootstrap();
    const prepared = await buildBackup(actor, { pin: '1234', now: NOW });

    db.exec("UPDATE items SET name = 'Old rice' WHERE id = 'i1'");
    db.exec(
      `INSERT INTO items (id, name, cost_price, selling_price, created_at, updated_at, device_id)
       VALUES ('i2', 'New item', 100, 200, ?, ?, 'test')`,
      NOW,
      NOW,
    );

    await restoreBackup(actor, { pin: '1234', text: prepared.text, confirmWord: 'RESTORE' });
    expect(await count(db, 'items')).toBe(1);
    expect(await db.getFirstAsync("SELECT name FROM items WHERE id = 'i1'")).toEqual({
      name: 'Bag of rice',
    });
    expect(await db.getFirstAsync("SELECT name FROM items WHERE id = 'i2'")).toBeNull();

    const copies = await listSafetyCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0].name).toMatch(/^Safety-.*\.shoppos$/);

    await restoreSafetyCopy(actor, {
      pin: '1234',
      name: copies[0].name,
      confirmWord: 'RESTORE',
    });

    expect(await db.getFirstAsync("SELECT name FROM items WHERE id = 'i1'")).toEqual({
      name: 'Old rice',
    });
    expect(await db.getFirstAsync("SELECT name FROM items WHERE id = 'i2'")).toEqual({
      name: 'New item',
    });
  });
});

describe('fresh install', () => {
  it('restores a backup before any owner exists', async () => {
    const { actor } = await bootstrap();
    const prepared = await buildBackup(actor, { pin: '1234', now: NOW });

    const fresh = await freshDb();
    setDb(fresh);
    expect(await getOwner()).toBeNull();

    await restoreBackup(null, { pin: '', text: prepared.text, confirmWord: 'RESTORE' });

    const restoredOwner = await getOwner();
    expect(restoredOwner?.name).toBe('Owner');
    expect(await count(fresh, 'items')).toBe(1);
  });
});
