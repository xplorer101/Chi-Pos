import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Pure, dependency-free backup format for ShopPOS. The whole file is a JSON
 * text with a human-readable header, a content checksum, and an optionally
 * encrypted data payload (AES-256-GCM, key derived with PBKDF2-HMAC-SHA256).
 *
 * Kept free of expo imports so it can be round-trip tested in plain Node.
 */

export const BACKUP_FORMAT = 'shoppos.backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KDF_ITERATIONS = 100_000;
export const BACKUP_FILE_EXTENSION = '.shoppos';
export const CONFIRM_WORD = 'RESTORE';

/** Table name -> rows. Rows are plain objects as stored in SQLite. */
export type BackupData = Record<string, unknown[]>;

export type BackupHeader = {
  app: string;
  /** App version that produced the file. */
  appVersion: string;
  /** `PRAGMA user_version` at export time. */
  schemaVersion: number;
  /** Epoch ms of export. */
  createdAt: number;
  /** Device-independent business name, readable without a password. */
  businessName: string;
  encrypted: boolean;
};

export type BackupPayload =
  | { encrypted: false; data: BackupData }
  | {
      encrypted: true;
      kdf: 'pbkdf2-sha256';
      /** PBKDF2 iteration count. */
      iterations: number;
      /** Random salt, base64. */
      salt: string;
      /** GCM nonce, base64. */
      iv: string;
      /** Ciphertext with the 16-byte GCM tag appended, base64. */
      ciphertext: string;
    };

export type BackupFile = {
  format: string;
  formatVersion: number;
  header: BackupHeader;
  payload: BackupPayload;
  /** SHA-256 hex over `{ header, payload }`, guards tampering in the open. */
  checksum: string;
};

export type BackupCounts = {
  items: number;
  customers: number;
  sales: number;
  /** Total owed to the shop across all customers, in kobo. */
  outstandingDebt: number;
};

type RandomBytes = (length: number) => Uint8Array;

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}
export class BackupChecksumError extends BackupFormatError {
  constructor() {
    super('This file has been corrupted or edited. Its checksum no longer matches.');
    this.name = 'BackupChecksumError';
  }
}
export class BackupEncryptionError extends BackupFormatError {
  constructor() {
    super('The backup password is not correct, or the file has been tampered with.');
    this.name = 'BackupEncryptionError';
  }
}
export class BackupSchemaTooNewError extends BackupFormatError {
  constructor(fileSchemaVersion: number, appSchemaVersion: number) {
    super(
      `This backup was made by a NEWER version of ShopPOS (data schema ${fileSchemaVersion}) ` +
        `and this app only understands up to schema ${appSchemaVersion}. ` +
        'Update the app first, then try again.',
    );
    this.name = 'BackupSchemaTooNewError';
  }
}

function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function sha256Hex(text: string): string {
  return toHex(sha256(utf8Encode(text)));
}

/** Stable-ish canonical text: exactly what we serialised before rounding-trip. */
function canonical(file: Pick<BackupFile, 'header' | 'payload'>): string {
  return JSON.stringify(file);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function isBackupData(value: unknown): value is BackupData {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.values(value).every((rows) => Array.isArray(rows))
  );
}

/**
 * Count live rows and the total outstanding debt from a data payload, without
 * touching the database. `deleted_at` rows and voided sales are excluded, and
 * `softwareDeleted` rows are counted the same way the app reads them
 * (customers/sales keep `deleted_at IS NULL`; voided sales use `status`).
 */
