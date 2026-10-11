import type {
  AuditEntry,
  Customer,
  CustomerWithBalance,
  Item,
  ItemUnit,
  ItemWithStock,
  Payment,
  Sale,
  SaleLine,
  Settings,
  StockMovement,
  User,
} from './types';

/** Raw row shapes as they come back from SQLite (snake_case). */
export type SettingsRow = {
  id: string;
  shop_name: string;
  business_type: string;
  currency: string;
  owner_pin_hash: string | null;
  receipt_footer: string;
  shop_address?: string | null;
  shop_phone?: string | null;
  auto_lock_minutes?: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
};

export type UserRow = {
  id: string;
  name: string;
  role: string;
  pin_hash: string | null;
  pin_salt: string | null;
  recovery_hash: string | null;
  recovery_salt: string | null;
  is_active: number;
  failed_attempts: number;
  locked_until: number | null;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
};

export type AuditRow = {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  detail: string | null;
  created_at: number;
};

export type ItemRow = {
  id: string;
  name: string;
  category: string;
  tracks_stock: number;
  low_stock_level: number;
  cost_price: number;
  selling_price: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
  stock?: number;
};

export type ItemUnitRow = {
  id: string;
  item_id: string;
  unit_name: string;
  units_per_base: number;
  selling_price: number;
  is_base: number;
  sort_order: number;
  barcode: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
};

export type StockMovementRow = {
  id: string;
  item_id: string;
  type: string;
  quantity_base: number;
  unit_cost: number;
  reference_id: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
};

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
  owed?: number;
};

export type SaleRow = {
  id: string;
  receipt_no: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  sold_at: number;
  user_id?: string | null;
  void_reason?: string | null;
  voided_by?: string | null;
  voided_at?: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
};

export type SaleLineRow = {
  id: string;
  sale_id: string;
  item_id: string;
  unit_id: string | null;
  unit_name: string;
  quantity: number;
  units_per_base: number;
  quantity_base: number;
  unit_price: number;
  line_total: number;
  unit_cost: number;
  cost_estimated?: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
  item_name?: string;
};

export type PaymentRow = {
  id: string;
  sale_id: string | null;
  customer_id: string | null;
  method: string;
  amount: number;
  paid_at: number;
  note: string | null;
  user_id?: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
};

type BaseRow = {
  id: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  device_id: string;
};

function baseFields(row: BaseRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deviceId: row.device_id,
  };
}

export function mapSettings(row: SettingsRow): Settings {
  return {
    ...baseFields(row),
    shopName: row.shop_name,
    businessType: row.business_type as Settings['businessType'],
    currency: row.currency,
    ownerPinHash: row.owner_pin_hash,
    receiptFooter: row.receipt_footer,
    shopAddress: row.shop_address ?? '',
    shopPhone: row.shop_phone ?? '',
    autoLockMinutes: row.auto_lock_minutes ?? 5,
  };
}

export function mapUser(row: UserRow): User {
  return {
    ...baseFields(row),
    name: row.name,
    role: row.role as User['role'],
    pinHash: row.pin_hash,
    pinSalt: row.pin_salt,
    recoveryHash: row.recovery_hash,
    recoverySalt: row.recovery_salt,
    isActive: row.is_active === 1,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
  };
}

export function mapAuditEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role,
    action: row.action as AuditEntry['action'],
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

export function mapItem(row: ItemRow): Item {
  return {
    ...baseFields(row),
    name: row.name,
    category: row.category,
    tracksStock: row.tracks_stock === 1,
    lowStockLevel: row.low_stock_level,
    costPrice: row.cost_price,
    sellingPrice: row.selling_price,
  };
}

export function mapItemWithStock(row: ItemRow): ItemWithStock {
  return { ...mapItem(row), stock: row.stock ?? 0 };
}

export function mapUnit(row: ItemUnitRow): ItemUnit {
  return {
    ...baseFields(row),
    itemId: row.item_id,
    unitName: row.unit_name,
    unitsPerBase: row.units_per_base,
    sellingPrice: row.selling_price,
    isBase: row.is_base === 1,
    sortOrder: row.sort_order,
    barcode: row.barcode,
  };
}

export function mapMovement(row: StockMovementRow): StockMovement {
  return {
    ...baseFields(row),
    itemId: row.item_id,
    type: row.type as StockMovement['type'],
    quantityBase: row.quantity_base,
    unitCost: row.unit_cost,
    referenceId: row.reference_id,
    note: row.note,
  };
}

export function mapCustomer(row: CustomerRow): Customer {
  return {
    ...baseFields(row),
    name: row.name,
    phone: row.phone,
    notes: row.notes,
  };
}

export function mapCustomerWithBalance(row: CustomerRow): CustomerWithBalance {
  return { ...mapCustomer(row), owed: row.owed ?? 0 };
}

export function mapSale(row: SaleRow): Sale {
  return {
    ...baseFields(row),
    receiptNo: row.receipt_no,
    customerId: row.customer_id,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    status: row.status as Sale['status'],
    soldAt: row.sold_at,
    userId: row.user_id ?? null,
    voidReason: row.void_reason ?? null,
    voidedBy: row.voided_by ?? null,
    voidedAt: row.voided_at ?? null,
  };
}

export function mapSaleLine(row: SaleLineRow): SaleLine & { itemName: string } {
  return {
    ...baseFields(row),
    saleId: row.sale_id,
    itemId: row.item_id,
    unitId: row.unit_id,
    unitName: row.unit_name,
    quantity: row.quantity,
    unitsPerBase: row.units_per_base,
    quantityBase: row.quantity_base,
    unitPrice: row.unit_price,
    lineTotal: row.line_total,
    unitCost: row.unit_cost,
    costEstimated: (row.cost_estimated ?? 0) === 1,
    itemName: row.item_name ?? '',
  };
}

export function mapPayment(row: PaymentRow): Payment {
  return {
    ...baseFields(row),
    saleId: row.sale_id,
    customerId: row.customer_id,
    method: row.method as Payment['method'],
    amount: row.amount,
    paidAt: row.paid_at,
    note: row.note,
    userId: row.user_id ?? null,
  };
}
