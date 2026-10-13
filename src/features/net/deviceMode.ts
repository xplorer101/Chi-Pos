import { create } from 'zustand';

import { getSettings, updateSettings } from '@/db/repositories/settingsRepo';
import type { DeviceMode } from '@/db/types';

export type { DeviceMode };

/**
 * The device's current mode, mirrored from settings into a store so the root
 * gate can react the moment it changes (e.g. when switching this phone into
 * cashier mode) without waiting for a full app restart.
 */
type DeviceModeStore = { mode: DeviceMode; setMode: (mode: DeviceMode) => void };

export const useDeviceModeStore = create<DeviceModeStore>((set) => ({
  mode: 'standalone',
  setMode: (mode) => set({ mode }),
}));

export async function getDeviceMode(): Promise<DeviceMode> {
  return (await getSettings()).deviceMode;
}

export async function setDeviceMode(mode: DeviceMode): Promise<void> {
  await updateSettings({ deviceMode: mode });
  useDeviceModeStore.getState().setMode(mode);
}

export function deviceModeLabel(mode: DeviceMode): string {
  if (mode === 'admin') return 'Admin host';
  if (mode === 'cashier') return 'Cashier';
  return 'Standalone';
}

export function deviceModeCaption(mode: DeviceMode): string {
  if (mode === 'admin') return 'This phone keeps the real data and serves cashier phones.';
  if (mode === 'cashier') return 'This phone pairs with an admin phone and syncs over Wi-Fi.';
  return 'The classic single-phone setup. Everything stays on this device.';
}
