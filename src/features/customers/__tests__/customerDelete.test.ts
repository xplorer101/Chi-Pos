import { customerDeleteBlocked } from '../customerDelete';

describe('customerDeleteBlocked', () => {
  it('blocks deletion while a customer owes money', () => {
    expect(customerDeleteBlocked(100)).toBe(
      'This customer still owes money. Collect the balance before deleting them.',
    );
  });

  it('allows deletion for a settled customer', () => {
    expect(customerDeleteBlocked(0)).toBeNull();
    expect(customerDeleteBlocked(-50)).toBeNull();
  });

  it('treats unknown/garbage balances as settled rather than crashing', () => {
    expect(customerDeleteBlocked(Number.NaN)).toBeNull();
    expect(customerDeleteBlocked(Number.POSITIVE_INFINITY)).toBeNull();
  });
});