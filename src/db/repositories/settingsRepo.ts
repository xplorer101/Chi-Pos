import * as SecureStore from 'expo-secure-store';

import { hashPin } from '@/lib/pin';

import { getDb } from '../index';
import { mapSettings, type SettingsRow } from '../mappers';
import { newRowMeta } from '../meta';
import { bumpRevision } from '../store';
import type { BusinessType, Settings } from '../types';

const SETTINGS_ID = 'shop';
const PIN_SECURE_STORE_KEY = 'owner_pin_hash';

const DEFAULTS = {
  shopName: 'My Shop',
  businessType: 'provision_shop' as BusinessType,
  currency: 'NGN',
  receiptFooter: 'Thank you for your patronage.',
  shopAddress: '',
  shopPhone: '',
};

export async function getSettings(): Promise<Settings> {
  const db = getDb();
  const row = await db.getFirstAsync<SettingsRow>(
    'SELECT * FROM settings WHERE id = ? AND deleted_at IS NULL',
    SETTINGS_ID,
  );
  if (row) return mapSettings(row);

  const meta = await newRowMeta();
  await db.runAsync(
    `INSERT OR IGNORE INTO settings
       (id, shop_name, business_type, currency, owner_pin_hash, receipt_footer,
        shop_address, shop_phone, created_at, updated_at, deleted_at, device_id)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)`,
    SETTINGS_ID,
    DEFAULTS.shopName,
    DEFAULTS.businessType,
    DEFAULTS.currency,
    DEFAULTS.receiptFooter,
    DEFAULTS.shopAddress,
    DEFAULTS.shopPhone,
    meta.now,
    meta.now,
    meta.deviceId,
  );
  const created = await db.getFirstAsync<SettingsRow>(
    'SELECT * FROM settings WHERE id = ?',
    SETTINGS_ID,
  );
  return mapSettings(created!);
}

export type SettingsPatch = Partial<{
  shopName: string;
  receiptFooter: string;
  shopAddress: string;
  shopPhone: string;
  currency: string;
  businessType: BusinessType;
  ownerPinHash: string | null;
}>;

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings();
  const db = getDb();
  const now = Date.now();

  const shopName = patch.shopName ?? current.shopName;
  const receiptFooter = patch.receiptFooter ?? current.receiptFooter;
  const shopAddress = patch.shopAddress ?? current.shopAddress;
  const shopPhone = patch.shopPhone ?? current.shopPhone;
  const currency = patch.currency ?? current.currency;
  const businessType = patch.businessType ?? current.businessType;
  const ownerPinHash =
    patch.ownerPinHash !== undefined ? patch.ownerPinHash : current.ownerPinHash;

  await db.runAsync(
    `UPDATE settings
        SET shop_name = ?, receipt_footer = ?, shop_address = ?, shop_phone = ?, currency = ?, business_type = ?,
            owner_pin_hash = ?, updated_at = ?
      WHERE id = ?`,
    shopName,
    receiptFooter,
    shopAddress,
    shopPhone,
    currency,
    businessType,
    ownerPinHash,
    now,
    SETTINGS_ID,
  );
  bumpRevision();
  return getSettings();
}

/**
 * The PIN digest lives in SecureStore (hardware-backed on Android) and is
 * mirrored into `settings.owner_pin_hash` so the data model and JSON export
 * stay self-describing.
 */
export async function setOwnerPin(pin: string | null): Promise<Settings> {
  if (pin === null) {
    await SecureStore.deleteItemAsync(PIN_SECURE_STORE_KEY);
    return updateSettings({ ownerPinHash: null });
  }
  const hash = await hashPin(pin);
  await SecureStore.setItemAsync(PIN_SECURE_STORE_KEY, hash);
  return updateSettings({ ownerPinHash: hash });
}

export async function getStoredPinHash(): Promise<string | null> {
  const fromSecureStore = await SecureStore.getItemAsync(PIN_SECURE_STORE_KEY);
  if (fromSecureStore) return fromSecureStore;
  const settings = await getSettings();
  return settings.ownerPinHash;
}
