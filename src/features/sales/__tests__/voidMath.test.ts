import { paymentReversalIds, voidDebtImpact, voidStockReversal } from '../voidMath';

describe('voidStockReversal', () => {
  it('mirrors every line so stock can be restored', () => {
    const lines = [
      { itemId: 'i1', quantityBase: 3 },
      { itemId: 'i2', quantityBase: 1 },
      { itemId: 'i3', quantityBase: 12 },
    ];
    expect(voidStockReversal(lines)).toEqual(lines);
  });
});

describe('paymentReversalIds', () => {
  it('soft-deletes only that sale\'s payments', () => {
    const payments = [
      { id: 'p1', saleId: 's1' },
      { id: 'p2', saleId: 's1' },
      { id: 'p3', saleId: 's2' },
    ];
    expect(paymentReversalIds(payments, 's1')).toEqual(['p1', 'p2']);
  });
});

describe('voidDebtImpact', () => {
  it('is the unpaid remainder, floored at zero', () => {
    expect(voidDebtImpact(10_000, [{ amount: 4_000 }, { amount: 5_000 }])).toBe(1_000);
  });

  it('is zero when fully paid', () => {
    expect(voidDebtImpact(10_000, [{ amount: 10_000 }])).toBe(0);
    expect(voidDebtImpact(5_000, [{ amount: 5_000 }, { amount: 100 }])).toBe(0);
  });
});