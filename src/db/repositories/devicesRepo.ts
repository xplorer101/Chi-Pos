import { newId } from '@/lib/id';

import { getDb } from '../index';
import { bumpRevision } from '../store';
import type { PairStatus } from '@/features/net/protocol';

export type DeviceRow = {
  id: string;
  client_id: string;
  name: string;
  user_id: string | null;
  role: string;
  status: string;
  token_hash: string | null;
  token_plain: string | null;
  claim_hash: string | null;
  last_ip: string | null;
  created_at: number;
  updated_at: number;
  approved_at: number | null;
  last_seen_at: number | null;
  user_name?: string | null;
};

export type DeviceRecord = {
  id: string;
  clientId: string;
  name: string;
  userId: string | null;
  userName: string | null;
  role: string;
  status: PairStatus;
  tokenHash: string | null;
  tokenPlain: string | null;
  claimHash: string | null;
  lastIp: string | null;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  lastSeenAt: number | null;
};

function mapDevice(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    userId: row.user_id,
    userName: row.user_name ?? null,
    role: row.role,
    status: row.status as PairStatus,
    tokenHash: row.token_hash,
    tokenPlain: row.token_plain,
    claimHash: row.claim_hash,
    lastIp: row.last_ip,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    lastSeenAt: row.last_seen_at,
  };
}

const SELECT_DEVICE = `
  SELECT d.*, u.name AS user_name
    FROM devices d
    LEFT JOIN users u ON u.id = d.user_id
`;

export async function listDevices(): Promise<DeviceRecord[]> {
  const db = getDb();
  const rows = await db.getAllAsync<DeviceRow>(
    `${SELECT_DEVICE}
     ORDER BY CASE d.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
              d.created_at DESC`,
  );
  return rows.map(mapDevice);
}

export async function getDevice(id: string): Promise<DeviceRecord | null> {
  const db = getDb();
  const row = await db.getFirstAsync<DeviceRow>(`${SELECT_DEVICE} WHERE d.id = ?`, id);
  return row ? mapDevice(row) : null;
}

export async function getDeviceByClientId(clientId: string): Promise<DeviceRecord | null> {
  const db = getDb();
  const row = await db.getFirstAsync<DeviceRow>(
    `${SELECT_DEVICE} WHERE d.client_id = ?`,
    clientId,
  );
  return row ? mapDevice(row) : null;
}

export async function getDeviceByTokenHash(tokenHash: string): Promise<DeviceRecord | null> {
  const db = getDb();
  const row = await db.getFirstAsync<DeviceRow>(
    `${SELECT_DEVICE} WHERE d.token_hash = ? AND d.status = 'approved'`,
    tokenHash,
  );
  return row ? mapDevice(row) : null;
}

/** Create or refresh a pending pairing request. Approved devices are left alone. */
export async function upsertPendingDevice(input: {
  clientId: string;
  name: string;
  claimHash: string;
  ip: string | null;
}): Promise<DeviceRecord> {
  const db = getDb();
  const now = Date.now();
  const existing = await getDeviceByClientId(input.clientId);

  if (existing && existing.status === 'approved') {
    await db.runAsync('UPDATE devices SET last_ip = ?, updated_at = ? WHERE id = ?', input.ip, now, existing.id);
    return (await getDevice(existing.id))!;
  }

  if (existing) {
    await db.runAsync(
      `UPDATE devices
          SET name = ?, claim_hash = ?, status = 'pending', last_ip = ?,
              token_hash = NULL, token_plain = NULL, updated_at = ?
        WHERE id = ?`,
      input.name,
      input.claimHash,
      input.ip,
      now,
      existing.id,
    );
    bumpRevision();
    return (await getDevice(existing.id))!;
  }

  const id = newId();
  await db.runAsync(
    `INSERT INTO devices
       (id, client_id, name, user_id, role, status, token_hash, token_plain, claim_hash,
        last_ip, created_at, updated_at, approved_at, last_seen_at)
     VALUES (?, ?, ?, NULL, 'cashier', 'pending', NULL, NULL, ?, ?, ?, ?, NULL, NULL)`,
    id,
    input.clientId,
    input.name,
    input.claimHash,
    input.ip,
    now,
    now,
  );
  bumpRevision();
  return (await getDevice(id))!;
}

export async function approveDevice(input: {
  id: string;
  userId: string;
  userName: string;
  role: string;
  tokenHash: string;
  tokenPlain: string;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    `UPDATE devices
        SET user_id = ?, role = ?, status = 'approved', token_hash = ?, token_plain = ?,
            approved_at = ?, updated_at = ?
      WHERE id = ?`,
    input.userId,
    input.role,
    input.tokenHash,
    input.tokenPlain,
    now,
    now,
    input.id,
  );
  bumpRevision();
}

/** Issue the raw token once, then forget it. Returns null if the claim is wrong. */
export async function claimDeviceToken(input: {
  clientId: string;
  claimHash: string;
}): Promise<{ token: string; userId: string | null; userName: string | null; role: string } | null> {
  const device = await getDeviceByClientId(input.clientId);
  if (!device || device.status !== 'approved') return null;
  if (device.claimHash !== input.claimHash) return null;
  if (!device.tokenPlain) return null;

  const db = getDb();
  await db.runAsync('UPDATE devices SET token_plain = NULL, last_seen_at = ?, updated_at = ? WHERE id = ?', Date.now(), Date.now(), device.id);
  return {
    token: device.tokenPlain,
    userId: device.userId,
    userName: device.userName,
    role: device.role,
  };
}

/** Rotate the token + claim secret for an already-approved device (safe re-pair). */
export async function setDeviceToken(input: {
  id: string;
  tokenHash: string;
  tokenPlain: string;
  claimHash: string;
}): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE devices SET token_hash = ?, token_plain = ?, claim_hash = ?, updated_at = ? WHERE id = ?',
    input.tokenHash,
    input.tokenPlain,
    input.claimHash,
    Date.now(),
    input.id,
  );
  bumpRevision();
}

export async function touchDevice(id: string, ip: string | null): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE devices SET last_seen_at = ?, last_ip = ? WHERE id = ?', Date.now(), ip, id);
}

export async function revokeDevice(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE devices SET status = 'revoked', token_hash = NULL, token_plain = NULL, updated_at = ? WHERE id = ?",
    Date.now(),
    id,
  );
  bumpRevision();
}

export async function removeDevice(id: string): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM devices WHERE id = ?', id);
  bumpRevision();
}
