import { create } from 'zustand';

type BackupProgressState = {
  active: boolean;
  label: string;
  /** 0..1, or null when indeterminate. */
  progress: number | null;
  begin: (label: string) => void;
  update: (label: string, progress: number | null) => void;
  end: () => void;
};

/** Coarse progress used by the backup/restore sheets and screens. */
export const useBackupProgress = create<BackupProgressState>((set) => ({
  active: false,
  label: '',
  progress: null,
  begin: (label) => set({ active: true, label, progress: null }),
  update: (label, progress) => set({ active: true, label, progress }),
  end: () => set({ active: false, label: '', progress: null }),
}));