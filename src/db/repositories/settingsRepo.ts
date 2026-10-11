import { getDb } from '../index';
import { mapSettings, type SettingsRow } from '../mappers';
import { newRowMeta } from '../meta';
import { bumpRevision } from '../store';
import type { BusinessType, Settings } from '../types';

const SETTINGS_ID = 'shop';

const DEFAULTS = {
  shopName: 'My Shop',
  businessType: 'provision_shop' as BusinessType,
  currency: 'NGN',
  receiptFooter: 'Thank you for your patronage.',
  shopAddress: '',
  shopPhone: '',
  autoLockMinutes: 5,
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
        shop_address, shop_phone, auto_lock_minutes, created_at, updated_at, deleted_at, device_id)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    SETTINGS_ID,
    DEFAULTS.shopName,
    DEFAULTS.businessType,
    DEFAULTS.currency,
    DEFAULTS.receiptFooter,
    DEFAULTS.shopAddress,
    DEFAULTS.shopPhone,
    DEFAULTS.autoLockMinutes,
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
  autoLockMinutes: number;
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
  const autoLockMinutes = patch.autoLockMinutes ?? current.autoLockMinutes;
  const ownerPinHash =
    patch.ownerPinHash !== undefined ? patch.ownerPinHash : current.ownerPinHash;

  await db.runAsync(
    `UPDATE settings
        SET shop_name = ?, receipt_footer = ?, shop_address = ?, shop_phone = ?, currency = ?, business_type = ?,
            auto_lock_minutes = ?, owner_pin_hash = ?, updated_at = ?
      WHERE id = ?`,
    shopName,
    receiptFooter,
    shopAddress,
    shopPhone,
    currency,
    businessType,
    autoLockMinutes,
    ownerPinHash,
    now,
    SETTINGS_ID,
  );
  bumpRevision();
  return getSettings();
}
