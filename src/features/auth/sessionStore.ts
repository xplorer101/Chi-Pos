import { create } from 'zustand';

import { listUsers } from '@/db/repositories/usersRepo';
import { getSettings } from '@/db/repositories/settingsRepo';
import type { ActingUser, User } from '@/db/types';

export type SessionStatus = 'booting' | 'setup' | 'locked' | 'unlocked';

type BiometricState = { available: boolean; enabled: boolean };

type SessionState = {
  status: SessionStatus;
  /** Active users, cached for the switch-user screen. */
  users: User[];
  currentUser: ActingUser | null;
  autoLockMinutes: number;
  /** Epoch ms of the last confirmed activity. */
  lastActivity: number;
  /** Epoch ms the app moved to background, or null when foreground. */
  backgroundedAt: number | null;
  biometrics: BiometricState;

  boot: () => Promise<SessionStatus>;
  goToSetup: () => void;
  unlock: (user: User) => void;
  lock: () => void;
  refreshUsers: () => Promise<void>;
  touch: () => void;
  markBackgrounded: () => void;
  resync: () => Promise<void>;
  setAutoLockMinutes: (minutes: number) => void;
  setBiometrics: (patch: Partial<BiometricState>) => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'booting',
  users: [],
  currentUser: null,
  autoLockMinutes: 5,
  lastActivity: Date.now(),
  backgroundedAt: null,
  biometrics: { available: false, enabled: false },

  boot: async () => {
    const settings = await getSettings();
    const users = await listUsers();
    set({ autoLockMinutes: settings.autoLockMinutes, users, status: 'locked', lastActivity: Date.now() });
    return get().status;
  },

  unlock: (user) => {
    set({ currentUser: { id: user.id, name: user.name, role: user.role }, status: 'unlocked', lastActivity: Date.now() });
  },

  goToSetup: () => {
    set({ status: 'setup', currentUser: null });
  },

  lock: () => {
    set({ currentUser: null, status: 'locked', lastActivity: Date.now() });
  },

  refreshUsers: async () => {
    const users = await listUsers();
    const current = get().currentUser;
    const stillThere =
      current && users.some((user) => user.id === current.id && user.isActive);
    if (current && !stillThere) set({ currentUser: null, status: 'locked' });
    set({ users });
  },

  touch: () => set({ lastActivity: Date.now() }),

  markBackgrounded: () => set({ backgroundedAt: Date.now() }),

  resync: async () => {
    const settings = await getSettings();
    set({ autoLockMinutes: settings.autoLockMinutes, lastActivity: Date.now() });
    try {
      await get().refreshUsers();
    } catch {
      // DB may be unavailable mid-migration; keep whatever we have.
    }
  },

  setAutoLockMinutes: (minutes) => set({ autoLockMinutes: minutes }),

  setBiometrics: (patch) =>
    set((state) => ({ biometrics: { ...state.biometrics, ...patch } })),
}));

/** How long the device has been idle, in ms. */
export function idleFor(state: Pick<SessionState, 'lastActivity' | 'backgroundedAt'>, now: number): number {
  if (state.backgroundedAt !== null) return now - state.backgroundedAt;
  return now - state.lastActivity;
}