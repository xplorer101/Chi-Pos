import {
  cartSubtotal,
  cartTotals,
  creditRequiresCustomer,
  lineQuantityBase,
  lineTotal,
  validatePaymentSplit,
  type CartLine,
} from '../cart';
import { computeStock } from '@/db/stock';

const line = (over: Partial<CartLine> = {}): CartLine => ({
  itemId: 'item-1',
  unitId: null,
  unitName: 'Single',
  quantity: 1,
  unitsPerBase: 1,
  unitPrice: 0,
  unitCost: 0,
  ...over,
});

describe('lineTotal', () => {
  it('multiplies quantity by the unit price in kobo', () => {
    expect(lineTotal(line({ quantity: 3, unitPrice: 125050 }))).toBe(375150);
  });

  it('truncates fractional quantities', () => {
    expect(lineTotal(line({ quantity: 2.7, unitPrice: 1000 }))).toBe(2000);
  });

  it('never goes negative', () => {
    expect(lineTotal(line({ quantity: -2, unitPrice: 1000 }))).toBe(0);
    expect(lineTotal(line({ quantity: 2, unitPrice: -1000 }))).toBe(0);
    expect(lineTotal(line({ quantity: 0 }))).toBe(0);
  });
});

describe('lineQuantityBase', () => {
  it('converts chosen units into base units', () => {
    expect(lineQuantityBase(line({ quantity: 3, unitsPerBase: 12 }))).toBe(36);
  });

  it('never multiplies by less than one base unit', () => {
    expect(lineQuantityBase(line({ quantity: 3, unitsPerBase: 0 }))).toBe(3);
    expect(lineQuantityBase(line({ quantity: 3, unitsPerBase: undefined as unknown as 1 }))).toBe(3);
  });
});

describe('stock deduction for a sale', () => {
  const cart = [
    line({ itemId: 'carton', quantity: 2, unitsPerBase: 12 }),
    line({ itemId: 'carton', quantity: 3, unitsPerBase: 1 }),
  ];

  it('deducts the sum of converted base units across every line', () => {
    const deducted = cart.reduce((sum, l) => sum + lineQuantityBase(l), 0);
    expect(deducted).toBe(27);
  });

  it('writes matching movements and runs the stock ledger down', () => {
    const movements = [
      { quantity_base: 30 },
      ...cart.map((l) => ({ quantity_base: -lineQuantityBase(l) })),
    ];
    expect(computeStock(movements)).toBe(3);
  });

  it('1 carton of 12 units removes exactly 12 base units', () => {
    expect(lineQuantityBase(line({ quantity: 1, unitsPerBase: 12 }))).toBe(12);
    expect(computeStock([{ quantity_base: 12 }, { quantity_base: -12 }])).toBe(0);
  });
});

describe('cartSubtotal', () => {
  it('adds up every line', () => {
    expect(
      cartSubtotal([
        line({ quantity: 2, unitPrice: 50000 }),
        line({ quantity: 1, unitPrice: 12500 }),
        line({ quantity: 0, unitPrice: 99000 }),
      ]),
    ).toBe(112500);
  });

  it('is zero for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0);
  });
});

describe('cartTotals', () => {
  it('computes subtotal, total, cost and gross profit', () => {
    const totals = cartTotals(
      [
        line({ quantity: 2, unitPrice: 50000, unitsPerBase: 1, unitCost: 30000 }),
        line({ quantity: 1, unitPrice: 25000, unitsPerBase: 1, unitCost: 15000 }),
      ],
      10000,
    );
    expect(totals.subtotal).toBe(125000);
    expect(totals.discount).toBe(10000);
    expect(totals.total).toBe(115000);
    expect(totals.cost).toBe(75000);
    expect(totals.grossProfit).toBe(50000);
  });

  it('prices cost by base units, not chosen units', () => {
    const totals = cartTotals(
      [line({ quantity: 2, unitPrice: 40000, unitsPerBase: 6, unitCost: 500 })],
      0,
    );
    expect(totals.subtotal).toBe(80000);
    expect(totals.cost).toBe(12 * 500);
  });

  it('clamps the discount to the subtotal', () => {
    const lines = [line({ quantity: 1, unitPrice: 5000 })];
    expect(cartTotals(lines, 999999).total).toBe(0);
    expect(cartTotals(lines, 999999).discount).toBe(5000);
    expect(cartTotals(lines, -500).discount).toBe(0);
    expect(cartTotals(lines, -500).total).toBe(5000);
  });

  it('handles an empty cart', () => {
    expect(cartTotals([], 0)).toEqual({
      subtotal: 0,
      discount: 0,
      total: 0,
      cost: 0,
      grossProfit: 0,
    });
  });

  it('keeps everything in whole kobo', () => {
    const totals = cartTotals([line({ quantity: 3, unitPrice: 3333, unitCost: 1111 })], 0);
    expect(totals.subtotal).toBe(9999);
    expect(totals.cost).toBe(3333);
    expect(Number.isInteger(totals.total)).toBe(true);
    expect(Number.isInteger(totals.grossProfit)).toBe(true);
  });
});

describe('validatePaymentSplit', () => {
  it('rejects an empty payment', () => {
    expect(validatePaymentSplit([], 100000, false)).toEqual({
      ok: false,
      error: 'Enter how the customer is paying.',
    });
    expect(validatePaymentSplit([{ method: 'cash', amount: 0 }], 100000, false)).toEqual({
      ok: false,
      error: 'Enter how the customer is paying.',
    });
  });

  it('rejects when the payments do not add up exactly', () => {
    const short = validatePaymentSplit([{ method: 'cash', amount: 100000 }], 150000, false);
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toBe('Payments must equal the total. Add ₦500 more.');

    const over = validatePaymentSplit([{ method: 'cash', amount: 200000 }], 150000, false);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toBe('Payments must equal the total. Remove ₦500 too much.');
  });

  it('requires a customer for credit', () => {
    const without = validatePaymentSplit([{ method: 'credit', amount: 150000 }], 150000, false);
    expect(without).toEqual({ ok: false, error: 'Credit sales need a customer.' });
    expect(validatePaymentSplit([{ method: 'credit', amount: 150000 }], 150000, true)).toEqual({
      ok: true,
    });
  });

  it('accepts a split that adds up exactly', () => {
    expect(
      validatePaymentSplit(
        [
          { method: 'cash', amount: 100000 },
          { method: 'transfer', amount: 50000 },
        ],
        150000,
        false,
      ),
    ).toEqual({ ok: true });
  });

  it('accepts a split that mixes cash and credit', () => {
    expect(
      validatePaymentSplit(
        [
          { method: 'cash', amount: 50000 },
          { method: 'credit', amount: 100000 },
        ],
        150000,
        true,
      ),
    ).toEqual({ ok: true });
  });

  it('ignores zero-value rows in a split', () => {
    expect(
      validatePaymentSplit(
        [
          { method: 'cash', amount: 150000 },
          { method: 'transfer', amount: 0 },
        ],
        150000,
        false,
      ),
    ).toEqual({ ok: true });
  });
});

describe('creditRequiresCustomer', () => {
  it('is true only when credit is used without a customer', () => {
    expect(creditRequiresCustomer([{ method: 'credit', amount: 100 }], false)).toBe(true);
    expect(creditRequiresCustomer([{ method: 'credit', amount: 100 }], true)).toBe(false);
    expect(creditRequiresCustomer([{ method: 'cash', amount: 100 }], false)).toBe(false);
    expect(creditRequiresCustomer([{ method: 'credit', amount: 0 }], false)).toBe(false);
  });
});
