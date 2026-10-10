import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY = 'biometrics_enabled';

export async function hasBiometricHardware(): Promise<boolean> {
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function isBiometricsEnabled(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(KEY);
    return value === '1';
  } catch {
    return false;
  }
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(KEY, '1');
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
}

export async function promptBiometrics(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock ShopPOS',
      disableDeviceFallback: true,
      cancelLabel: 'Use PIN',
    });
    return result.success;
  } catch {
    return false;
  }
}
