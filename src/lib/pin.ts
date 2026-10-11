import * as Crypto from 'expo-crypto';

/** A PIN must be 4 to 6 digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

const PEPPER = 'shoppos.v2';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** A fresh random salt for PIN / recovery-code digests. */
export async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return toHex(bytes);
}

function digest(salt: string, value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${PEPPER}:${salt}:${value}`);
}

/** Salted digest. Only the digest and salt are ever stored, never the PIN. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return digest(salt, pin);
}

export async function verifyPin(
  pin: string,
  hash: string | null | undefined,
  salt: string | null | undefined,
): Promise<boolean> {
  if (!hash || !salt) return false;
  const candidate = await hashPin(pin, salt);
  return candidate === hash;
}

/** Hash a recovery code with its own salt. */
export async function hashRecoveryCode(code: string, salt: string): Promise<string> {
  return digest(salt, normalizeRecoveryCode(code));
}

export async function verifyRecoveryCode(
  code: string,
  hash: string | null | undefined,
  salt: string | null | undefined,
): Promise<boolean> {
  if (!hash || !salt) return false;
  const candidate = await hashRecoveryCode(code, salt);
  return candidate === hash;
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** Ambiguous characters (0/O, 1/I/L) are excluded so the code is easy to read. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * A one-time recovery code such as `K7QF-3M2P-9WRT-XB4H`, generated from a
 * cryptographic random source. The owner writes it down during setup.
 */
export async function generateRecoveryCode(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  const chars: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    chars.push(CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]);
  }
  return chars.join('').replace(/(.{4})(?=.)/g, '$1-');
}
