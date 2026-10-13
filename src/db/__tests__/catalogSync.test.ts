/* eslint-disable import/first */
import { MIGRATIONS } from '../migrations';
import { TestDb } from './testDb';

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

import { getDb } from '../index';
import { readCatalog, writeCatalog } from '../repositories/catalogRepo';
import { listItems } from '../repositories/itemsRepo';

const T0 = new Date(2026, 9, 1, 9, 0, 0, 0).getTime();
const T1 = T0 + 60_000;

function seedAdmin(db: TestDb): void {
  db.exec(
    `INSERT INTO items (id, name, category, tracks_stock, low_stock_level, cost_price,
        selling_price, created_at, updated_at, device_id)
     VALUES ('i1', 'Bag of rice', 'Staples', 1, 2, 100, 200, ?, ?, 'admin')`,
    T0,
    T0,
  );
  db.exec(
    `INSERT INTO items (id, name, category, tracks_stock, low_stock_level, cost_price,
        selling_price, created_at, updated_at, deleted_at, device_id)
     VALUES ('i2', 'Old item', 'Staples', 1, 0, 50, 100, ?, ?, ?, 'admin')`,
    T0,
    T1,
    T1,
  );
  db.exec(
    `INSERT INTO item_units (id, item_id, unit_name, units_per_base, selling_price, is_base,
        sort_order, barcode, created_at, updated_at, device_id)
     VALUES ('u1', 'i1', 'Single', 1, 200, 1, 0, 'RICE-1', ?, ?, 'admin')`,
    T0,
    T0,
  );
  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, created_at, updated_at, device_id)
     VALUES ('m1', 'i1', 'restock', 40, 100, ?, ?, 'admin')`,
    T0,
    T0,
  );
  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, created_at, updated_at, device_id)
     VALUES ('m2', 'i1', 'sale', -6, 100, ?, ?, 'admin')`,
    T0,
    T0,
  );
}

async function freshDb(): Promise<TestDb> {
  const db = new TestDb();
  await db.apply(MIGRATIONS);
  return db;
}

function use(db: TestDb): void {
  (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
}

describe('catalog sync', () => {
  afterEach(() => {
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = undefined;
  });

  it('reads the full catalog including soft-deleted rows and derived stock', async () => {
    const admin = await freshDb();
    seedAdmin(admin);
    use(admin);

    const snapshot = await readCatalog(0);
    expect(snapshot.items.map((item) => item.id).sort()).toEqual(['i1', 'i2']);
    expect(snapshot.units.map((unit) => unit.id)).toEqual(['u1']);
    expect(snapshot.stock).toEqual([{ itemId: 'i1', quantityBase: 34 }]);
  });

  it('only returns rows changed after the given time', async () => {
    const admin = await freshDb();
    seedAdmin(admin);
    use(admin);

    const snapshot = await readCatalog(T0);
    expect(snapshot.items.map((item) => item.id)).toEqual(['i2']);
    expect(snapshot.units).toEqual([]);
  });

  it('mirrors a snapshot into a cashier and falls back to the stock snapshot', async () => {
    const admin = await freshDb();
    seedAdmin(admin);
    use(admin);
    const snapshot = await readCatalog(0);

    // A fresh cashier phone: schema only, no local movements at all.
    const cashier = await freshDb();
    use(cashier);
    await writeCatalog(snapshot);

    const items = await listItems();
    expect(items.map((item) => item.id)).toEqual(['i1']); // i2 is soft-deleted
    expect(items[0].stock).toBe(34); // from stock_snapshot, not movements

    const rows = await getDb().getAllAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM stock_movements',
    );
    expect(rows[0].count).toBe(0);
  });

  it('applies changed rows idempotently without duplicating', async () => {
    const admin = await freshDb();
    seedAdmin(admin);
    use(admin);
    const snapshot = await readCatalog(0);

    const cashier = await freshDb();
    use(cashier);
    await writeCatalog(snapshot);
    await writeCatalog(snapshot);

    const items = await cashier.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM items');
    const units = await cashier.getAllAsync<{ count: number }>('SELECT COUNT(*) AS count FROM item_units');
    expect(items[0].count).toBe(2);
    expect(units[0].count).toBe(1);
  });
});
