import { create } from 'zustand';

import type { ItemUnit, ItemWithStock } from '@/db/types';

export type PaymentMode = 'cash' | 'transfer' | 'pos' | 'credit' | 'split' | 'part';

/** How the "paid now" part of a part payment is received. */
export type PartMethod = 'cash' | 'transfer' | 'pos';

export type SplitAmounts = Record<'cash' | 'transfer' | 'pos' | 'credit', number>;

export type CartLine = {
  /** Item + unit identity: adding the same pair again bumps the quantity. */
  key: string;
  itemId: string;
  itemName: string;
  unitId: string | null;
  unitName: string;
  unitsPerBase: number;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  tracksStock: boolean;
  stock: number;
  lowStockLevel: number;
};

type SellState = {
  lines: CartLine[];
  discount: number;
  customerId: string | null;
  customerName: string | null;
  paymentMode: PaymentMode;
  split: SplitAmounts;
  /** "Pay later / Part payment": the amount settled right now, in kobo. */
  partPaidNow: number;
  /** How the "paid now" part is received. */
  partMethod: PartMethod;
  lastSaleId: string | null;

  addItem: (item: ItemWithStock, unit?: ItemUnit | null) => void;
  setUnit: (key: string, unit: ItemUnit, priceOverride?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  setPrice: (key: string, kobo: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;

  setDiscount: (kobo: number) => void;
  setCustomer: (id: string | null, name: string | null) => void;
  setPaymentMode: (mode: PaymentMode, total: number) => void;
  setSplitAmount: (method: keyof SplitAmounts, kobo: number) => void;
  setPartPaidNow: (kobo: number) => void;
  setPartMethod: (method: PartMethod) => void;
  setLastSaleId: (id: string | null) => void;
};

const emptySplit = (): SplitAmounts => ({ cash: 0, transfer: 0, pos: 0, credit: 0 });

const lineKey = (itemId: string, unitId: string | null) => `${itemId}::${unitId ?? 'base'}`;

export const useSellStore = create<SellState>((set) => ({
  lines: [],
  discount: 0,
  customerId: null,
  customerName: null,
  paymentMode: 'cash',
  split: emptySplit(),
  partPaidNow: 0,
  partMethod: 'cash',
  lastSaleId: null,

  addItem: (item, unit) => {
    const resolvedUnit = unit ?? null;
    const key = lineKey(item.id, resolvedUnit?.id ?? null);
    const unitPrice = resolvedUnit ? resolvedUnit.sellingPrice : item.sellingPrice;
    const unitsPerBase = resolvedUnit ? resolvedUnit.unitsPerBase : 1;
    const unitName = resolvedUnit ? resolvedUnit.unitName : 'Single';

    set((state) => {
      const existing = state.lines.find((line) => line.key === key);
      if (existing) {
        return {
          lines: state.lines.map((line) =>
            line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        };
      }
      const line: CartLine = {
        key,
        itemId: item.id,
        itemName: item.name,
        unitId: resolvedUnit?.id ?? null,
        unitName,
        unitsPerBase,
        quantity: 1,
        unitPrice,
        unitCost: item.costPrice,
        tracksStock: item.tracksStock,
        stock: item.stock,
        lowStockLevel: item.lowStockLevel,
      };
      return { lines: [...state.lines, line] };
    });
  },

  setUnit: (key, unit) => {
    set((state) => {
      const target = state.lines.find((line) => line.key === key);
      if (!target) return state;

      const newKey = lineKey(target.itemId, unit.id);
      const alreadyTaken = state.lines.some((line) => line.key === newKey && line.key !== key);

      const updated: CartLine = {
        ...target,
        key: newKey,
        unitId: unit.id,
        unitName: unit.unitName,
        unitsPerBase: unit.unitsPerBase,
        unitPrice: unit.sellingPrice,
      };

      if (alreadyTaken) {
        // Same item+unit already in the cart: merge quantities.
        const merged = state.lines.map((line) => {
          if (line.key === newKey) return { ...line, quantity: line.quantity + updated.quantity };
          return line;
        });
        return { lines: merged.filter((line) => line.key !== key) };
      }

      return { lines: state.lines.map((line) => (line.key === key ? updated : line)) };
    });
  },

  setQuantity: (key, quantity) => {
    set((state) => ({
      lines:
        quantity <= 0
          ? state.lines.filter((line) => line.key !== key)
          : state.lines.map((line) => (line.key === key ? { ...line, quantity } : line)),
    }));
  },

  setPrice: (key, kobo) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.key === key ? { ...line, unitPrice: Math.max(0, Math.round(kobo)) } : line,
      ),
    })),

  removeLine: (key) => set((state) => ({ lines: state.lines.filter((line) => line.key !== key) })),

  clear: () =>
    set({
      lines: [],
      discount: 0,
      customerId: null,
      customerName: null,
      paymentMode: 'cash',
      split: emptySplit(),
      partPaidNow: 0,
      partMethod: 'cash',
    }),

  setDiscount: (kobo) => set({ discount: Math.max(0, Math.round(kobo)) }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  setPaymentMode: (mode, total) =>
    set((state) => ({
      paymentMode: mode,
      split:
        mode === 'split' && Object.values(state.split).every((value) => value === 0)
          ? { ...emptySplit(), cash: total }
          : state.split,
      partPaidNow:
        mode === 'part' &&
        (state.partPaidNow === 0 || state.partPaidNow > total || state.partPaidNow < 0)
          ? total
          : state.partPaidNow,
    })),

  setSplitAmount: (method, kobo) =>
    set((state) => ({ split: { ...state.split, [method]: Math.max(0, Math.round(kobo)) } })),

  setPartPaidNow: (kobo) => set({ partPaidNow: Math.max(0, Math.round(kobo)) }),

  setPartMethod: (method) => set({ partMethod: method }),

  setLastSaleId: (id) => set({ lastSaleId: id }),
}));

export function buildPayments(
  state: Pick<SellState, 'paymentMode' | 'split' | 'partPaidNow' | 'partMethod'>,
  total: number,
) {
  if (state.paymentMode === 'part') {
    const paidNow = Math.min(Math.max(0, Math.round(state.partPaidNow)), total);
    if (paidNow >= total) {
      return [{ method: state.partMethod, amount: total }];
    }
    if (paidNow === 0) {
      return [{ method: 'credit' as const, amount: total }];
    }
    return [
      { method: state.partMethod, amount: paidNow },
      { method: 'credit' as const, amount: total - paidNow },
    ];
  }
  if (state.paymentMode === 'split') {
    return (Object.entries(state.split) as [keyof SplitAmounts, number][])
      .filter(([, amount]) => amount > 0)
      .map(([method, amount]) => ({ method, amount }));
  }
  return [{ method: state.paymentMode, amount: total }];
}
