import * as SecureStore from 'expo-secure-store';

const PAIRING_KEY = 'pos_pairing';

export type Pairing = {
  host: string;
  port: number;
  token: string;
  shopId: string;
  clientId: string;
  userId: string;
  userName: string;
  role: string;
};

export async function getPairing(): Promise<Pairing | null> {
  try {
    const raw = await SecureStore.getItemAsync(PAIRING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Pairing>;
    if (!parsed.host || !parsed.token || !parsed.clientId) return null;
    return {
      host: parsed.host,
      port: parsed.port ?? 8799,
      token: parsed.token,
      shopId: parsed.shopId ?? '',
      clientId: parsed.clientId,
      userId: parsed.userId ?? '',
      userName: parsed.userName ?? 'Cashier',
      role: parsed.role ?? 'cashier',
    };
  } catch {
    return null;
  }
}

export async function savePairing(pairing: Pairing): Promise<void> {
  await SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(pairing));
}

export async function clearPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(PAIRING_KEY);
}
