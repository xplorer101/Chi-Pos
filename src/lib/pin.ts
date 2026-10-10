import * as Crypto from 'expo-crypto';

/** A PIN must be 4 to 6 digits. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/**
 * Hash an owner PIN with a static app pepper.
 * Only the digest is stored, never the PIN itself.
 */
export async function hashPin(pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `shoppos.v1:${pin}`);
}

export async function verifyPin(pin: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  const candidate = await hashPin(pin);
  return candidate === hash;
}
