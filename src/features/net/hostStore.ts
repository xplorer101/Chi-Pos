import { create } from 'zustand';
import * as Network from 'expo-network';

import {
  approveDevice,
  listDevices,
  removeDevice,
  revokeDevice,
  type DeviceRecord,
} from '@/db/repositories/devicesRepo';
import { getSettings, getShopId } from '@/db/repositories/settingsRepo';
import { getUser } from '@/db/repositories/usersRepo';

import { createPairingGuard, type PairingKeyState } from './pairingKey';
import { createHandler } from './routes';
import { createHttpServer, isTcpAvailable } from './tcp';
import { generateDeviceToken, hashSecret } from './tokens';

type HostState = {
  running: boolean;
  starting: boolean;
  error: string | null;
  ip: string | null;
  port: number;
  pairingKey: string | null;
  pairingKeyExpiresAt: number | null;
  pairingKeyUsed: boolean;
  pairLockedUntil: number | null;
  shopId: string | null;
  requestsServed: number;
  lastEvent: string | null;
  devices: DeviceRecord[];

  start: () => Promise<void>;
  stop: () => void;
  refresh: () => Promise<void>;
  regenerateKey: () => Promise<void>;
  approve: (deviceId: string, userId: string) => Promise<void>;
  revoke: (deviceId: string) => Promise<void>;
  remove: (deviceId: string) => Promise<void>;
};

let server: { listen: (port: number) => void; stop: () => void } | null = null;
const pairing = createPairingGuard();

/** Spread into a set() call so the store mirrors the guard exactly. */
function appliedPairing(state: PairingKeyState) {
  return {
    pairingKey: state.key,
    pairingKeyExpiresAt: state.expiresAt,
    pairingKeyUsed: state.used,
    pairLockedUntil: state.lockedUntil,
  };
}

export const useHostStore = create<HostState>((set, get) => ({
  running: false,
  starting: false,
  error: null,
  ip: null,
  port: 8799,
  pairingKey: null,
  pairingKeyExpiresAt: null,
  pairingKeyUsed: false,
  pairLockedUntil: null,
  shopId: null,
  requestsServed: 0,
  lastEvent: null,
  devices: [],

  start: async () => {
    if (get().running || get().starting) return;
    set({ starting: true, error: null });
    try {
      if (!isTcpAvailable()) {
        throw new Error('The network server needs a development build, not Expo Go.');
      }
      const settings = await getSettings();
      const shopId = await getShopId();
      const keyState = await pairing.issue();

      const handler = createHandler({
        getPairingKey: pairing.currentKey,
        getPairingLock: pairing.lock,
        onPairingSucceeded: () => set(appliedPairing(pairing.noteSuccess())),
        onPairingFailed: () => set({ pairLockedUntil: pairing.noteFailure().lockedUntil }),
        onRequest: (label) => set((state) => ({ requestsServed: state.requestsServed + 1, lastEvent: label })),
      });

      server = createHttpServer(handler, (error) => set({ error: error.message }));
      server.listen(settings.hostPort);

      let ip: string | null = null;
      try {
        const address = await Network.getIpAddressAsync();
        ip = address && address !== '0.0.0.0' ? address : null;
      } catch {
        ip = null;
      }

      set({
        running: true,
        starting: false,
        port: settings.hostPort,
        ...appliedPairing(keyState),
        shopId,
        ip,
        requestsServed: 0,
        lastEvent: 'Server started',
      });
      await get().refresh();
    } catch (error) {
      server = null;
      pairing.clear();
      set({
        running: false,
        starting: false,
        pairingKey: null,
        pairingKeyExpiresAt: null,
        pairingKeyUsed: false,
        pairLockedUntil: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  stop: () => {
    try {
      server?.stop();
    } catch {
      // already closed
    }
    server = null;
    set({
      running: false,
      ...appliedPairing(pairing.clear()),
      lastEvent: 'Server stopped',
    });
  },

  refresh: async () => {
    const devices = await listDevices();
    set({ devices });
  },

  regenerateKey: async () => {
    if (!get().running) return;
    set(appliedPairing(await pairing.issue()));
  },

  approve: async (deviceId, userId) => {
    const user = await getUser(userId);
    if (!user) throw new Error('That staff member no longer exists.');
    // Enforced here as well as in the sheet: an owner account must never be
    // bound to a cashier phone, whatever the UI sends.
    if (user.role !== 'cashier') {
      throw new Error('Only cashier accounts can be paired to a phone.');
    }
    const token = await generateDeviceToken();
    const tokenHash = await hashSecret(token);
    await approveDevice({
      id: deviceId,
      userId: user.id,
      userName: user.name,
      role: user.role,
      tokenHash,
      tokenPlain: token,
    });
    await get().refresh();
  },

  revoke: async (deviceId) => {
    await revokeDevice(deviceId);
    await get().refresh();
  },

  remove: async (deviceId) => {
    await removeDevice(deviceId);
    await get().refresh();
  },
}));
