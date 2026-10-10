import {
  DAY_MS,
  canViewProfit,
  fillDailyBuckets,
  reconcileSales,
} from '../reportMath';

const DAY0 = new Date(2026, 9, 7, 0, 0, 0, 0).getTime();

describe('reconcileSales', () => {
  it('balances when collected plus credit equals total', () => {
    const result = reconcileSales(150000, 100000, 50000);
    expect(result.expected).toBe(150000);
    expect(result.difference).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('flags a shortfall (credit understated)', () => {
    const result = reconcileSales(150000, 100000, 40000);
    expect(result.difference).toBe(10000);
    expect(result.ok).toBe(false);
  });

  it('flags an over-count', () => {
    const result = reconcileSales(150000, 160000, 0);
    expect(result.difference).toBe(-10000);
    expect(result.ok).toBe(false);
  });

  it('treats a fully credit sale as collected 0', () => {
    expect(reconcileSales(50000, 0, 50000).ok).toBe(true);
  });

  it('treats a fully paid sale as credit 0', () => {
    expect(reconcileSales(50000, 50000, 0).ok).toBe(true);
  });
});

describe('fillDailyBuckets', () => {
  it('fills missing days with zeros across a range', () => {
    const days = fillDailyBuckets(DAY0, DAY0 + 3 * DAY_MS, [
      { day: DAY0, total: 1000, count: 1 },
      { day: DAY0 + 2 * DAY_MS, total: 500, count: 2 },
    ]);
    expect(days).toHaveLength(4);
    expect(days[0]).toEqual({ day: DAY0, total: 1000, count: 1 });
    expect(days[1]).toEqual({ day: DAY0 + DAY_MS, total: 0, count: 0 });
    expect(days[2]).toEqual({ day: DAY0 + 2 * DAY_MS, total: 500, count: 2 });
    expect(days[3]).toEqual({ day: DAY0 + 3 * DAY_MS, total: 0, count: 0 });
  });

  it('returns a single day for a one-day range', () => {
    expect(fillDailyBuckets(DAY0, DAY0, [])).toEqual([{ day: DAY0, total: 0, count: 0 }]);
  });
});

describe('canViewProfit', () => {
  it('is visible until Step 4 introduces roles', () => {
    expect(canViewProfit()).toBe(true);
  });
});
