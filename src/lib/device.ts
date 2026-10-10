import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'device_id';

let cached: string | null = null;

/**
 * Stable id for this installation. Stored on every row so a future sync layer
 * can tell which device produced a record.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    cached = existing;
    return cached;
  }
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  cached = created;
  return created;
}

export function peekDeviceId(): string | null {
  return cached;
}
