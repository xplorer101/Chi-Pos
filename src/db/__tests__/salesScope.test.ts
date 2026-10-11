/* eslint-disable import/first */
import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS } from '../migrations';
import { buildSalesScope, getSalesPeriodTotals } from '../salesScope';
import { periodRange } from '@/lib/dates';
import type { ActingUser } from '../types';

// A minimal stand-in for expo-sqlite's async API, backed by Node's built-in
// synchronous SQLite. Only the read methods our repositories actually use are
// implemented.
class TestDb {
  private readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    for (const migration of MIGRATIONS) this.sqlite.exec(migration.sql);
  }

  exec(sql: string, ...params: unknown[]): void {
    this.sqlite.prepare(sql).run(...(params as never[]));
  }

  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    const row = this.sqlite.prepare(sql).get(...(params as never[])) as T | undefined;
    return Promise.resolve(row ?? null);
  }

  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return Promise.resolve(this.sqlite.prepare(sql).all(...(params as never[])) as T[]);
  }
}

// The repositories fetch the connection lazily via getDb(), so we can hand them
// the in-memory database at call time.
jest.mock('@/db/index', () => ({
  getDb: () => (globalThis as unknown as { __testDb?: unknown }).__testDb,
}));

import { getEndOfDaySummary, getReport } from '../repositories/reportsRepo';
import { listSales } from '../repositories/salesRepo';

const NOW = new Date(2026, 9, 11, 23, 43, 0, 0).getTime(); // 11 Oct 2026, 23:43 local
const OWNER: ActingUser = { id: 'u-owner', name: 'Owner', role: 'owner' };
const CASHIER: ActingUser = { id: 'u-cashier', name: 'Gift', role: 'cashier' };

function seedCashierTransferSale(db: TestDb): void {
  db.exec(
    `INSERT INTO users (id, name, role, is_active, created_at, updated_at, device_id)
     VALUES (?, ?, 'cashier', 1, ?, ?, 'test')`,
    CASHIER.id,
    CASHIER.name,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO items
       (id, name, tracks_stock, cost_price, selling_price, created_at, updated_at, device_id)
     VALUES ('i-1', 'Bag of rice', 0, 200000, 350000, ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO sales
       (id, receipt_no, subtotal, discount, total, status, sold_at, user_id,
        created_at, updated_at, device_id)
     VALUES ('sale-1', '0001', 350000, 0, 350000, 'completed', ?, ?, ?, ?, 'test')`,
    NOW,
    CASHIER.id,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO sale_lines
       (id, sale_id, item_id, unit_name, quantity, units_per_base, quantity_base,
        unit_price, line_total, unit_cost, created_at, updated_at, device_id)
     VALUES ('sl-1', 'sale-1', 'i-1', 'Single', 1, 1, 1, 350000, 350000, 200000,
             ?, ?, 'test')`,
    NOW,
    NOW,
  );
  db.exec(
    `INSERT INTO payments
       (id, sale_id, method, amount, paid_at, user_id, created_at, updated_at, device_id)
     VALUES ('pay-1', 'sale-1', 'transfer', 350000, ?, ?, ?, ?, 'test')`,
    NOW,
    CASHIER.id,
    NOW,
    NOW,
  );
}

describe('sales scope builds one shared period filter', () => {
  it('qualifies every column with the sales alias', () => {
    const { sql } = buildSalesScope({ start: 1, end: 2 });
    expect(sql).toContain('s.deleted_at IS NULL');
    expect(sql).toContain("s.status = 'completed'");
    expect(sql).toContain('s.sold_at >= ?');
    expect(sql).toContain('s.sold_at <= ?');
  });

  it('adds a seller filter only when one is requested', () => {
    expect(buildSalesScope({ start: 1, end: 2 }).params).toEqual([1, 2]);
    expect(buildSalesScope({ start: 1, end: 2, userId: 'u-2' })).toEqual({
      sql: "s.deleted_at IS NULL AND s.status = 'completed' AND s.sold_at >= ? AND s.sold_at <= ? AND s.user_id = ?",
      params: [1, 2, 'u-2'],
    });
  });

  it('includes voided sales only when asked', () => {
    expect(buildSalesScope({ includeVoided: true }).sql).not.toContain('s.status');
    expect(buildSalesScope({}).sql).toContain("s.status = 'completed'");
  });

  it('runs its totals query against an aliased sales table', async () => {
    const db = new TestDb();
    seedCashierTransferSale(db);
    const { start, end } = periodRange('today', NOW);
    await expect(getSalesPeriodTotals(db, { start, end })).resolves.toEqual({
      count: 1,
      total: 350000,
    });
  });
});

describe('reports summary, end of day and recent sales agree', () => {
  let db: TestDb;

  beforeEach(() => {
    db = new TestDb();
    seedCashierTransferSale(db);
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = db;
  });

  afterEach(() => {
    (globalThis as unknown as { __testDb?: TestDb }).__testDb = undefined;
  });

  it('counts the cashier-made transfer sale in every view', async () => {
    const { start, end } = periodRange('today', NOW);

    const report = await getReport(OWNER, start, end);
    expect(report.salesCount).toBe(1);
    expect(report.totalSales).toBe(350000);
    expect(report.byMethod).toEqual([{ method: 'transfer', amount: 350000 }]);
    expect(report.collected).toEqual({ cash: 0, transfer: 350000, pos: 0, total: 350000 });
    expect(report.reconciliation.ok).toBe(true);

    const eod = await getEndOfDaySummary(OWNER, NOW);
    expect(eod.salesCount).toBe(report.salesCount);
    expect(eod.salesTotal).toBe(report.totalSales);
    expect(eod.nonCash).toBe(350000);

    const recent = await listSales(OWNER, { start, end, limit: 15 });
    expect(recent).toHaveLength(1);
    expect(recent[0].receiptNo).toBe('0001');
    expect(recent[0].servedByName).toBe('Gift');
    expect(recent.map((s) => s.total)).toEqual([report.totalSales]);
  });

  it('narrows the summary, end of day and recent sales to the selected seller', async () => {
    const { start, end } = periodRange('today', NOW);

    const forCashier = await getReport(OWNER, start, end, { userId: CASHIER.id });
    expect(forCashier.salesCount).toBe(1);

    const forNobody = await getReport(OWNER, start, end, { userId: 'u-other' });
    expect(forNobody.salesCount).toBe(0);

    const recent = await listSales(OWNER, { start, end, userId: CASHIER.id, limit: 15 });
    expect(recent).toHaveLength(1);
  });

  it('leaves voided sales out of the totals but keeps them listable on request', async () => {
    const { start, end } = periodRange('today', NOW);
    db.exec(
      `UPDATE sales SET status = 'voided', void_reason = 'mistake',
        voided_by = ?, voided_at = ? WHERE id = 'sale-1'`,
      OWNER.id,
      NOW,
    );

    const report = await getReport(OWNER, start, end);
    expect(report.salesCount).toBe(0);
    expect(report.totalSales).toBe(0);

    const completed = await listSales(OWNER, { start, end, limit: 15 });
    expect(completed).toHaveLength(0);

    const all = await listSales(OWNER, { start, end, limit: 15, includeVoided: true });
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('voided');
  });
});