export function summarizeData(data: BackupData): BackupCounts {
  const notDeleted = <T extends { deleted_at?: number | null }>(rows: unknown[]): T[] =>
    (rows as T[]).filter((row) => !row.deleted_at);

  const liveItems = notDeleted<{ deleted_at?: number | null }>(data.items ?? []).length;
  const liveCustomers = notDeleted<{ deleted_at?: number | null }>(data.customers ?? []).length;
  const completedSales = notDeleted<{
    deleted_at?: number | null;
    status?: string;
  }>(data.sales ?? []).filter((sale) => sale.status !== 'voided').length;

  let outstandingDebt = 0;
  for (const payment of notDeleted<{
    deleted_at?: number | null;
    sale_id?: string | null;
    method?: string;
    amount?: number;
  }>(data.payments ?? [])) {
    const amount = Number(payment.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    if (payment.sale_id == null) outstandingDebt -= amount;
    else if (payment.method === 'credit') outstandingDebt += amount;
  }

  return { items: liveItems, customers: liveCustomers, sales: completedSales, outstandingDebt };
}

/** Parse text into a file object without verifying the checksum. */
export function parseBackupFile(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupFormatError('That file is not readable JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }
  const file = parsed as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT || file.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }
  const header = file.header as Partial<BackupHeader> | null;
  if (
    !header ||
    header.app !== 'ShopPOS' ||
    !Number.isInteger(header.schemaVersion) ||
    !Number.isFinite(header.createdAt) ||
    typeof header.businessName !== 'string'
  ) {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }
  const payload = file.payload as Partial<BackupPayload> | null;
  if (!payload || typeof payload !== 'object') {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }
  if (payload.encrypted) {
    const enc = payload as Partial<Extract<BackupPayload, { encrypted: true }>>;
    if (
      enc.kdf !== 'pbkdf2-sha256' ||
      !Number.isInteger(enc.iterations) ||
      typeof enc.salt !== 'string' ||
      typeof enc.iv !== 'string' ||
      typeof enc.ciphertext !== 'string'
    ) {
      throw new BackupFormatError('That is not a ShopPOS backup.');
    }
  } else if (!isBackupData((payload as { data?: unknown }).data)) {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }
  if (typeof file.checksum !== 'string') {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }

  return file as BackupFile;
}

/** Recompute and compare the file's checksum, throwing on mismatch. */
export function validateChecksum(file: BackupFile): void {
  const expected = file.checksum;
  const actual = sha256Hex(canonical({ header: file.header, payload: file.payload }));
  if (expected !== actual) throw new BackupChecksumError();
}

export type BackupKey = { kdf: 'pbkdf2-sha256'; iterations: number; salt: string };

export async function deriveKey(password: string, key: BackupKey): Promise<Uint8Array> {
  if (key.kdf !== 'pbkdf2-sha256' || !(key.iterations > 0)) {
    throw new BackupFormatError('Unsupported backup encryption.');
  }
  return pbkdf2Async(sha256, password, base64ToBytes(key.salt), {
    c: key.iterations,
    dkLen: 32,
    asyncTick: 5,
  });
}

export async function encryptData(
  data: BackupData,
  password: string,
  randomBytes: RandomBytes,
  iterations = BACKUP_KDF_ITERATIONS,
): Promise<Extract<BackupPayload, { encrypted: true }>> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(password, { kdf: 'pbkdf2-sha256', iterations, salt: bytesToBase64(salt) });
  const cipher = gcm(key, iv);
  const sealed = cipher.encrypt(utf8Encode(JSON.stringify(data)));
  if (sealed.length < 16) throw new BackupFormatError('Encryption produced no output.');
  return {
    encrypted: true,
    kdf: 'pbkdf2-sha256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(sealed),
  };
}

/** Decrypt a sealed payload, throwing a clear error on the wrong password. */
export async function decryptPayload(
  payload: Extract<BackupPayload, { encrypted: true }>,
  password: string,
): Promise<BackupData> {
  let sealed: Uint8Array;
  try {
    sealed = base64ToBytes(payload.ciphertext);
  } catch {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }
  if (sealed.length === 0) throw new BackupFormatError('That is not a ShopPOS backup.');
  const key = await deriveKey(password, {
    kdf: payload.kdf,
    iterations: payload.iterations,
    salt: payload.salt,
  });
  const cipher = gcm(key, base64ToBytes(payload.iv));
  let plaintext: Uint8Array;
  try {
    plaintext = cipher.decrypt(sealed);
  } catch {
    // Wrong password or tampered ciphertext - both end here.
    throw new BackupEncryptionError();
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new BackupFormatError('That is not a ShopPOS backup.');
  }
  if (!isBackupData(data)) throw new BackupFormatError('That is not a ShopPOS backup.');
  return data;
}

export async function openBackup(
  text: string,
  options: { password?: string; randomBytes?: RandomBytes } = {},
): Promise<{ file: BackupFile; data: BackupData }> {
  const file = parseBackupFile(text);
  validateChecksum(file);
  let data: BackupData;
  if (file.payload.encrypted) {
    if (!options.password) {
      throw new BackupEncryptionError();
    }
    data = await decryptPayload(file.payload, options.password);
  } else {
    data = (file.payload as { data: BackupData }).data;
  }
  return { file, data };
}

export type BuildBackupInput = {
  header: Omit<BackupHeader, 'encrypted'>;
  data: BackupData;
  password?: string;
  randomBytes?: RandomBytes;
};

export async function buildBackupFile(input: BuildBackupInput): Promise<BackupFile> {
  const payload: BackupPayload = input.password
    ? await encryptData(input.data, input.password, input.randomBytes ?? randomValuesFallback)
    : { encrypted: false, data: input.data };

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    header: { ...input.header, encrypted: input.password ? true : false },
    payload,
    checksum: '',
  };
  file.checksum = sha256Hex(canonical({ header: file.header, payload }));
  return file;
}

/** Non-cryptographic fallback used only when no random source is supplied. */
function randomValuesFallback(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return bytes;
}

/** `ShopPOS-backup-2026-10-13-1415` */
export function backupStamp(now: number): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

export function backupFileName(now: number): string {
  return `ShopPOS-backup-${backupStamp(now)}${BACKUP_FILE_EXTENSION}`;
}