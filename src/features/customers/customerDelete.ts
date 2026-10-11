/**
 * Deleting a customer would strand their sales and debt, so it is refused
 * while they still owe money. Returns a friendly reason or null when allowed.
 */
export function customerDeleteBlocked(owedKobo: number): string | null {
  if (Number.isFinite(owedKobo) && owedKobo > 0) {
    return 'This customer still owes money. Collect the balance before deleting them.';
  }
  return null;
}