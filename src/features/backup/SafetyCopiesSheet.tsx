import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/Button';
import { Divider } from '@/components/Section';
import { FormSheet } from '@/components/FormSheet';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { useSessionStore } from '@/features/auth/sessionStore';
import { formatDateTime } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';
import { CONFIRM_WORD } from './backupFormat';
import { useBackupProgress } from './backupProgress';
import { BackupProgressBar } from './BackupProgressBar';
import { listSafetyCopies, restoreSafetyCopy, type SafetyCopySummary } from './backupService';

type Props = {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** On-device safety copies taken right before a restore, so a restore can be undone. */
export function SafetyCopiesSheet({ visible, onClose, actor }: Props) {
  const theme = useTheme();
  const { data: copies, refresh } = useLiveQuery(() => listSafetyCopies(), [], 'safety-copies');

  const [selected, setSelected] = useState<SafetyCopySummary | null>(null);
  const [pin, setPin] = useState('');
  const [confirmWord, setConfirmWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setPin('');
    setConfirmWord('');
    setError(null);
    setWorking(false);
  }, [visible]);

  const doRestore = async () => {
    if (!selected) return;
    setError(null);
    setWorking(true);
    useBackupProgress.getState().begin(`Restoring safety copy ${selected.name}`);
    try {
      const result = await restoreSafetyCopy(actor, {
        pin,
        name: selected.name,
        confirmWord,
        onProgress: (label, current, total) =>
          useBackupProgress.getState().update(label, total > 0 ? current / total : null),
      });
      void result;
      Alert.alert(
        'Safety copy restored',
        'That earlier state is back. The app will return to the login screen - the owner signs ' +
          'in with the PIN that was saved in the safety copy.',
        [{ text: 'OK' }],
      );
      onClose();
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      await useSessionStore.getState().restart();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      useBackupProgress.getState().end();
      setWorking(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Safety copies"
      subtitle="Before every restore, the current data is saved here automatically. The last 3 are kept."
      dismissable={!working}
      footer={
        <View style={{ gap: 12 }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <BackupProgressBar />
          {selected ? (
            <>
              <Text variant="caption" tone="warning">
                Restoring “{selected.name}” replaces everything with that older state.
              </Text>
              <Button
                label="Replace everything now"
                variant="danger"
                onPress={() => void doRestore()}
                loading={working}
                disabled={pin.length < 4 || confirmWord.toUpperCase() !== CONFIRM_WORD}
              />
              <Button
                label="Pick a different copy"
                variant="ghost"
                onPress={() => setSelected(null)}
                disabled={working}
              />
            </>
          ) : (
            <Button label="Close" icon="close" onPress={onClose} disabled={working} />
          )}
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        {selected ? (
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
              label={`Type ${CONFIRM_WORD} to continue`}
              value={confirmWord}
              onChangeText={(value) => setConfirmWord(value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={CONFIRM_WORD}
            />
            <Text variant="caption" tone="muted">
              Copy made {selected.createdAt ? formatDateTime(selected.createdAt) : 'long ago'} ·{' '}
              {formatSize(selected.size)}
            </Text>
          </View>
        ) : copies && copies.length > 0 ? (
          copies.map((copy, index) => (
            <View key={copy.name}>
              {index > 0 ? <Divider /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space(3),
                  paddingVertical: theme.space(2),
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {copy.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {copy.createdAt ? formatDateTime(copy.createdAt) : '—'} · {formatSize(copy.size)}
                  </Text>
                </View>
                <Button
                  label="Restore"
                  size="sm"
                  variant="danger"
                  icon="refresh"
                  onPress={() => {
                    setSelected(copy);
                    setError(null);
                    refresh();
                  }}
                />
              </View>
            </View>
          ))
        ) : (
          <Text variant="body" tone="muted">
            No safety copies yet. They appear automatically the first time you restore a backup.
          </Text>
        )}
      </View>
    </FormSheet>
  );
}