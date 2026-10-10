import { buildPayments, type PaymentMode } from '../sellStore';

const base = {
  paymentMode: 'cash' as PaymentMode,
  split: { cash: 0, transfer: 0, pos: 0, credit: 0 },
  partPaidNow: 0,
  partMethod: 'cash' as const,
};

describe('buildPayments', () => {
  it('pays a single method the full total', () => {
    expect(buildPayments({ ...base, paymentMode: 'transfer' }, 150000)).toEqual([
      { method: 'transfer', amount: 150000 },
    ]);
  });

  it('returns only the split methods with a positive amount', () => {
    expect(
      buildPayments(
        { ...base, paymentMode: 'split', split: { cash: 100000, transfer: 50000, pos: 0, credit: 0 } },
        150000,
      ),
    ).toEqual([
      { method: 'cash', amount: 100000 },
      { method: 'transfer', amount: 50000 },
    ]);
  });

  describe('part payment', () => {
    it('splits into paid-now and credit when partly paid', () => {
      expect(
        buildPayments({ ...base, paymentMode: 'part', partPaidNow: 50000, partMethod: 'pos' }, 150000),
      ).toEqual([
        { method: 'pos', amount: 50000 },
        { method: 'credit', amount: 100000 },
      ]);
    });

    it('sends the whole total to credit when nothing is paid now', () => {
      expect(buildPayments({ ...base, paymentMode: 'part', partPaidNow: 0 }, 150000)).toEqual([
        { method: 'credit', amount: 150000 },
      ]);
    });

    it('becomes a single settled payment when the balance is covered', () => {
      expect(
        buildPayments({ ...base, paymentMode: 'part', partPaidNow: 150000 }, 150000),
      ).toEqual([{ method: 'cash', amount: 150000 }]);
    });

    it('clamps a paid-now amount above the total back to the total', () => {
      expect(
        buildPayments({ ...base, paymentMode: 'part', partPaidNow: 999999 }, 150000),
      ).toEqual([{ method: 'cash', amount: 150000 }]);
    });

    it('treats a negative paid-now amount as full credit', () => {
      expect(
        buildPayments({ ...base, paymentMode: 'part', partPaidNow: -5000 }, 150000),
      ).toEqual([{ method: 'credit', amount: 150000 }]);
    });

    it('rounds a fractional paid-now amount to whole kobo', () => {
      expect(
        buildPayments({ ...base, paymentMode: 'part', partPaidNow: 49999.6 }, 150000),
      ).toEqual([
        { method: 'cash', amount: 50000 },
        { method: 'credit', amount: 100000 },
      ]);
    });

    it('keeps the two parts adding up to the total in whole kobo', () => {
      const payments = buildPayments(
        { ...base, paymentMode: 'part', partMethod: 'pos', partPaidNow: 33333 },
        100000,
      );
      const sum = payments.reduce((acc, payment) => acc + payment.amount, 0);
      expect(sum).toBe(100000);
      expect(payments.every((payment) => Number.isInteger(payment.amount))).toBe(true);
    });
  });
});
