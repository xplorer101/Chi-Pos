import { getDb } from '../index';
import { mapItemWithStock, type ItemRow } from '../mappers';
import { buildSalesScope, getSalesPeriodTotals } from '../salesScope';
import { DAY_MS, fillDailyBuckets, reconcileSales, type DailyBucket, type Reconciliation } from '@/features/reports/reportMath';
import { assertPermission } from '@/features/auth/permissions';
import type { ActingUser, ItemWithStock, PaymentMethod } from '../types';

export type ReportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export type MethodTotal = { method: PaymentMethod; amount: number };

export type CollectedByMethod = {
  cash: number;
  transfer: number;
  pos: number;
  /** cash + transfer + POS. */
  total: number;
};

export type TopSeller = {
  itemId: string;
  name: string;
  quantityBase: number;
  revenue: number;
  saleCount: number;
};

export type ReportData = {
  start: number;
  end: number;
  totalSales: number;
  salesCount: number;
  itemsSoldCount: number;
  /** Every payment method used by sales in the range (credit included). */
  byMethod: MethodTotal[];
  /** Money actually collected on sales in the range (credit excluded). */
  collected: CollectedByMethod;
  /** Unpaid part of credit / part-payment sales in the range. */
  creditGiven: number;
  costOfGoods: number;
  profit: number;
  /** Payments received against older debts, by the payment's own date. */
  debtPayments: { count: number; total: number };
  topSellers: TopSeller[];
  lowStock: ItemWithStock[];
  outstandingDebt: number;
  daily: DailyBucket[];
  /** Sale lines whose unit cost was back-filled (estimated COGS), in range. */
  estimatedCostLines: number;
  /** Self-check: collected + creditGiven must equal totalSales. */
  reconciliation: Reconciliation;
};

const OWED_SUBQUERY = `
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
  ), 0)
`;

export async function getReport(
  actor: ActingUser,
  start: number,
  end: number,
  options: { userId?: string } = {},
): Promise<ReportData> {
  assertPermission(actor, 'view_reports');
  const db = getDb();

  // A single seller filter is honoured whenever one is requested; only
  // filtering to somebody else needs the wider permission.
  let userId: string | null = null;
  if (options.userId != null) {
    if (options.userId !== actor.id) assertPermission(actor, 'view_all_sales');
    userId = options.userId;
  }
  const scope = buildSalesScope({ start, end, userId });

  const totals = await getSalesPeriodTotals(db, { start, end, userId });

  const units = await db.getFirstAsync<{ items_sold: number }>(
    `SELECT COALESCE(SUM(sl.quantity), 0) AS items_sold
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE sl.deleted_at IS NULL
        AND ${scope.sql}`,
    ...scope.params,
  );

  const methodRows = await db.getAllAsync<{ method: PaymentMethod; amount: number }>(
    `SELECT p.method AS method, COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
      WHERE p.deleted_at IS NULL
        AND ${scope.sql}
      GROUP BY p.method
      ORDER BY amount DESC`,
    ...scope.params,
  );

  const cost = await db.getFirstAsync<{ cogs: number }>(
    `SELECT COALESCE(SUM(sl.unit_cost * sl.quantity_base), 0) AS cogs
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE sl.deleted_at IS NULL
        AND ${scope.sql}`,
    ...scope.params,
  );

  const profit = await db.getFirstAsync<{ profit: number }>(
    `SELECT COALESCE(SUM(sl.line_total - sl.unit_cost * sl.quantity_base), 0) AS profit
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE sl.deleted_at IS NULL
        AND ${scope.sql}`,
    ...scope.params,
  );

  const estimated = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE sl.deleted_at IS NULL
        AND sl.cost_estimated = 1
        AND ${scope.sql}`,
    ...scope.params,
  );

  // Money put toward debts taken before this range. Keyed on the payment's own
  // date, so backdated debt payments land on the day they were received.
  const debt = await db.getFirstAsync<{ payment_count: number; total: number }>(
    `SELECT COUNT(*) AS payment_count, COALESCE(SUM(amount), 0) AS total
       FROM payments
      WHERE deleted_at IS NULL AND sale_id IS NULL
        AND paid_at >= ? AND paid_at <= ?`,
    start,
    end,
  );

  const topRows = await db.getAllAsync<{
    item_id: string;
    name: string | null;
    quantity_base: number;
    revenue: number;
    sale_count: number;
  }>(
    `SELECT sl.item_id,
            i.name,
            COALESCE(SUM(sl.quantity_base), 0) AS quantity_base,
            COALESCE(SUM(sl.line_total), 0) AS revenue,
            COUNT(DISTINCT sl.sale_id) AS sale_count
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN items i ON i.id = sl.item_id
      WHERE sl.deleted_at IS NULL
        AND ${scope.sql}
      GROUP BY sl.item_id
      ORDER BY quantity_base DESC, revenue DESC
      LIMIT 10`,
    ...scope.params,
  );

  // Group sales into local days. The offset converts the stored UTC epoch to
  // the device's local wall clock before splitting on day boundaries.
  const offsetMs = -new Date(start).getTimezoneOffset() * 60_000;
  const dayRows = await db.getAllAsync<{ day_index: number; day_count: number; total: number }>(
    `SELECT CAST((s.sold_at + ?) / 86400000 AS INTEGER) AS day_index,
            COUNT(*) AS day_count,
            COALESCE(SUM(s.total), 0) AS total
       FROM sales s
      WHERE ${scope.sql}
      GROUP BY day_index
      ORDER BY day_index ASC`,
    offsetMs,
    ...scope.params,
  );

  const amountOf = (method: PaymentMethod) =>
    methodRows.find((row) => row.method === method)?.amount ?? 0;

  const collected: CollectedByMethod = {
    cash: amountOf('cash'),
    transfer: amountOf('transfer'),
    pos: amountOf('pos'),
    total: 0,
  };
  collected.total = collected.cash + collected.transfer + collected.pos;
  const creditGiven = amountOf('credit');
  const totalSales = totals.total;

  const lowStock = await getLowStockItems(actor);
  const outstandingDebt = await getOutstandingDebt();

  const daily = fillDailyBuckets(
    start,
    end,
    dayRows.map((row) => ({
      day: row.day_index * DAY_MS - offsetMs,
      total: row.total,
      count: row.day_count,
    })),
  );

  return {
    start,
    end,
    totalSales,
    salesCount: totals.count,
    itemsSoldCount: units?.items_sold ?? 0,
    byMethod: methodRows.filter((row) => row.amount > 0),
    collected,
    creditGiven,
    costOfGoods: cost?.cogs ?? 0,
    profit: profit?.profit ?? 0,
    debtPayments: { count: debt?.payment_count ?? 0, total: debt?.total ?? 0 },
    topSellers: topRows.map((row) => ({
      itemId: row.item_id,
      name: row.name ?? 'Deleted item',
      quantityBase: row.quantity_base,
      revenue: row.revenue,
      saleCount: row.sale_count,
    })),
    lowStock,
    outstandingDebt,
    estimatedCostLines: estimated?.c ?? 0,
    daily,
    reconciliation: reconcileSales(totalSales, collected.total, creditGiven),
  };
}

/** Items at or below their low-stock level (tracked stock only). */
export async function getLowStockItems(actor: ActingUser): Promise<ItemWithStock[]> {
  assertPermission(actor, 'view_reports');
  const db = getDb();
  const rows = await db.getAllAsync<ItemRow>(
    `SELECT * FROM (
        SELECT i.*,
               COALESCE((
                 SELECT SUM(sm.quantity_base)
                   FROM stock_movements sm
                  WHERE sm.item_id = i.id AND sm.deleted_at IS NULL
               ), 0) AS stock
          FROM items i
         WHERE i.deleted_at IS NULL AND i.tracks_stock = 1
      ) WHERE stock <= low_stock_level
      ORDER BY stock ASC, name COLLATE NOCASE ASC`,
  );
  return rows.map(mapItemWithStock);
}

/** Total money owed by customers across the whole shop. */
export async function getOutstandingDebt(): Promise<number> {
  const db = getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(balance), 0) AS total FROM (
        SELECT ${OWED_SUBQUERY} AS balance
          FROM customers c
         WHERE c.deleted_at IS NULL
      ) WHERE balance > 0`,
  );
  return row?.total ?? 0;
}

