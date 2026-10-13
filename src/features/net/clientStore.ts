import { create } from 'zustand';

import { getDeviceId } from '@/lib/device';

import { clearPairing, getPairing, savePairing, type Pairing } from './pairing';
import { PAIR_HEADER, PROTOCOL_VERSION } from './protocol';
import { httpRequest } from './tcp';

export type ClientStatus = 'unpaired' | 'connecting' | 'pending' | 'connected' | 'offline';

type ClientState = {
  status: ClientStatus;
  pairing: Pairing | null;
  shopName: string | null;
  error: string | null;
  lastSeenAt: number | null;
  claim: { host: string; port: number; clientId: string; secret: string; shopId: string } | null;

  load: () => Promise<void>;
  pair: (input: { host: string; port: number; key: string; shopId?: string }) => Promise<void>;
  pollPairStatus: () => Promise<void>;
  ping: () => Promise<boolean>;
  disconnect: () => Promise<void>;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export const useClientStore = create<ClientState>((set, get) => ({
  status: 'unpaired',
  pairing: null,
  shopName: null,
  error: null,
  lastSeenAt: null,
  claim: null,

  load: async () => {
    const pairing = await getPairing();
    if (!pairing) {
      set({ status: 'unpaired', pairing: null });
      return;
    }
    set({ pairing, status: 'connecting' });
    const ok = await get().ping();
    set({ status: ok ? 'connected' : 'offline' });
  },

  pair: async ({ host, port, key, shopId = '' }) => {
    stopPolling();
    set({ status: 'connecting', error: null });
    try {
      const clientId = await getDeviceId();

      // Confirm we are talking to a ShopPOS host before registering.
      const health = await httpRequest({ host, port, path: '/health', timeoutMs: 5000 });
      if (health.status !== 200) throw new Error('That address did not answer like an admin phone.');
      const healthBody = health.body as { ok?: boolean; protocolVersion?: number; shopName?: string } | null;
      if (!healthBody?.ok) throw new Error('That address did not answer like an admin phone.');
      if ((healthBody.protocolVersion ?? 0) > PROTOCOL_VERSION) {
        throw new Error('The admin phone is running a newer version. Update this phone.');
      }

      const requested = await httpRequest({
        host,
        port,
        method: 'POST',
        path: '/pair/request',
        headers: { [PAIR_HEADER]: key },
        body: { clientId, name: 'Cashier phone', shopId },
        timeoutMs: 6000,
      });
      if (requested.status === 401) throw new Error('Pairing key is wrong or has expired.');
      if (requested.status !== 200) throw new Error('The admin phone refused to pair.');
      const result = requested.body as { deviceId?: string; claim?: string; status?: string } | null;
      if (!result?.claim) throw new Error('The admin phone did not return a pairing claim.');

      set({
        claim: { host, port, clientId, secret: result.claim, shopId },
        shopName: healthBody.shopName ?? null,
        status: 'pending',
      });

      await get().pollPairStatus();
      if (get().status === 'pending') {
        pollTimer = setInterval(() => void get().pollPairStatus(), 3000);
      }
    } catch (error) {
      set({ status: 'unpaired', error: error instanceof Error ? error.message : String(error) });
    }
  },

  pollPairStatus: async () => {
    const claim = get().claim;
    if (!claim) return;
    try {
      const url = `/pair/status?clientId=${encodeURIComponent(claim.clientId)}&claim=${encodeURIComponent(claim.secret)}`;
      const response = await httpRequest({ host: claim.host, port: claim.port, path: url, timeoutMs: 5000 });
      const body = response.body as
        | { status?: string; token?: string; user?: { id: string; name: string; role: string }; shopName?: string }
        | null;
      if (body?.status === 'approved' && body.token && body.user) {
        stopPolling();
        const pairing: Pairing = {
          host: claim.host,
          port: claim.port,
          token: body.token,
          shopId: claim.shopId,
          clientId: claim.clientId,
          userId: body.user.id,
          userName: body.user.name,
          role: body.user.role,
        };
        await savePairing(pairing);
        set({ pairing, claim: null, status: 'connected', shopName: body.shopName ?? get().shopName, error: null });
      } else if (body?.status === 'revoked') {
        stopPolling();
        set({ status: 'unpaired', claim: null, error: 'This device was removed by the admin.' });
      }
    } catch {
      // Keep polling; the admin may still be approving.
    }
  },

  ping: async () => {
    const pairing = get().pairing;
    if (!pairing) return false;
    try {
      const response = await httpRequest({
        host: pairing.host,
        port: pairing.port,
        path: '/health',
        timeoutMs: 4000,
      });
      const ok = response.status === 200 && (response.body as { ok?: boolean } | null)?.ok === true;
      set({ lastSeenAt: ok ? Date.now() : get().lastSeenAt });
      return ok;
    } catch {
      return false;
    }
  },

  disconnect: async () => {
    stopPolling();
    await clearPairing();
    set({ pairing: null, claim: null, status: 'unpaired', shopName: null, error: null });
  },
}));
