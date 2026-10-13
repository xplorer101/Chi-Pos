import { readCatalog } from '@/db/repositories/catalogRepo';
import { getSettings, getShopId } from '@/db/repositories/settingsRepo';
import {
  claimDeviceToken,
  getDeviceByClientId,
  getDeviceByTokenHash,
  setDeviceToken,
  touchDevice,
  upsertPendingDevice,
} from '@/db/repositories/devicesRepo';

import type { HttpRequest } from './http';
import type { HttpHandler } from './tcp';
import { PAIR_HEADER, PROTOCOL_VERSION, TOKEN_HEADER } from './protocol';
import { generateClaimSecret, generateDeviceToken, hashSecret, safeEqual } from './tokens';
import type { ActingUser } from '@/db/types';

export type ServerContext = {
  /** The current pairing key, or null when not hosting. */
  getPairingKey: () => string | null;
  /** Called whenever a request is served, so the host UI can show liveness. */
  onRequest?: (label: string) => void;
};

function json(status: number, body: unknown) {
  return { status, body };
}

function parseQuery(path: string): { pathname: string; query: Record<string, string> } {
  const [pathname, search = ''] = path.split('?');
  const query: Record<string, string> = {};
  for (const pair of search.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    query[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return { pathname, query };
}

export async function authenticate(
  request: HttpRequest,
): Promise<{ actor: ActingUser; deviceId: string } | null> {
  const token = request.headers[TOKEN_HEADER];
  if (!token) return null;
  const hash = await hashSecret(token);
  const device = await getDeviceByTokenHash(hash);
  if (!device || !device.userId) return null;
  return {
    actor: { id: device.userId, name: device.userName ?? device.name, role: device.role as ActingUser['role'] },
    deviceId: device.id,
  };
}

export function createHandler(ctx: ServerContext): HttpHandler {
  return async (request, meta) => {
    const { pathname, query } = parseQuery(request.path);
    ctx.onRequest?.(`${request.method} ${pathname}`);

    if (request.method === 'GET' && pathname === '/health') {
      const settings = await getSettings();
      return json(200, {
        ok: true,
        protocolVersion: PROTOCOL_VERSION,
        shopName: settings.shopName,
        deviceMode: 'admin',
      });
    }

    if (request.method === 'POST' && pathname === '/pair/request') {
      const key = ctx.getPairingKey();
      const provided = request.headers[PAIR_HEADER] ?? '';
      if (!key || !safeEqual(provided, key)) {
        return json(401, { error: 'bad_pairing_key', message: 'Pairing key is wrong or expired.' });
      }
      let body: { clientId?: string; name?: string; shopId?: string };
      try {
        body = JSON.parse(request.body || '{}');
      } catch {
        return json(400, { error: 'bad_request' });
      }
      const clientId = (body.clientId ?? '').trim();
      if (!clientId) return json(400, { error: 'missing_client_id' });

      const shopId = await getShopId();
      if (body.shopId && body.shopId !== shopId) {
        return json(409, { error: 'wrong_shop', message: 'This key belongs to a different shop.' });
      }

      const claim = await generateClaimSecret();
      const claimHash = await hashSecret(claim);
      const device = await upsertPendingDevice({
        clientId,
        name: (body.name ?? 'Cashier phone').trim() || 'Cashier phone',
        claimHash,
        ip: meta.remoteAddress || null,
      });

      if (device.status === 'approved') {
        // Already trusted: rotate its token so a reinstalled app can pick it up.
        const token = await generateDeviceToken();
        const tokenHash = await hashSecret(token);
        await setDeviceToken({ id: device.id, tokenHash, tokenPlain: token, claimHash });
        return json(200, { deviceId: device.id, claim, status: 'approved' });
      }
      return json(200, { deviceId: device.id, claim, status: 'pending' });
    }

    if (request.method === 'GET' && pathname === '/pair/status') {
      const clientId = query.clientId ?? '';
      const claim = query.claim ?? '';
      if (!clientId || !claim) return json(400, { error: 'bad_request' });
      const claimHash = await hashSecret(claim);
      const settings = await getSettings();
      const claimed = await claimDeviceToken({ clientId, claimHash });
      if (claimed) {
        return json(200, {
          status: 'approved',
          token: claimed.token,
          user: { id: claimed.userId, name: claimed.userName, role: claimed.role },
          shopName: settings.shopName,
          role: claimed.role,
        });
      }
      // Not claimable: either still pending, revoked, or already collected.
      const device = await getDeviceByClientId(clientId);
      if (!device) return json(200, { status: 'unknown' });
      if (device.status === 'approved' && device.claimHash === claimHash) {
        return json(200, { status: 'approved' });
      }
      if (device.status === 'revoked') return json(200, { status: 'revoked' });
      if (device.status === 'approved') return json(200, { status: 'approved' });
      return json(200, { status: 'pending' });
    }

    if (request.method === 'GET' && pathname === '/catalog') {
      const auth = await authenticate(request);
      if (!auth) return json(401, { error: 'unauthorized', message: 'Pair this phone first.' });
      await touchDevice(auth.deviceId, meta.remoteAddress || null);
      const since = Number.parseInt(query.since ?? '0', 10) || 0;
      const snapshot = await readCatalog(since);
      return json(200, snapshot);
    }

    return json(404, { error: 'not_found', path: pathname });
  };
}
