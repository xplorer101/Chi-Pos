import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { verifyPin } from '@/lib/pin';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type Props = {
  shopName: string;
  pinHash: string | null;
  biometricsAvailable: boolean;
  biometricsEnabled: boolean;
  onUnlock: () => void;
  onUseBiometrics: () => void;
};

const MAX_PIN_LENGTH = 6;
const MIN_PIN_LENGTH = 4;

export function LockScreen({
  shopName,
  pinHash,
  biometricsAvailable,
  biometricsEnabled,
  onUnlock,
  onUseBiometrics,
}: Props) {
  const theme = useTheme();
  const [entered, setEntered] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = useCallback(
    async (pin: string) => {
      if (pin.length < MIN_PIN_LENGTH) return;
      setChecking(true);
      const ok = await verifyPin(pin, pinHash);
      setChecking(false);
      if (ok) {
        setError(null);
        onUnlock();
      } else {
        setError('Incorrect PIN. Try again.');
        setEntered('');
      }
    },
    [onUnlock, pinHash],
  );

  const press = useCallback(
    (key: string) => {
      if (checking) return;
      setError(null);
      if (key === 'back') {
        setEntered((value) => value.slice(0, -1));
        return;
      }
      setEntered((value) => {
        if (value.length >= MAX_PIN_LENGTH) return value;
        const next = value + key;
        if (next.length >= MIN_PIN_LENGTH) {
          void submit(next);
        }
        return next;
      });
    },
    [checking, submit],
  );

  useEffect(() => {
    if (biometricsAvailable && biometricsEnabled) onUseBiometrics();
    // Offer biometrics once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.space(6),
          gap: theme.space(3),
        }}
      >
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: theme.space(2),
          }}
        >
          <Ionicons name="storefront" size={30} color={theme.colors.onPrimary} />
        </View>
        <Text variant="title">{shopName || 'ShopPOS'}</Text>
        <Text variant="body" tone="muted">
          Enter your PIN to continue
        </Text>

        <View
          style={{
            flexDirection: 'row',
            gap: 14,
            marginTop: theme.space(6),
            height: 20,
            alignItems: 'center',
          }}
        >
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, index) => {
            const filled = index < entered.length;
            const active = index === entered.length;
            return (
              <View
                key={index}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  borderWidth: 1.5,
                  borderColor: error
                    ? theme.colors.danger
                    : active || filled
                      ? theme.colors.primary
                      : theme.colors.borderStrong,
                  backgroundColor:
                    filled || (active && entered.length > 0)
                      ? error
                        ? theme.colors.danger
                        : theme.colors.primary
                      : 'transparent',
                }}
              />
            );
          })}
        </View>

        <View style={{ height: 26, justifyContent: 'center' }}>
          {error ? (
            <Text variant="label" tone="danger" center>
              {error}
            </Text>
          ) : checking ? (
            <Text variant="label" tone="muted" center>
              Checking…
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: theme.space(8),
          paddingBottom: theme.space(6),
          gap: theme.space(3),
        }}
      >
        <View style={{ gap: theme.space(3) }}>
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ].map((row) => (
            <View key={row[0]} style={{ flexDirection: 'row', gap: theme.space(3) }}>
              {row.map((key) => (
                <KeypadKey key={key} label={key} onPress={() => press(key)} />
              ))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: theme.space(3) }}>
            <KeypadKey
              label=""
              icon={biometricsAvailable && biometricsEnabled ? 'finger-print' : undefined}
              onPress={() => {
                if (biometricsAvailable && biometricsEnabled) onUseBiometrics();
              }}
              muted
            />
            <KeypadKey label="0" onPress={() => press('0')} />
            <KeypadKey label="" icon="backspace-outline" onPress={() => press('back')} muted />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function KeypadKey({
  label,
  icon,
  onPress,
  muted,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  muted?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label || icon}
      style={({ pressed }) => ({
        flex: 1,
        height: 62,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed
          ? theme.colors.surfacePressed
          : muted
            ? 'transparent'
            : theme.colors.surface,
        borderWidth: muted ? 0 : 1,
        borderColor: theme.colors.border,
      })}
    >
      {icon ? (
        <Ionicons name={icon} size={24} color={theme.colors.accent} />
      ) : (
        <Text variant="title" style={{ fontFamily: theme.font.medium }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
