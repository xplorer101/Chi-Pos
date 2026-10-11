import type { Payment, SaleLine } from '@/db/types';

export type StockReversal = { itemId: string; quantityBase: number };

/**
 * A void returns every sold base unit to stock. Returns one entry per line in
 * the same order, so the repo can create matching stock movements.
 */
export function voidStockReversal(
  lines: Pick<SaleLine, 'itemId' | 'quantityBase'>[],
): StockReversal[] {
  return lines.map((line) => ({ itemId: line.itemId, quantityBase: line.quantityBase }));
}

/**
 * Payments taken against a voided sale must be reversed, otherwise the derived
 * customer balance would go negative. Returns the payment ids to soft-delete.
 */
export function paymentReversalIds(
  payments: Pick<Payment, 'id' | 'saleId'>[],
  saleId: string,
): string[] {
  return payments.filter((payment) => payment.saleId === saleId).map((payment) => payment.id);
}

/**
 * The outstanding credit on a sale that disappears from a customer's balance
 * when the sale is voided: `total - paid`, floored at zero. In kobo.
 */
export function voidDebtImpact(
  saleTotal: number,
  payments: Pick<Payment, 'amount'>[],
): number {
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  return Math.max(0, saleTotal - paid);
}
