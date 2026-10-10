import { create } from 'zustand';

type BiometricState = { available: boolean; enabled: boolean };

type AuthState = {
  /** False on cold start when a PIN is configured. */
  unlocked: boolean;
  /** SHA-256 digest of the owner PIN, or null when no PIN is set. */
  pinHash: string | null;
  biometrics: BiometricState;
  unlock: () => void;
  lock: () => void;
  setPinHash: (hash: string | null) => void;
  setBiometrics: (patch: BiometricState) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  unlocked: false,
  pinHash: null,
  biometrics: { available: false, enabled: false },
  unlock: () => set({ unlocked: true }),
  lock: () => set({ unlocked: false }),
  setPinHash: (hash) => set({ pinHash: hash }),
  setBiometrics: (patch) => set({ biometrics: patch }),
}));
