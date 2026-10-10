import { create } from 'zustand';

type DbStore = {
  /** Bumped after every write so live queries re-run. */
  revision: number;
  bump: () => void;
};

export const useDbStore = create<DbStore>((set) => ({
  revision: 0,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
}));

export function bumpRevision(): void {
  useDbStore.getState().bump();
}
