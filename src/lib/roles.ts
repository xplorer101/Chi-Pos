import type { Role } from '@/db/types';

export function roleLabel(role: Role): string {
  return role === 'owner' ? 'Owner' : 'Cashier';
}

export function roleCaption(role: Role): string {
  return role === 'owner'
    ? 'Full access: products, pricing, staff, reports and backups.'
    : 'Sells, records credit and payments, and manages customers.';
}