/**
 * Pure cart / sale-total maths.
 *
 * Everything is integer kobo. A sale is only valid when the parts add up
 * exactly to the total, so there is never a rounding leak.
 */

import { formatMoney } from '@/lib/money';

export type PaymentDraft = {
  method: 'cash' | 'transfer' | 'pos' | 'credit';
  amount: number;
};

export type CartLine = {
  itemId: string;
  unitId: string | null;
  unitName: string;
  /** Quantity in the chosen unit. */
  quantity: number;
  /** How many base units make one chosen unit. */
  unitsPerBase: number;
  /** Price per chosen unit, in kobo. */
  unitPrice: number;
  /** Cost per base unit at sale time, in kobo. */
  unitCost: number;
};

export function lineTotal(line: CartLine): number {
  const qty = Math.max(0, Math.trunc(line.quantity || 0));
  return Math.max(0, qty * Math.round(line.unitPrice));
}

/** Quantity in base units for a line. */
export function lineQuantityBase(line: CartLine): number {
  const qty = Math.max(0, Math.trunc(line.quantity || 0));
  return qty * Math.max(1, Math.trunc(line.unitsPerBase || 1));
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export type CartTotals = {
  subtotal: number;
  discount: number;
  total: number;
  /** Estimated cost of goods sold for these lines, in kobo. */
  cost: number;
  /** subtotal - cost, before discount. */
  grossProfit: number;
};

/**
 * Totals for a cart.
 * The discount is clamped to `[0, subtotal]` so the total can never go negative.
 */
export function cartTotals(lines: CartLine[], discount: number): CartTotals {
  const subtotal = cartSubtotal(lines);
  const safeDiscount = Math.min(Math.max(0, Math.round(discount || 0)), subtotal);
  const total = subtotal - safeDiscount;
  const cost = lines.reduce((sum, line) => sum + lineQuantityBase(line) * line.unitCost, 0);
  return {
    subtotal,
    discount: safeDiscount,
    total,
    cost,
    grossProfit: subtotal - cost,
  };
}

export type PaymentValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate a payment split against the sale total.
 * - every amount must be >= 0
 * - the amounts must add up to the total exactly
 * - any credit amount requires a customer
 */
export function validatePaymentSplit(
  payments: PaymentDraft[],
  total: number,
  hasCustomer: boolean,
): PaymentValidation {
  const meaningful = payments.filter((p) => p.amount > 0);
  if (meaningful.length === 0) {
    return { ok: false, error: 'Enter how the customer is paying.' };
  }
  for (const p of meaningful) {
    if (!Number.isFinite(p.amount) || p.amount < 0) {
      return { ok: false, error: 'Payment amounts cannot be negative.' };
    }
  }
  const sum = meaningful.reduce((acc, p) => acc + Math.round(p.amount), 0);
  if (sum !== total) {
    const diff = total - sum;
    const hint =
      diff > 0
        ? `Add ${formatMoney(diff)} more.`
        : `Remove ${formatMoney(-diff)} too much.`;
    return { ok: false, error: `Payments must equal the total. ${hint}` };
  }
  const credit = meaningful.find((p) => p.method === 'credit');
  if (credit && !hasCustomer) {
    return { ok: false, error: 'Credit sales need a customer.' };
  }
  return { ok: true };
}

/** Blocks a credit sale entirely when no customer is attached. */
export function creditRequiresCustomer(payments: PaymentDraft[], hasCustomer: boolean): boolean {
  return payments.some((p) => p.method === 'credit' && p.amount > 0) && !hasCustomer;
}

