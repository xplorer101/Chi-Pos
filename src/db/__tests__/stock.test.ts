import { checkStock, computeStock, computeStockMap, isLowStock, projectStock } from '../stock';

describe('computeStock', () => {
  it('sums restocks and sales into a current level', () => {
    expect(
      computeStock([
        { quantity_base: 40 }, // restock
        { quantity_base: -6 }, // sale
        { quantity_base: -12 }, // sale
        { quantity_base: 5 }, // adjustment
      ]),
    ).toBe(27);
  });

  it('starts from zero when there is no movement', () => {
    expect(computeStock([])).toBe(0);
  });

  it('ignores soft-deleted movements', () => {
    expect(
      computeStock([
        { quantity_base: 40, deleted_at: null },
        { quantity_base: -6, deleted_at: 1_700_000_000_000 },
        { quantity_base: 100, deleted_at: 1_700_000_000_000 },
      ]),
    ).toBe(40);
  });

  it('ignores malformed quantities', () => {
    expect(
      computeStock([
        { quantity_base: 10 },
        { quantity_base: Number.NaN },
        { quantity_base: Number.POSITIVE_INFINITY },
      ]),
    ).toBe(10);
  });

  it('can go negative when oversold', () => {
    expect(computeStock([{ quantity_base: -3 }])).toBe(-3);
  });
});

describe('stock deduction from a sale', () => {
  it('converts sold units into base-unit movements', () => {
    const saleLines = [
      { quantity: 2, unitsPerBase: 12 }, // 2 cartons of 12
      { quantity: 5, unitsPerBase: 1 }, // 5 singles
    ];
    const deductions = saleLines.map((sale) => -sale.quantity * sale.unitsPerBase);
    expect(deductions).toEqual([-24, -5]);
  });

  it('runs the ledger down by the deducted base units', () => {
    const movements = [{ quantity_base: 60 }, { quantity_base: -24 }, { quantity_base: -5 }];
    expect(computeStock(movements)).toBe(31);
  });
});

describe('computeStockMap', () => {
  it('returns a level for every item, including those with no movements', () => {
    const stock = computeStockMap(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [
        { item_id: 'a', quantity_base: 12 },
        { item_id: 'a', quantity_base: -2 },
        { item_id: 'b', quantity_base: -4 },
      ],
    );
    expect(stock.get('a')).toBe(10);
    expect(stock.get('b')).toBe(-4);
    expect(stock.get('c')).toBe(0);
  });

  it('skips soft-deleted movements', () => {
    const stock = computeStockMap(
      [{ id: 'a' }],
      [
        { item_id: 'a', quantity_base: 8 },
        { item_id: 'a', quantity_base: -8, deleted_at: 1 },
      ],
    );
    expect(stock.get('a')).toBe(8);
  });

  it('ignores movements for items that were not requested', () => {
    const stock = computeStockMap([{ id: 'a' }], [{ item_id: 'ghost', quantity_base: 99 }]);
    expect(stock.get('a')).toBe(0);
    expect(stock.has('ghost')).toBe(false);
  });
});

describe('projectStock', () => {
  it('applies a signed delta', () => {
    expect(projectStock(20, -5)).toBe(15);
    expect(projectStock(20, 5)).toBe(25);
    expect(projectStock(0, -1)).toBe(-1);
  });
});

describe('checkStock', () => {
  it('is always ok for items that do not track stock', () => {
    expect(checkStock({ id: 'svc', tracks_stock: false }, 0, -100)).toEqual({ level: 'ok' });
  });

  it('flags a sale that would take stock negative', () => {
    expect(checkStock({ id: 'a' }, 3, -5)).toEqual({ level: 'negative', projected: -2 });
  });

  it('flags dropping to the low-stock threshold', () => {
    const item = { id: 'a', low_stock_level: 5 };
    expect(checkStock(item, 10, -5)).toEqual({ level: 'low', projected: 5, threshold: 5 });
    expect(checkStock(item, 10, -4)).toEqual({ level: 'ok' });
    expect(checkStock(item, 10, -1)).toEqual({ level: 'ok' });
  });

  it('treats a missing threshold as zero, so only a negative level warns', () => {
    expect(checkStock({ id: 'a' }, 10, -10)).toEqual({ level: 'ok' });
    expect(checkStock({ id: 'a' }, 10, -11)).toEqual({ level: 'negative', projected: -1 });
  });
});

describe('isLowStock', () => {
  it('is true at or below the threshold', () => {
    const item = { id: 'a', low_stock_level: 3 };
    expect(isLowStock(item, 3)).toBe(true);
    expect(isLowStock(item, 2)).toBe(true);
    expect(isLowStock(item, 4)).toBe(false);
  });

  it('treats an empty shelf as low even without a threshold', () => {
    expect(isLowStock({ id: 'a', low_stock_level: 0 }, 0)).toBe(true);
    expect(isLowStock({ id: 'a' }, 0)).toBe(true);
    expect(isLowStock({ id: 'a', low_stock_level: 0 }, 100)).toBe(false);
  });

  it('never fires for untracked items', () => {
    expect(isLowStock({ id: 'svc', tracks_stock: false, low_stock_level: 5 }, 0)).toBe(false);
  });
});
