import type { SQLiteDatabase } from 'expo-sqlite';

export type Migration = {
  version: number;
  name: string;
  /** SQL statements executed inside a single transaction. */
  sql: string;
};

/**
 * Ordered, versioned migrations.
 *
 * Each entry is applied exactly once inside its own transaction and bumps
 * `PRAGMA user_version`. Never edit an applied migration - add a new one.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE settings (
        id TEXT PRIMARY KEY NOT NULL,
        shop_name TEXT NOT NULL DEFAULT '',
        business_type TEXT NOT NULL DEFAULT 'provision_shop',
        currency TEXT NOT NULL DEFAULT 'NGN',
        owner_pin_hash TEXT,
        receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your patronage.',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE items (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        barcode TEXT,
        tracks_stock INTEGER NOT NULL DEFAULT 1,
        low_stock_level INTEGER NOT NULL DEFAULT 0,
        cost_price INTEGER NOT NULL DEFAULT 0,
        selling_price INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE item_units (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        unit_name TEXT NOT NULL,
        units_per_base INTEGER NOT NULL DEFAULT 1,
        selling_price INTEGER NOT NULL DEFAULT 0,
        is_base INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('sale','restock','adjustment')),
        quantity_base INTEGER NOT NULL,
        unit_cost INTEGER NOT NULL DEFAULT 0,
        reference_id TEXT,
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE customers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE sales (
        id TEXT PRIMARY KEY NOT NULL,
        receipt_no TEXT NOT NULL,
        customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
        subtotal INTEGER NOT NULL DEFAULT 0,
        discount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
        sold_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE sale_lines (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL REFERENCES items(id),
        unit_id TEXT REFERENCES item_units(id),
        unit_name TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL,
        units_per_base INTEGER NOT NULL DEFAULT 1,
        quantity_base INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        line_total INTEGER NOT NULL,
        unit_cost INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE payments (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
        customer_id TEXT REFERENCES customers(id),
        method TEXT NOT NULL CHECK (method IN ('cash','transfer','pos','credit')),
        amount INTEGER NOT NULL DEFAULT 0,
        paid_at INTEGER NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        device_id TEXT NOT NULL DEFAULT ''
      );
    `,
  },
  {
    version: 2,
    name: 'indexes',
    sql: `
      CREATE INDEX idx_items_name ON items(name);
      CREATE INDEX idx_items_category ON items(category);
      CREATE INDEX idx_items_barcode ON items(barcode);
      CREATE INDEX idx_item_units_item ON item_units(item_id, sort_order);
      CREATE INDEX idx_stock_movements_item ON stock_movements(item_id, created_at);
      CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_id);
      CREATE INDEX idx_sales_sold_at ON sales(sold_at);
      CREATE INDEX idx_sales_customer ON sales(customer_id);
      CREATE UNIQUE INDEX idx_sales_receipt_no ON sales(receipt_no);
      CREATE INDEX idx_sale_lines_sale ON sale_lines(sale_id);
      CREATE INDEX idx_sale_lines_item ON sale_lines(item_id);
      CREATE INDEX idx_payments_sale ON payments(sale_id);
      CREATE INDEX idx_payments_customer ON payments(customer_id, paid_at);
    `,
  },
  {
    version: 3,
    name: 'unique_item_barcode',
    sql: `
      UPDATE items
         SET barcode = NULL
       WHERE deleted_at IS NULL
         AND barcode IS NOT NULL
         AND barcode <> ''
         AND EXISTS (
           SELECT 1 FROM items AS keep
            WHERE keep.deleted_at IS NULL
              AND keep.barcode = items.barcode
              AND (keep.created_at < items.created_at
                   OR (keep.created_at = items.created_at AND keep.id < items.id))
         );

      CREATE UNIQUE INDEX idx_items_barcode_unique
        ON items(barcode)
        WHERE barcode IS NOT NULL AND barcode <> '' AND deleted_at IS NULL;
    `,
  },
  {
    version: 4,
    name: 'unit_barcodes',
    sql: `
      ALTER TABLE item_units ADD COLUMN barcode TEXT;

      UPDATE item_units
         SET barcode = (
           SELECT i.barcode
             FROM items i
            WHERE i.id = item_units.item_id AND i.deleted_at IS NULL
         )
       WHERE is_base = 1
         AND deleted_at IS NULL
         AND barcode IS NULL
         AND EXISTS (
           SELECT 1 FROM items i
            WHERE i.id = item_units.item_id
              AND i.barcode IS NOT NULL AND i.barcode <> ''
         );

      UPDATE item_units
         SET barcode = NULL
       WHERE deleted_at IS NULL
         AND barcode IS NOT NULL
         AND barcode <> ''
         AND EXISTS (
           SELECT 1 FROM item_units AS keep
            WHERE keep.deleted_at IS NULL
              AND keep.barcode = item_units.barcode
              AND (keep.created_at < item_units.created_at
                   OR (keep.created_at = item_units.created_at AND keep.id < item_units.id))
         );

      DROP INDEX IF EXISTS idx_items_barcode_unique;
      DROP INDEX IF EXISTS idx_items_barcode;
      ALTER TABLE items DROP COLUMN barcode;

      CREATE UNIQUE INDEX idx_item_units_barcode_unique
        ON item_units(barcode)
        WHERE barcode IS NOT NULL AND barcode <> '' AND deleted_at IS NULL;
    `,
  },
  {
    version: 5,
    name: 'settings_business_fields',
    sql: `
      ALTER TABLE settings ADD COLUMN shop_address TEXT DEFAULT '';
      ALTER TABLE settings ADD COLUMN shop_phone TEXT DEFAULT '';
      UPDATE settings SET shop_address = '' WHERE shop_address IS NULL;
      UPDATE settings SET shop_phone = '' WHERE shop_phone IS NULL;
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migration.sql);
      await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
