import {
  CURRENCY_SYMBOL,
  formatMoney,
  formatNairaAmount,
  groupDigits,
  parseMoneyToKobo,
  percentOf,
  sumKobo,
} from '../money';

describe('groupDigits', () => {
  it('inserts thousands separators', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1000)).toBe('1,000');
    expect(groupDigits(1234567)).toBe('1,234,567');
  });

  it('keeps a minus sign outside the separators', () => {
    expect(groupDigits(-45000)).toBe('-45,000');
  });

  it('truncates fractional input', () => {
    expect(groupDigits(1999.9)).toBe('1,999');
  });
});

describe('formatMoney', () => {
  it('formats whole naira without decimals', () => {
    expect(formatMoney(150000)).toBe(`${CURRENCY_SYMBOL}1,500`);
    expect(formatMoney(0)).toBe(`${CURRENCY_SYMBOL}0`);
  });

  it('shows kobo only when there is a remainder', () => {
    expect(formatMoney(150050)).toBe(`${CURRENCY_SYMBOL}1,500.50`);
    expect(formatMoney(99)).toBe(`${CURRENCY_SYMBOL}0.99`);
    expect(formatMoney(1)).toBe(`${CURRENCY_SYMBOL}0.01`);
  });

  it('can always show two decimals', () => {
    expect(formatMoney(150000, { decimals: 'always' })).toBe(`${CURRENCY_SYMBOL}1,500.00`);
    expect(formatMoney(150000, { decimals: 'always', symbol: '' })).toBe('1,500.00');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(-2500)).toBe(`-${CURRENCY_SYMBOL}25`);
    expect(formatMoney(-2550)).toBe(`-${CURRENCY_SYMBOL}25.50`);
  });

  it('truncates non-integer and non-finite input', () => {
    expect(formatMoney(1999.9)).toBe(`${CURRENCY_SYMBOL}19.99`);
    expect(formatMoney(Number.NaN)).toBe(`${CURRENCY_SYMBOL}0`);
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe(`${CURRENCY_SYMBOL}0`);
  });

  it('adds a plus sign only when asked and the amount is positive', () => {
    expect(formatMoney(5000, { sign: true })).toBe(`+${CURRENCY_SYMBOL}50`);
    expect(formatMoney(0, { sign: true })).toBe(`${CURRENCY_SYMBOL}0`);
  });

  it('formats large amounts with separators', () => {
    expect(formatMoney(250000000)).toBe(`${CURRENCY_SYMBOL}2,500,000`);
  });
});

describe('formatNairaAmount', () => {
  it('drops the currency symbol', () => {
    expect(formatNairaAmount(150000)).toBe('1,500');
  });
});

describe('parseMoneyToKobo', () => {
  it('parses plain naira text', () => {
    expect(parseMoneyToKobo('1500')).toBe(150000);
    expect(parseMoneyToKobo('0')).toBe(0);
  });

  it('parses decimals as kobo', () => {
    expect(parseMoneyToKobo('1500.50')).toBe(150050);
    expect(parseMoneyToKobo('0.99')).toBe(99);
    expect(parseMoneyToKobo('100.1')).toBe(10010);
  });

  it('ignores currency symbols, spaces and thousands separators', () => {
    expect(parseMoneyToKobo('₦1,500')).toBe(150000);
    expect(parseMoneyToKobo(' 1 500.5 ')).toBe(150050);
  });

  it('returns 0 for junk', () => {
    expect(parseMoneyToKobo('')).toBe(0);
    expect(parseMoneyToKobo('-')).toBe(0);
    expect(parseMoneyToKobo('abc')).toBe(0);
    expect(parseMoneyToKobo('12abc')).toBe(1200);
  });

  it('round-trips with formatMoney for whole naira', () => {
    const kobo = 987654;
    expect(parseMoneyToKobo(formatNairaAmount(kobo))).toBe(kobo);
  });
});

describe('sumKobo', () => {
  it('sums integer kobo amounts', () => {
    expect(sumKobo([100, 250, 750])).toBe(1100);
    expect(sumKobo([])).toBe(0);
  });

  it('ignores non-finite values and rounds fractions', () => {
    expect(sumKobo([100, Number.NaN, Number.POSITIVE_INFINITY, 140.6])).toBe(241);
  });
});

describe('percentOf', () => {
  it('rounds half-up to whole kobo', () => {
    expect(percentOf(1000, 10)).toBe(100);
    expect(percentOf(333, 50)).toBe(167);
    expect(percentOf(199, 0)).toBe(0);
  });

  it('returns 0 for invalid input', () => {
    expect(percentOf(Number.NaN, 10)).toBe(0);
    expect(percentOf(1000, Number.NaN)).toBe(0);
  });
});
