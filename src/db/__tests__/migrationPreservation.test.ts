import { MIGRATIONS } from '../migrations';
import { TestDb } from './testDb';

const TABLES = [
  'settings',
  'items',
  'item_units',
  'stock_movements',
  'customers',
  'sales',
  'sale_lines',
  'payments',
] as const;

type Counts = Record<(typeof TABLES)[number], number>;

async function countRows(db: TestDb): Promise<Counts> {
  const counts = {} as Counts;
  for (const table of TABLES) {
    const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}"`);
    counts[table] = row?.c ?? 0;
  }
  return counts;
}

/** A cross-section of real rows written by the pre-staff schema. */
function seedLegacyRows(db: TestDb): void {
  const t = 1_700_000_000_000;

  db.exec(
    `INSERT INTO settings (id, shop_name, receipt_footer, created_at, updated_at, device_id)
     VALUES ('shop', 'Legacy Shop', 'Thanks', ?, ?, 'old')`,
    t,
    t,
  );

  for (const id of ['i1', 'i2', 'i3']) {
    db.exec(
      `INSERT INTO items (id, name, category, tracks_stock, low_stock_level, cost_price,
          selling_price, created_at, updated_at, device_id)
       VALUES (?, ?, 'Staples', 1, 2, 100, 200, ?, ?, 'old')`,
      id,
      `Item ${id}`,
      t,
      t,
    );
  }
  db.exec(
    `INSERT INTO item_units (id, item_id, unit_name, units_per_base, selling_price, is_base,
        sort_order, created_at, updated_at, device_id)
     VALUES ('iu1', 'i1', 'Single', 1, 200, 1, 0, ?, ?, 'old')`,
    t,
    t,
  );
  db.exec(
    `INSERT INTO item_units (id, item_id, unit_name, units_per_base, selling_price, is_base,
        sort_order, created_at, updated_at, device_id)
     VALUES ('iu2', 'i2', 'Carton', 12, 2000, 0, 1, ?, ?, 'old')`,
    t,
    t,
  );

  db.exec(
    `INSERT INTO customers (id, name, created_at, updated_at, device_id)
     VALUES ('c1', 'Ade', ?, ?, 'old')`,
    t,
    t,
  );
  db.exec(
    `INSERT INTO customers (id, name, created_at, updated_at, device_id)
     VALUES ('c2', 'Bola', ?, ?, 'old')`,
    t,
    t,
  );

  db.exec(
    `INSERT INTO sales (id, receipt_no, customer_id, subtotal, discount, total, status, sold_at,
        created_at, updated_at, device_id)
     VALUES ('s1', '0001', 'c1', 400, 0, 400, 'completed', ?, ?, ?, 'old')`,
    t,
    t,
    t,
  );
  db.exec(
    `INSERT INTO sales (id, receipt_no, customer_id, subtotal, discount, total, status, sold_at,
        created_at, updated_at, device_id)
     VALUES ('s2', '0002', NULL, 200, 0, 200, 'completed', ?, ?, ?, 'old')`,
    t,
    t,
    t,
  );

  db.exec(
    `INSERT INTO sale_lines (id, sale_id, item_id, unit_id, unit_name, quantity, units_per_base,
        quantity_base, unit_price, line_total, unit_cost, created_at, updated_at, device_id)
     VALUES ('sl1', 's1', 'i1', 'iu1', 'Single', 2, 1, 2, 200, 400, 0, ?, ?, 'old')`,
    t,
    t,
  );
  db.exec(
    `INSERT INTO sale_lines (id, sale_id, item_id, unit_id, unit_name, quantity, units_per_base,
        quantity_base, unit_price, line_total, unit_cost, created_at, updated_at, device_id)
     VALUES ('sl2', 's2', 'i2', 'iu2', 'Carton', 1, 12, 12, 2000, 2000, 0, ?, ?, 'old')`,
    t,
    t,
  );
  db.exec(
    `INSERT INTO sale_lines (id, sale_id, item_id, unit_id, unit_name, quantity, units_per_base,
        quantity_base, unit_price, line_total, unit_cost, created_at, updated_at, device_id)
     VALUES ('sl3', 's2', 'i1', 'iu1', 'Single', 1, 1, 1, 200, 200, 0, ?, ?, 'old')`,
    t,
    t,
  );

  db.exec(
    `INSERT INTO payments (id, sale_id, customer_id, method, amount, paid_at, created_at,
        updated_at, device_id)
     VALUES ('p1', 's1', 'c1', 'cash', 100, ?, ?, ?, 'old')`,
    t,
    t,
    t,
  );
  db.exec(
    `INSERT INTO payments (id, sale_id, customer_id, method, amount, paid_at, created_at,
        updated_at, device_id)
     VALUES ('p2', 's1', 'c1', 'credit', 300, ?, ?, ?, 'old')`,
    t,
    t,
    t,
  );

  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, reference_id,
        created_at, updated_at, device_id)
     VALUES ('sm1', 'i1', 'restock', 50, 100, NULL, ?, ?, 'old')`,
    t,
    t,
  );
  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, reference_id,
        created_at, updated_at, device_id)
     VALUES ('sm2', 'i1', 'sale', -2, 100, 's1', ?, ?, 'old')`,
    t,
    t,
  );
  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, reference_id,
        created_at, updated_at, device_id)
     VALUES ('sm3', 'i2', 'restock', 24, 100, NULL, ?, ?, 'old')`,
    t,
    t,
  );
  db.exec(
    `INSERT INTO stock_movements (id, item_id, type, quantity_base, unit_cost, reference_id,
        created_at, updated_at, device_id)
     VALUES ('sm4', 'i2', 'sale', -12, 100, 's2', ?, ?, 'old')`,
    t,
    t,
  );
}

describe('migration v7 preserves every existing row', () => {
  it('reports identical table counts before and after the staff/audit migration', async () => {
    const db = new TestDb();
    const preV7 = MIGRATIONS.filter((migration) => migration.version <= 6);
    const v7 = MIGRATIONS.filter((migration) => migration.version === 7);
    expect(v7).toHaveLength(1);

    await db.apply(preV7);
    seedLegacyRows(db);

    const before = await countRows(db);
    expect(before).toEqual({
      settings: 1,
      items: 3,
      item_units: 2,
      stock_movements: 4,
      customers: 2,
      sales: 2,
      sale_lines: 3,
      payments: 2,
    });

    await db.apply(v7);

    const after = await countRows(db);
    // Counts are unchanged for every table that existed before v7.
    expect(after).toEqual(before);

    // The values themselves survived, not just the row counts.
    const sale = await db.getFirstAsync<{ receipt_no: string; total: number }>(
      "SELECT receipt_no, total FROM sales WHERE id = 's1'",
    );
    expect(sale).toEqual({ receipt_no: '0001', total: 400 });
  });

  it('adds the new tables and attribution columns without orphaning rows', async () => {
    const db = new TestDb();
    await db.apply(MIGRATIONS.filter((migration) => migration.version <= 6));
    seedLegacyRows(db);
    await db.apply(MIGRATIONS.filter((migration) => migration.version === 7));

    // The new attribution tables exist and start empty (nothing to attribute yet).
    for (const table of ['users', 'audit_log']) {
      const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM "${table}"`);
      expect(row?.c).toBe(0);
    }

    // Legacy rows get NULL attribution, ready for createOwner() to back-fill.
    const unattributed = await db.getFirstAsync<{ sales: number; payments: number; movements: number }>(
      `SELECT
         (SELECT COUNT(*) FROM sales WHERE user_id IS NULL) AS sales,
         (SELECT COUNT(*) FROM payments WHERE user_id IS NULL) AS payments,
         (SELECT COUNT(*) FROM stock_movements WHERE user_id IS NULL) AS movements`,
    );
    expect(unattributed).toEqual({ sales: 2, payments: 2, movements: 4 });

    // Legacy zero-cost lines are flagged as estimated and back-filled in place.
    const lines = await db.getFirstAsync<{ c: number; estimated: number }>(
      `SELECT COUNT(*) AS c, SUM(cost_estimated) AS estimated FROM sale_lines`,
    );
    expect(lines).toEqual({ c: 3, estimated: 3 });

    const backfilled = await db.getFirstAsync<{ cost: number }>(
      "SELECT unit_cost AS cost FROM sale_lines WHERE id = 'sl1'",
    );
    expect(backfilled?.cost).toBe(100);

    const backfillCount = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_meta WHERE key = 'cost_backfill_count'",
    );
    expect(backfillCount?.value).toBe('3');
  });
});
