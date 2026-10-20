/** Shared domain types. Money is always an integer number of kobo. */

export type BusinessType = 'provision_shop';

export type StockMovementType = 'sale' | 'restock' | 'adjustment';

export type PaymentMethod = 'cash' | 'transfer' | 'pos' | 'credit';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'transfer', 'pos', 'credit'];

export type SaleStatus = 'completed' | 'voided';

export type Role = 'owner' | 'cashier';

/**
 * How this device participates in multi-device mode.
 * - `standalone`: the classic single-phone setup (default).
 * - `admin`: hosts the real database and a local server for cashier phones.
 * - `cashier`: pairs with an admin phone and syncs over the local network.
 */
export type DeviceMode = 'standalone' | 'admin' | 'cashier';

export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
}

export interface User extends BaseEntity {
  name: string;
  role: Role;
  /** Salted PIN digest, or null when the user has no PIN yet. */
  pinHash: string | null;
  pinSalt: string | null;
  /** Owner-only: salted digest of the one-time recovery code. */
  recoveryHash: string | null;
  recoverySalt: string | null;
  isActive: boolean;
  /** Consecutive wrong PIN attempts (reset on a good login). */
  failedAttempts: number;
  /** Epoch ms until which sign-in is refused, or null. */
  lockedUntil: number | null;
  lastLoginAt: number | null;
}

/** The signed-in user, as needed for permission checks and attribution. */
export type ActingUser = {
  id: string;
  name: string;
  role: Role;
};

export type AuditAction =
  | 'void_sale'
  | 'price_change'
  | 'cost_change'
  | 'stock_adjustment'
  | 'item_delete'
  | 'customer_delete'
  | 'pin_reset'
  | 'role_change'
  | 'staff_add'
  | 'staff_delete'
  | 'backup'
  | 'backup_failed'
  | 'restore'
  | 'restore_failed';

export interface AuditEntry {
  id: string;
  userId: string | null;
  userName: string;
  userRole: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string;
  detail: string | null;
  createdAt: number;
}

export interface Settings extends BaseEntity {
  shopName: string;
  businessType: BusinessType;
  currency: string;
  ownerPinHash: string | null;
  receiptFooter: string;
  /** Business address shown on receipts, optional. */
  shopAddress: string;
  /** Business phone shown on receipts, optional. */
  shopPhone: string;
  /** Lock after this many minutes of inactivity. Defaults to 5. */
  autoLockMinutes: number;
  /** Multi-device role for this installation. Defaults to `standalone`. */
  deviceMode: DeviceMode;
  /** Port the admin host server listens on. Defaults to 8799. */
  hostPort: number;
  /** Stable shop identifier shared with paired cashiers. Set once. */
  shopId: string | null;
}

export interface Item extends BaseEntity {
  name: string;
  category: string;
  tracksStock: boolean;
  lowStockLevel: number;
  /** Current cost per base unit, in kobo. Last-cost valuation. */
  costPrice: number;
  /** Selling price per base unit, in kobo. */
  sellingPrice: number;
}

export interface ItemWithStock extends Item {
  stock: number;
}

export interface ItemUnit extends BaseEntity {
  itemId: string;
  unitName: string;
  /** How many base units make one of this unit. 1 for the base unit. */
  unitsPerBase: number;
  /** Selling price for one of this unit, in kobo. */
  sellingPrice: number;
  isBase: boolean;
  sortOrder: number;
  /** Barcode for this specific selling unit, unique across the business. */
  barcode: string | null;
}

/**
 * Wire shapes for the read-only catalog a cashier pulls from the admin host.
 * Timestamps are epoch ms; `deletedAt` is set for soft-deleted rows so the
 * cashier can mirror deletions.
 */
export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  tracksStock: boolean;
  lowStockLevel: number;
  costPrice: number;
  sellingPrice: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type CatalogUnit = {
  id: string;
  itemId: string;
  unitName: string;
  unitsPerBase: number;
  sellingPrice: number;
  isBase: boolean;
  sortOrder: number;
  barcode: string | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type CatalogStock = {
  itemId: string;
  quantityBase: number;
};

export type CatalogCustomer = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  updatedAt: number;
  deletedAt: number | null;
};

export type CatalogBalance = {
  customerId: string;
  owed: number;
};

export type CatalogSnapshot = {
  serverTime: number;
  items: CatalogItem[];
  units: CatalogUnit[];
  stock: CatalogStock[];
  customers: CatalogCustomer[];
  balances: CatalogBalance[];
};

export interface StockMovement extends BaseEntity {
  itemId: string;
  type: StockMovementType;
  /** Signed quantity in base units. Negative for sales. */
  quantityBase: number;
  /** Cost per base unit at the time of the movement, in kobo. */
  unitCost: number;
  /** sale id for `sale` movements, restock/adjustment document id otherwise. */
  referenceId: string | null;
  note: string | null;
}

export interface Customer extends BaseEntity {
  name: string;
  phone: string | null;
  notes: string | null;
}

export interface CustomerWithBalance extends Customer {
  /** Positive = customer owes the shop. */
  owed: number;
}

export interface Sale extends BaseEntity {
  receiptNo: string;
  customerId: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: SaleStatus;
  /** Business time of the sale (epoch ms). */
  soldAt: number;
  /** Who rang up the sale. Null only on rows created before staff roles. */
  userId: string | null;
  /** Set when the sale is voided. */
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: number | null;
}

export interface SaleLine extends BaseEntity {
  saleId: string;
  itemId: string;
  unitId: string | null;
  unitName: string;
  /** Quantity in the chosen unit. */
  quantity: number;
  unitsPerBase: number;
  /** Quantity in base units. */
  quantityBase: number;
  /** Price per chosen unit, in kobo. */
  unitPrice: number;
  lineTotal: number;
  /** Cost per base unit at sale time, in kobo. */
  unitCost: number;
  /** True when unit cost was back-filled from the item's current cost. */
  costEstimated: boolean;
}

export interface Payment extends BaseEntity {
  saleId: string | null;
  customerId: string | null;
  method: PaymentMethod;
  amount: number;
  paidAt: number;
  note: string | null;
  /** Who took the payment. Null only on rows created before staff roles. */
  userId: string | null;
}

export interface SaleWithDetails extends Sale {
  lines: (SaleLine & { itemName: string })[];
  payments: Payment[];
  customerName: string | null;
  /** Name of the user who rang up the sale, for the receipt. */
  servedByName: string | null;
  /** Name of the user who voided the sale, if voided. */
  voidedByName: string | null;
}
