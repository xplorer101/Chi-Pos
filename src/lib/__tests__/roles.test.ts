import { roleCaption, roleLabel } from '../roles';

describe('roleLabel', () => {
  it('labels both roles', () => {
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('cashier')).toBe('Cashier');
  });
});

describe('roleCaption', () => {
  it('explains the owner role', () => {
    expect(roleCaption('owner')).toContain('Full access');
  });

  it('explains the cashier role without privileged powers', () => {
    const caption = roleCaption('cashier');
    expect(caption).toContain('Sells');
    expect(caption).not.toMatch(/\bprofit\b/i);
  });
});