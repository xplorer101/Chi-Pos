import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { Text } from '@/components/Text';
import { Toast } from '@/components/Toast';
import { initDb } from '@/db';
import { needsSetup } from '@/db/repositories/usersRepo';
import { hasBiometricHardware, isBiometricsEnabled } from '@/features/auth/biometrics';
import { OwnerSetup } from '@/features/auth/OwnerSetup';
import { useSessionStore } from '@/features/auth/sessionStore';
import { useAutoLock } from '@/features/auth/useAutoLock';
import { UserSwitch } from '@/features/auth/UserSwitch';
import { CashierBoot } from '@/features/net/CashierBoot';
import { useDeviceModeStore } from '@/features/net/deviceMode';
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
  const status = useSessionStore((state) => state.status);

  const [booted, setBooted] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const deviceMode = useDeviceModeStore((state) => state.mode);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await initDb();
        const [{ getSettings }] = await Promise.all([
          import('@/db/repositories/settingsRepo'),
        ]);
        const settings = await getSettings();
        if (mounted) {
          setShopName(settings.shopName);
          useDeviceModeStore.getState().setMode(settings.deviceMode);
        }
        const available = await hasBiometricHardware();
        const enabled = available ? await isBiometricsEnabled() : false;
        if (!mounted) return;
        useSessionStore.getState().setBiometrics({ available, enabled });

        // A cashier phone is driven entirely by its pairing, not local accounts.
        if (settings.deviceMode === 'cashier') {
          return;
        }

        const setup = await needsSetup();
        if (setup) {
          useSessionStore.getState().goToSetup();
        } else {
          await useSessionStore.getState().boot();
        }
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

  useAutoLock(deviceMode !== 'cashier');

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

  return (
    <>
      <StatusBar style="auto" />
      <Toast />
      {deviceMode === 'cashier' && status !== 'unlocked' ? (
        <CashierBoot />
      ) : status === 'setup' ? (
        <OwnerSetup />
      ) : status === 'locked' ? (
        <UserSwitch shopName={shopName} />
      ) : status === 'unlocked' ? (
        <>
          <TouchOnNavigate />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.bg },
            }}
          />
        </>
      ) : null}
    </>
  );
}

function TouchOnNavigate() {
  const pathname = usePathname();
  useEffect(() => {
    useSessionStore.getState().touch();
  }, [pathname]);
  return null;
}