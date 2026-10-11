import type { ActingUser, Role } from '@/db/types';

export type Permission =
  | 'make_sale'
  | 'record_debt_payment'
  | 'manage_customers'
  | 'delete_customer'
  | 'view_receipts'
  | 'view_own_sales'
  | 'view_all_sales'
  | 'view_reports'
  | 'view_profit'
  | 'manage_items'
  | 'change_price'
  | 'change_cost'
  | 'adjust_stock'
  | 'void_sale'
  | 'manage_staff'
  | 'change_settings'
  | 'backup_restore';

const OWNER: Permission[] = [
  'make_sale',
  'record_debt_payment',
  'manage_customers',
  'delete_customer',
  'view_receipts',
  'view_own_sales',
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

const CASHIER: Permission[] = [
  'make_sale',
  'record_debt_payment',
  'manage_customers',
  'view_receipts',
  'view_own_sales',
];

/** The single source of truth for who may do what. */
export const MATRIX: Record<Role, readonly Permission[]> = {
  owner: OWNER,
  cashier: CASHIER,
};

export class PermissionError extends Error {
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Not allowed: ${permission.replace(/_/g, ' ')}`);
    this.name = 'PermissionError';
    this.permission = permission;
  }
}

export function roleHas(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function can(user: ActingUser | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return roleHas(user.role, permission);
}

/** Throws PermissionError unless the acting user holds the permission. */
export function assertPermission(
  user: ActingUser | null | undefined,
  permission: Permission,
): asserts user is ActingUser {
  if (!can(user, permission)) throw new PermissionError(permission);
}

/** Only the owner may ever see cost, COGS or profit figures. */
export function canViewProfit(user: ActingUser | null | undefined): boolean {
  return can(user, 'view_profit');
}
