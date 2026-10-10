import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { LockScreen } from '@/components/LockScreen';
import { Text } from '@/components/Text';
import { Toast } from '@/components/Toast';
import { initDb } from '@/db';
import { getSettings, getStoredPinHash } from '@/db/repositories/settingsRepo';
import { useAuthStore } from '@/features/auth/authStore';
import {
  hasBiometricHardware,
  isBiometricsEnabled,
  promptBiometrics,
} from '@/features/auth/biometrics';
import { ThemeProvider, useTheme } from '@/theme/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <RootGate />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

function RootGate() {
  const theme = useTheme();
  const unlocked = useAuthStore((state) => state.unlocked);
  const pinHash = useAuthStore((state) => state.pinHash);
  const biometrics = useAuthStore((state) => state.biometrics);
  const unlock = useAuthStore((state) => state.unlock);
  const lock = useAuthStore((state) => state.lock);

  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await initDb();
        const settings = await getSettings();
        const hash = await getStoredPinHash();
        const available = await hasBiometricHardware();
        const enabled = available ? await isBiometricsEnabled() : false;
        if (!mounted) return;
        setShopName(settings.shopName);
        useAuthStore.setState({
          pinHash: hash,
          biometrics: { available, enabled },
          unlocked: hash === null,
        });
      } catch (error) {
        if (!mounted) return;
        setBootError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!mounted) return;
        setBooted(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Re-lock whenever the app is sent to the background (PIN enabled only).
  useEffect(() => {
    if (!booted || pinHash === null) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') lock();
    });
    return () => subscription.remove();
  }, [booted, pinHash, lock]);

  if (!booted) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.bg }} />;
  }

  if (bootError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.space(6),
        }}
      >
        <Text variant="heading" tone="danger" center>
          Could not start the app
        </Text>
        <Text variant="body" tone="muted" center>
          {bootError}
        </Text>
      </View>
    );
  }

  const needsLock = pinHash !== null && !unlocked;

  return (
    <>
      <StatusBar style="auto" />
      <Toast />
      {needsLock ? (
        <LockScreen
          shopName={shopName}
          pinHash={pinHash}
          biometricsAvailable={biometrics.available}
          biometricsEnabled={biometrics.enabled}
          onUnlock={unlock}
          onUseBiometrics={() => {
            void promptBiometrics().then((ok) => {
              if (ok) unlock();
            });
          }}
        />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.bg },
          }}
        />
      )}
    </>
  );
}
