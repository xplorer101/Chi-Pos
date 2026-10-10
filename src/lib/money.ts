/**
 * Money helpers.
 *
 * Every amount in the app is an integer number of **kobo** (₦1 = 100 kobo).
 * Floats are never used to store or compute money.
 */

export const KOBO_PER_NAIRA = 100;

export const CURRENCY_SYMBOL = '\u20A6'; // ₦

export type MoneyFormatOptions = {
  /** How to render the kobo part. Defaults to `'auto'` (drops `.00`). */
  decimals?: 'auto' | 'always';
  /** Override the currency symbol. Defaults to `₦`. */
  symbol?: string;
  /** Include a leading `+` for positive amounts. Defaults to `false`. */
  sign?: boolean;
};

function toInt(kobo: number): number {
  if (!Number.isFinite(kobo)) return 0;
  return Math.trunc(kobo);
}

/** Group an integer with `,` thousands separators. */
export function groupDigits(value: number): string {
  const negative = value < 0;
  const digits = String(Math.abs(Math.trunc(value)));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += ',';
  }
  return negative ? `-${out}` : out;
}

/**
 * Format an integer kobo amount as currency, e.g. `150000` -> `₦1,500`.
 */
export function formatMoney(kobo: number, options: MoneyFormatOptions = {}): string {
  const { decimals = 'auto', symbol = CURRENCY_SYMBOL, sign = false } = options;
  const total = toInt(kobo);
  const negative = total < 0;
  const abs = Math.abs(total);

  const naira = Math.floor(abs / KOBO_PER_NAIRA);
  const sub = abs % KOBO_PER_NAIRA;

  let out = `${negative ? '-' : ''}${symbol}${groupDigits(naira)}`;

  const showDecimals = decimals === 'always' || (decimals === 'auto' && sub !== 0);
  if (showDecimals) {
    out += `.${String(sub).padStart(2, '0')}`;
  } else if (sign && !negative && total > 0) {
    out = `+${out}`;
  }

  return out;
}

/** Format as a plain number with separators, no currency symbol. `150000` -> `1,500`. */
export function formatNairaAmount(kobo: number, options: MoneyFormatOptions = {}): string {
  return formatMoney(kobo, { ...options, symbol: '' });
}

/**
 * Parse user-entered money text into integer kobo.
 * Accepts `1,500`, `1500.50`, `₦1500`, `1 500.5`. Returns `0` for junk.
 */
export function parseMoneyToKobo(input: string): number {
  if (typeof input !== 'string') return 0;
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * KOBO_PER_NAIRA);
}

/** Safe sum of kobo amounts. */
export function sumKobo(values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (Number.isFinite(v)) total += Math.round(v);
  }
  return total;
}

/** Percentage of `total` taken as a kobo discount, rounded half-up. */
export function percentOf(total: number, percent: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(percent)) return 0;
  return Math.round((total * percent) / 100);
}
