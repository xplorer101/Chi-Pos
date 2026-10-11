import {
  assertPermission,
  can,
  canViewProfit,
  MATRIX,
  PermissionError,
  roleHas,
  type Permission,
} from '@/features/auth/permissions';
import type { ActingUser } from '@/db/types';

const owner: ActingUser = { id: 'u1', name: 'Owner', role: 'owner' };
const cashier: ActingUser = { id: 'u2', name: 'Cashier', role: 'cashier' };

const OWNER_ONLY: Permission[] = [
  'delete_customer',
  'view_all_sales',
  'view_reports',
  'view_profit',
  'manage_items',
  'change_price',
  'change_cost',
  'adjust_stock',
  'void_sale',
  'manage_staff',
  'change_settings',
  'backup_restore',
];

const CASHIER_PERMITTED: Permission[] = [
  'make_sale',
  'record_debt_payment',
  'manage_customers',
  'view_receipts',
  'view_own_sales',
];

describe('MATRIX', () => {
  it('owner holds every permission', () => {
    for (const permission of MATRIX.owner) expect(roleHas('owner', permission)).toBe(true);
    expect(MATRIX.owner.length).toBeGreaterThanOrEqual(17);
  });

  it('cashier is denied every owner-only permission', () => {
    for (const permission of OWNER_ONLY) expect(roleHas('cashier', permission)).toBe(false);
  });

  it('cashier keeps the day-to-day permissions', () => {
    for (const permission of CASHIER_PERMITTED) expect(roleHas('cashier', permission)).toBe(true);
  });
});

describe('can', () => {
  it('denies for missing users', () => {
    expect(can(null, 'make_sale')).toBe(false);
    expect(can(undefined, 'make_sale')).toBe(false);
  });

  it('follows the matrix for known roles', () => {
    expect(can(cashier, 'void_sale')).toBe(false);
    expect(can(owner, 'void_sale')).toBe(true);
    expect(can(cashier, 'view_own_sales')).toBe(true);
    expect(can(cashier, 'view_all_sales')).toBe(false);
  });
});

describe('assertPermission', () => {
  it('passes for permitted users', () => {
    expect(() => assertPermission(owner, 'change_settings')).not.toThrow();
    expect(() => assertPermission(cashier, 'make_sale')).not.toThrow();
  });

  it('throws PermissionError otherwise', () => {
    let caught: unknown;
    try {
      assertPermission(cashier, 'void_sale');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PermissionError);
    expect((caught as PermissionError).permission).toBe('void_sale');
    expect(caught).toMatchObject({ name: 'PermissionError' });
    expect((caught as Error).message).toBe('Not allowed: void sale');
  });
});

describe('canViewProfit', () => {
  it('is owner-only', () => {
    expect(canViewProfit(owner)).toBe(true);
    expect(canViewProfit(cashier)).toBe(false);
    expect(canViewProfit(null)).toBe(false);
  });
});