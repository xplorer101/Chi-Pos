import * as Crypto from 'expo-crypto';

const PEPPER = 'shoppos.device.v1';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** A long-lived device token, stored raw on the cashier and hashed on the host. */
export async function generateDeviceToken(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(24);
  return toHex(bytes);
}

/** A short secret the cashier keeps until its pairing request is approved. */
export async function generateClaimSecret(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return toHex(bytes);
}

/** The one-time key shown in the host QR, only valid while hosting. */
export async function generatePairingKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(4);
  return toHex(bytes).toUpperCase().match(/.{1,4}/g)?.join('-') ?? toHex(bytes).toUpperCase();
}

export async function hashSecret(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${PEPPER}:${value}`);
}

/** Constant-time-ish comparison of two digests of equal length. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
