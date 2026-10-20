import type { ActingUser, DeviceMode, PaymentMethod } from '@/db/types';

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

/**
 * Read a scanned pairing QR. Returns null for anything that is not a pairing
 * code (a product barcode, a random QR), so the caller can say so plainly.
 */
export function parsePairingInfo(raw: string): PairingInfo | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const info = parsed as Partial<PairingInfo>;
  if (typeof info.ip !== 'string' || !info.ip.trim()) return null;
  if (typeof info.port !== 'number' || !Number.isFinite(info.port) || info.port <= 0) return null;
  if (typeof info.key !== 'string' || !info.key.trim()) return null;
  return {
    v: typeof info.v === 'number' ? info.v : 0,
    ip: info.ip.trim(),
    port: info.port,
    shopId: typeof info.shopId === 'string' ? info.shopId : '',
    key: info.key.trim(),
    name: typeof info.name === 'string' ? info.name : 'ShopPOS',
  };
}

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
export const STOCK_PATH = '/stock';
export const SALES_PATH = '/sales';
export const DEBT_PAYMENTS_PATH = '/debtor-payments';
export const CUSTOMERS_PATH = '/customers';

/** A cashier pushes a finished sale here; the id is the idempotency key. */
export type SalePushPayload = {
  saleId: string;
  deviceId: string;
  soldAt: number;
  customerId: string | null;
  discount: number;
  lines: { itemId: string; unitId: string | null; quantity: number }[];
  payments: { method: PaymentMethod; amount: number }[];
};

/** A cashier pushes an offline debt payment here; the id is the idempotency key. */
export type DebtPaymentPushPayload = {
  paymentId: string;
  deviceId: string;
  customerId: string;
  amount: number;
  method: 'cash' | 'transfer' | 'pos';
  paidAt: number;
  note: string | null;
};

/** A cashier pushes a customer it created or edited here; the id is the idempotency key. */
export type CustomerPushPayload = {
  customerId: string;
  name: string;
  phone: string | null;
  notes: string | null;
  updatedAt: number;
};

export type PushResult = {
  created: boolean;
  saleId?: string;
  receiptNo?: string;
};
