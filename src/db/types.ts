/** Shared domain types. Money is always an integer number of kobo. */

export type BusinessType = 'provision_shop';

export type StockMovementType = 'sale' | 'restock' | 'adjustment';

export type PaymentMethod = 'cash' | 'transfer' | 'pos' | 'credit';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'transfer', 'pos', 'credit'];

export type SaleStatus = 'completed' | 'voided';

export interface BaseEntity {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  deviceId: string;
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
}

export interface Payment extends BaseEntity {
  saleId: string | null;
  customerId: string | null;
  method: PaymentMethod;
  amount: number;
  paidAt: number;
  note: string | null;
}

export interface SaleWithDetails extends Sale {
  lines: (SaleLine & { itemName: string })[];
  payments: Payment[];
  customerName: string | null;
}
