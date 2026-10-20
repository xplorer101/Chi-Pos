import { create } from 'zustand';

import {
  getCatalogSyncedAt,
  setCatalogSyncedAt,
  writeCatalog,
} from '@/db/repositories/catalogRepo';
import { listPending, markFailed, markSent, pendingCount } from '@/db/repositories/outboxRepo';
import { setSaleReceiptNo } from '@/db/repositories/salesRepo';
import type { CatalogSnapshot } from '@/db/types';
import { getDeviceId } from '@/lib/device';

import { clearPairing, getPairing, savePairing, type Pairing } from './pairing';
import {
  CATALOG_PATH,
  CUSTOMERS_PATH,
  DEBT_PAYMENTS_PATH,
  PAIR_HEADER,
  PROTOCOL_VERSION,
  SALES_PATH,
} from './protocol';
import { httpRequest } from './tcp';

export type ClientStatus = 'unpaired' | 'connecting' | 'pending' | 'connected' | 'offline';

type ClientState = {
  status: ClientStatus;
  pairing: Pairing | null;
  shopName: string | null;
  error: string | null;
  lastSeenAt: number | null;
  catalogSyncedAt: number | null;
  syncing: boolean;
  syncError: string | null;
  /** Sales / debt payments still waiting to reach the admin. */
  pending: number;
  claim: { host: string; port: number; clientId: string; secret: string; shopId: string } | null;

  load: () => Promise<void>;
  pair: (input: { host: string; port: number; key: string; shopId?: string }) => Promise<void>;
  pollPairStatus: () => Promise<void>;
  ping: () => Promise<boolean>;
  syncCatalog: () => Promise<void>;
  /** Drain the queue, then pull the catalog. Safe to fire from any trigger. */
  flushOutbox: () => Promise<boolean>;
  syncNow: () => Promise<void>;
  refreshPending: () => Promise<void>;
  disconnect: () => Promise<void>;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Only one flush ever runs at a time. Every trigger (a sale landing in the
 * queue, the network coming back, the retry timer) shares the in-flight
 * promise, so two flushes can never race each other over the same entry.
 */
let flushInFlight: Promise<boolean> | null = null;

/** Same idea for catalog pulls, so a network event mid-pull does not double it. */
let catalogPullInFlight: Promise<void> | null = null;

/**
 * Keeps trying the queue while entries are stuck and the admin is not
 * answering. Started by a failed flush, stopped the moment the queue empties.
 */
let retryTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function stopRetryTimer() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

function startRetryTimer() {
  if (retryTimer) return;
  retryTimer = setInterval(() => void retryTick(), 30_000);
}

async function retryTick() {
  const store = useClientStore.getState();
  if (!store.pairing) {
    stopRetryTimer();
    return;
  }
  if ((await pendingCount()) === 0) {
    stopRetryTimer();
    return;
  }
  // flushOutbox restarts or stops the timer itself once it sees the outcome.
  if (await store.flushOutbox()) await store.syncCatalog();
}

export const useClientStore = create<ClientState>((set, get) => ({
  status: 'unpaired',
  pairing: null,
  shopName: null,
  error: null,
  lastSeenAt: null,
  catalogSyncedAt: null,
  syncing: false,
  syncError: null,
  pending: 0,
  claim: null,

  load: async () => {
    const pairing = await getPairing();
    const [catalogSyncedAt, pending] = await Promise.all([getCatalogSyncedAt(), pendingCount()]);
    if (!pairing) {
      set({ status: 'unpaired', pairing: null, catalogSyncedAt, pending });
      return;
    }
    set({ pairing, status: 'connecting', catalogSyncedAt, pending });
    const ok = await get().ping();
    set({ status: ok ? 'connected' : 'offline' });
    if (ok) {
      await get().flushOutbox();
      await get().syncCatalog();
    } else if (pending > 0) {
      // Something is still waiting from the last session; keep trying.
      startRetryTimer();
    }
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
        await get().syncCatalog();
      } else if (body?.status === 'revoked') {
        stopPolling();
        set({ status: 'unpaired', claim: null, error: 'This device was removed by the admin.' });
      }
    } catch {
      // Keep polling; the admin may still be approving.
    }
  },

  syncCatalog: async () => {
    const pairing = get().pairing;
    if (!pairing) return;
    if (catalogPullInFlight) return catalogPullInFlight;
    const pull = (async () => {
      set({ syncing: true, syncError: null });
      try {
        const since = await getCatalogSyncedAt();
        const response = await httpRequest({
          host: pairing.host,
          port: pairing.port,
          path: `${CATALOG_PATH}?since=${since}`,
          token: pairing.token,
          timeoutMs: 12000,
        });
        if (response.status === 401) {
          set({ syncing: false, syncError: 'This phone is no longer approved by the admin.' });
          return;
        }
        if (response.status !== 200 || !response.body) {
          throw new Error('Could not load the catalog.');
        }
        const snapshot = response.body as CatalogSnapshot;
        await writeCatalog(snapshot);
        await setCatalogSyncedAt(snapshot.serverTime);
        set({
          syncing: false,
          catalogSyncedAt: snapshot.serverTime,
          lastSeenAt: Date.now(),
          status: 'connected',
          pending: await pendingCount(),
        });
      } catch (error) {
        set({
          syncing: false,
          syncError: error instanceof Error ? error.message : String(error),
          status: get().pairing ? 'offline' : 'unpaired',
        });
      }
    })();
    catalogPullInFlight = pull.finally(() => {
      catalogPullInFlight = null;
    });
    return catalogPullInFlight;
  },

  /**
   * Drain the outbox. Returns true when the queue is empty afterwards, which
   * means everything reached the admin (or there was nothing to send). When a
   * flush succeeds the catalog is pulled too, so stock and balances catch up.
   */
  flushOutbox: async () => {
    if (flushInFlight) return flushInFlight;
    const run = (async () => {
      const pairing = get().pairing;
      if (!pairing) return true;
      try {
        const entries = await listPending();
        for (const entry of entries) {
          const path =
            entry.kind === 'sale'
              ? SALES_PATH
              : entry.kind === 'customer'
                ? CUSTOMERS_PATH
                : DEBT_PAYMENTS_PATH;
          let payload: unknown;
          try {
            payload = JSON.parse(entry.payload);
          } catch {
            await markFailed(entry.id, 'Corrupt queue entry.');
            continue;
          }
          try {
            const response = await httpRequest({
              host: pairing.host,
              port: pairing.port,
              method: 'POST',
              path,
              token: pairing.token,
              body: payload,
              timeoutMs: 12000,
            });
            if (response.status === 200 || response.status === 201) {
              if (entry.kind === 'sale') {
                const receiptNo = (response.body as { receiptNo?: string } | null)?.receiptNo;
                if (receiptNo) await setSaleReceiptNo(entry.id, receiptNo);
              }
              await markSent(entry.id);
            } else if (response.status === 401) {
              set({ syncError: 'This phone is no longer approved by the admin.' });
              break;
            } else {
              const message =
                (response.body as { message?: string } | null)?.message ??
                `The admin rejected this (${response.status}).`;
              await markFailed(entry.id, message);
            }
          } catch (error) {
            await markFailed(entry.id, error instanceof Error ? error.message : String(error));
            break; // network down: stop and try again next time
          }
        }
      } catch {
        // Never let an unexpected database error take the caller down.
      }
      const pending = await pendingCount();
      set({ pending, lastSeenAt: Date.now() });
      if (pending > 0) {
        startRetryTimer();
      } else {
        stopRetryTimer();
        void get().syncCatalog();
      }
      return pending === 0;
    })();
    flushInFlight = run.finally(() => {
      flushInFlight = null;
    });
    return flushInFlight;
  },

  syncNow: async () => {
    if (!get().pairing) return;
    await get().flushOutbox();
    await get().syncCatalog();
  },

  refreshPending: async () => {
    set({ pending: await pendingCount() });
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
    stopRetryTimer();
    await clearPairing();
    set({
      pairing: null,
      claim: null,
      status: 'unpaired',
      shopName: null,
      error: null,
      syncing: false,
      syncError: null,
      lastSeenAt: null,
    });
  },
}));
