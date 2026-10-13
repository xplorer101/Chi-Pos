import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { getBackupMeta, type BackupMeta } from './backupMeta';
import { formatDate } from '@/lib/dates';
import { useTheme } from '@/theme/theme';

const EMPTY: BackupMeta = { lastBackupAt: null, reminderDays: 7, backupDue: false };

type Props = {
  /** Runs when the owner taps "Back up now" (e.g. opens the export sheet). */
  onBackupNow: () => void;
  onOpenSettings?: () => void;
};

/** Gentle reminder for the owner when a backup hasn't been made recently. */
export function BackupReminderBanner({ onBackupNow, onOpenSettings }: Props) {
  const theme = useTheme();
  const { data, refresh } = useLiveQuery(() => getBackupMeta(), [], 'backup-meta');

  const meta = data ?? EMPTY;
  if (!meta.backupDue) return null;

  const never = meta.lastBackupAt == null;
  return (
    <Card style={{ padding: theme.space(4), gap: theme.space(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(2) }}>
        <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.warning} />
        <Text variant="bodyMedium" tone="warning">
          {never ? 'Your shop has never been backed up' : `Last backup: ${formatDate(meta.lastBackupAt!)}`}
        </Text>
      </View>
      <Text variant="caption" tone="muted">
        Backing up writes your whole database to one file you can keep anywhere. It takes seconds.
        {meta.reminderDays > 0
          ? ` We suggest one every ${meta.reminderDays} days.`
          : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.space(3), marginTop: theme.space(2) }}>
        <Button label="Back up now" size="sm" icon="share-outline" onPress={() => { onBackupNow(); refresh(); }} />
        {onOpenSettings ? (
          <Button label="Settings" size="sm" variant="ghost" onPress={onOpenSettings} />
        ) : null}
      </View>
    </Card>
  );
}