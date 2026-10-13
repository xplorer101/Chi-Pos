import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import * as Sharing from 'expo-sharing';

import { Button } from '@/components/Button';
import { FormSheet } from '@/components/FormSheet';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { useBackupProgress } from './backupProgress';
import { BackupProgressBar } from './BackupProgressBar';
import { exportBackup } from './backupService';
import { formatDateTime } from '@/lib/dates';
import type { ActingUser } from '@/db/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
  onExported: (name: string) => void;
};

/** Owner-only export: verifies the owner's PIN, optionally encrypts, shares. */
export function ExportBackupSheet({ visible, onClose, actor, onExported }: Props) {
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPin('');
    setPassword('');
    setConfirm('');
    setError(null);
    setWorking(false);
  }, [visible]);

  const submit = async () => {
    setError(null);
    const passwordValue = password.trim();
    if (passwordValue !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setWorking(true);
    useBackupProgress.getState().begin('Preparing backup');
    try {
      const result = await exportBackup(actor, {
        pin,
        password: passwordValue || undefined,
        onProgress: (label, current, total) =>
          useBackupProgress.getState().update(label, total > 0 ? current / total : null),
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Share ShopPOS backup',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Sharing not available', 'This device cannot share files.');
      }
      onExported(result.name);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      useBackupProgress.getState().end();
      setWorking(false);
    }
  };

  const title = 'Back up now';

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={title}
      dismissable={!working}
      subtitle="Re-enter your owner PIN. The whole database is written to one file you can share anywhere."
      footer={
        <View style={{ gap: 12 }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <BackupProgressBar />
          <Button
            label="Create backup file"
            icon="share-outline"
            onPress={() => void submit()}
            loading={working}
            disabled={!pin}
          />
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <Input
          label="Owner PIN"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="••••"
        />
        <Input
          label="Password (optional)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Encrypt the backup with a password"
          autoCapitalize="none"
        />
        <Input
          label="Repeat password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          editable={password.trim().length > 0}
          placeholder="Repeat the password"
          autoCapitalize="none"
        />
        <Text variant="caption" tone="warning">
          If you set a password, the backup can only be opened with that password. A lost password
          means the backup cannot be restored - there is no way to recover it.
        </Text>
        <Text variant="caption" tone="faint">
          No password means the file is readable by anyone who has it. Sale prices and staff records
          are included in the file.
        </Text>
      </View>
    </FormSheet>
  );
}

export function lastBackupLabel(lastBackupAt: number | null): string {
  return lastBackupAt == null ? 'Never' : formatDateTime(lastBackupAt);
}