import React, { useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { createOwner } from '@/db/repositories/usersRepo';
import { RestoreBackupModal } from '@/features/backup/RestoreBackupModal';
import { isValidPin } from '@/lib/pin';
import { useTheme } from '@/theme/theme';
import type { User } from '@/db/types';

import { useSessionStore } from './sessionStore';

/**
 * First launch only: the owner picks a name and PIN. After that a one-time
 * recovery code is shown once and must be confirmed, so the owner can get back
 * in offline if they ever forget the PIN.
 */
export function OwnerSetup() {
  const theme = useTheme();
  const setBiometrics = useSessionStore((state) => state.setBiometrics);

  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [owner, setOwner] = useState<User | null>(null);
  const [writtenDown, setWrittenDown] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    if (!isValidPin(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    if (pin !== confirm) {
      setError('The two PINs do not match.');
      return;
    }
    setCreating(true);
    try {
      const result = await createOwner({ name, pin });
      setOwner(result.owner);
      setRecoveryCode(result.recoveryCode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCreating(false);
    }
  };

  const finish = async () => {
    if (!owner) return;
    try {
      const { hasBiometricHardware } = await import('@/features/auth/biometrics');
      const available = await hasBiometricHardware();
      setBiometrics({ available, enabled: false });
    } catch {
      // Biometrics is optional; proceed without it.
    }
    useSessionStore.getState().unlock(owner);
  };

  if (recoveryCode && owner) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        contentContainerStyle={{
          padding: theme.space(5),
          flexGrow: 1,
          justifyContent: 'center',
          gap: theme.space(4),
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="heading">Write this recovery code down</Text>
        <Text variant="body" tone="muted">
          This is your only way back into the app if you forget your PIN — it works fully offline.
          Write it on paper and keep it somewhere safe. It will not be shown again.
        </Text>

        <Card>
          <Text variant="title" center selectable style={{ letterSpacing: 2 }}>
            {recoveryCode}
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
          <Switch
            value={writtenDown}
            onValueChange={setWrittenDown}
            trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
            thumbColor={theme.colors.surface}
          />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">I have written it down</Text>
            <Text variant="caption" tone="muted">
              You must confirm before you can continue.
            </Text>
          </View>
        </View>

        <Button
          label="Finish setup"
          icon="checkmark"
          disabled={!writtenDown}
          onPress={() => void finish()}
        />

        <Button
          label="Cancel and start again"
          variant="outline"
          onPress={() => {
            Alert.alert('Start over?', 'This will create the owner account again.', [
              { text: 'Go back', style: 'cancel' },
              { text: 'Start over', style: 'destructive', onPress: () => useSessionStore.getState().goToSetup() },
            ]);
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        padding: theme.space(5),
        flexGrow: 1,
        justifyContent: 'center',
        gap: theme.space(4),
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="heading">Set up your shop</Text>
      <Text variant="body" tone="muted">
        This device becomes the owner. You will manage cashiers from Settings.
      </Text>

      <Card>
        <View style={{ gap: theme.space(3) }}>
          <Input
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chidera"
            autoCapitalize="words"
          />
          <Input
            label="Owner PIN"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="4 to 6 digits"
          />
          <Input
            label="Confirm PIN"
            value={confirm}
            onChangeText={setConfirm}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="Repeat the PIN"
          />
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Continue" icon="arrow-forward" onPress={() => void submit()} loading={creating} />
        </View>
      </Card>

      <Button
        label="I have a ShopPOS backup - restore it instead"
        variant="outline"
        icon="cloud-download-outline"
        onPress={() => setRestoreOpen(true)}
      />

      <RestoreBackupModal
        visible={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        actor={null}
      />
    </ScrollView>
  );
}