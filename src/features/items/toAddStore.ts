import { create } from 'zustand';

type ToAddState = {
  barcodes: string[];
  add: (barcode: string) => void;
  remove: (barcode: string) => void;
  clear: () => void;
};

export const useToAddStore = create<ToAddState>((set) => ({
  barcodes: [],
  add: (barcode) =>
    set((state) =>
      state.barcodes.includes(barcode) ? state : { barcodes: [...state.barcodes, barcode].sort() },
    ),
  remove: (barcode) => set((state) => ({ barcodes: state.barcodes.filter((b) => b !== barcode) })),
  clear: () => set({ barcodes: [] }),
}));