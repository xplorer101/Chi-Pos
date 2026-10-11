/**
 * Pure maths + access rules for reports. Kept free of SQLite/React imports so
 * it can be unit tested in isolation.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type Reconciliation = {
  totalSales: number;
  /** Cash + transfer + POS received against sales in the range. */
  collected: number;
  /** The unpaid part of credit and part-payment sales in the range. */
  creditGiven: number;
  /** What the parts add up to. */
  expected: number;
  /** `totalSales - expected`; zero when the books balance. */
  difference: number;
  ok: boolean;
};

/**
 * The rule the reports must satisfy: money collected on sales plus the credit
 * given must equal the total sales value for the range.
 */
export function reconcileSales(
  totalSales: number,
  collected: number,
  creditGiven: number,
): Reconciliation {
  const expected = collected + creditGiven;
  const difference = totalSales - expected;
  return { totalSales, collected, creditGiven, expected, difference, ok: difference === 0 };
}

export type DailyBucket = {
  /** Start-of-day timestamp (local). */
  day: number;
  total: number;
  count: number;
};

/**
 * Expands sparse day buckets into one entry per local day in `[start, end]`
 * (both day boundaries), so the daily chart shows zero-sale days too.
 */
export function fillDailyBuckets(
  start: number,
  end: number,
  buckets: DailyBucket[],
): DailyBucket[] {
  const byDay = new Map(buckets.map((bucket) => [bucket.day, bucket]));
  const days: DailyBucket[] = [];
  for (let day = start; day <= end; day += DAY_MS) {
    days.push(byDay.get(day) ?? { day, total: 0, count: 0 });
  }
  return days;
}