export type EndOfDaySummary = {
  start: number;
  end: number;
  salesCount: number;
  salesTotal: number;
  /** Cash expected in the drawer: cash from sales + cash debt payments. */
  expectedCash: number;
  cashFromSales: number;
  cashFromDebtPayments: number;
  /** Everything received today that is not physical cash. */
  nonCash: number;
  creditExtended: number;
};

export async function getEndOfDaySummary(
  actor: ActingUser,
  now: number = Date.now(),
): Promise<EndOfDaySummary> {
  assertPermission(actor, 'view_reports');
  const db = getDb();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const end = startMs + DAY_MS - 1;

  // Same shared scope as the reports summary, so the two cards always agree.
  const sales = await getSalesPeriodTotals(db, { start: startMs, end });

  const payments = await db.getFirstAsync<{
    cash_sales: number;
    cash_debt: number;
    non_cash: number;
    credit: number;
  }>(
    `SELECT
        COALESCE(SUM(CASE WHEN sale_id IS NOT NULL AND method = 'cash' THEN amount ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN sale_id IS NULL AND method = 'cash' THEN amount ELSE 0 END), 0) AS cash_debt,
        COALESCE(SUM(CASE WHEN method IN ('transfer', 'pos') THEN amount ELSE 0 END), 0) AS non_cash,
        COALESCE(SUM(CASE WHEN method = 'credit' THEN amount ELSE 0 END), 0) AS credit
       FROM payments
      WHERE deleted_at IS NULL AND paid_at >= ? AND paid_at <= ?`,
    startMs,
    end,
  );

  const cashFromSales = payments?.cash_sales ?? 0;
  const cashFromDebtPayments = payments?.cash_debt ?? 0;

  return {
    start: startMs,
    end,
    salesCount: sales.count,
    salesTotal: sales.total,
    cashFromSales,
    cashFromDebtPayments,
    expectedCash: cashFromSales + cashFromDebtPayments,
    nonCash: payments?.non_cash ?? 0,
    creditExtended: payments?.credit ?? 0,
  };
}
