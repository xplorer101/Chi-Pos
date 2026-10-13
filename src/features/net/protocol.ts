import type { ActingUser, DeviceMode } from '@/db/types';

/** Bumped whenever the wire format changes so old clients are rejected. */
export const PROTOCOL_VERSION = 1;

/** Payload encoded into the host QR code / shown as the manual pairing code. */
export type PairingInfo = {
  v: number;
  ip: string;
  port: number;
  shopId: string;
  key: string;
  name: string;
};

export type PairStatus = 'pending' | 'approved' | 'revoked';

/** A cashier device as tracked by the admin host. */
export type DeviceSummary = {
  id: string;
  clientId: string;
  name: string;
  status: PairStatus;
  role: string;
  userId: string | null;
  userName: string | null;
  lastIp: string | null;
  createdAt: number;
  approvedAt: number | null;
  lastSeenAt: number | null;
};

export type PairRequestBody = {
  clientId: string;
  name: string;
  shopId: string;
};

export type PairRequestResponse = {
  deviceId: string;
  claim: string;
  status: PairStatus;
};

export type PairStatusResponse = {
  status: PairStatus | 'unknown';
  token?: string;
  user?: ActingUser;
  shopName?: string;
  role?: string;
};

export type HealthResponse = {
  ok: boolean;
  protocolVersion: number;
  shopName: string;
  deviceMode: DeviceMode;
};

export const PAIR_HEADER = 'x-pairing-key';
export const TOKEN_HEADER = 'x-device-token';

export const HEALTH_PATH = '/health';
export const PAIR_REQUEST_PATH = '/pair/request';
export const PAIR_STATUS_PATH = '/pair/status';
export const CATALOG_PATH = '/catalog';
