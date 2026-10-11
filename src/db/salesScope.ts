import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * The single source of truth for "which sales belong to a period".
 *
 * The reports summary, the end-of-day cash-up and the recent-sales list all
 * build their sales filter here, so the date window, the voided/completed
 * status and the seller filter can never drift apart and let those screens
 * disagree about the same day.
 *
 * The predicate always references the `sales` table by its `s` alias, so every
 * caller must select `FROM sales s` (use `SALES_FROM`).
 */
export type SalesScopeOptions = {
  /** Inclusive lower bound on `sold_at` (epoch ms). */
  start?: number | null;
  /** Inclusive upper bound on `sold_at` (epoch ms). */
  end?: number | null;
  /** Restrict to a single seller. */
  userId?: string | null;
  /** Include voided sales as well as completed ones (default false). */
  includeVoided?: boolean;
};

export type SalesScope = {
  /** Predicate to place after `WHERE`; references the `s` alias. */
  sql: string;
  params: (number | string)[];
};

/** Every sales-for-period query must select from this alias. */
export const SALES_FROM = 'FROM sales s';

export function buildSalesScope(options: SalesScopeOptions = {}): SalesScope {
  const parts = ['s.deleted_at IS NULL'];
  const params: (number | string)[] = [];

  if (!options.includeVoided) parts.push("s.status = 'completed'");
  if (options.start != null) {
    parts.push('s.sold_at >= ?');
    params.push(options.start);
  }
  if (options.end != null) {
    parts.push('s.sold_at <= ?');
    params.push(options.end);
  }
  if (options.userId != null) {
    parts.push('s.user_id = ?');
    params.push(options.userId);
  }

  return { sql: parts.join(' AND '), params };
}

export type SalesPeriodTotals = { count: number; total: number };

/** Sales count and money total for the period, through the shared scope. */
export async function getSalesPeriodTotals(
  db: Pick<SQLiteDatabase, 'getFirstAsync'>,
  options: SalesScopeOptions,
): Promise<SalesPeriodTotals> {
  const scope = buildSalesScope(options);
  const row = await db.getFirstAsync<{ sales_count: number; sales_total: number }>(
    `SELECT COUNT(*) AS sales_count, COALESCE(SUM(s.total), 0) AS sales_total
       ${SALES_FROM}
      WHERE ${scope.sql}`,
    ...scope.params,
  );
  return { count: row?.sales_count ?? 0, total: row?.sales_total ?? 0 };
}
