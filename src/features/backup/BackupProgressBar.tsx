import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/Text';
import { useBackupProgress } from '../backup/backupProgress';
import { useTheme } from '@/theme/theme';

/** Thin progress row used while exporting or restoring a large database. */
export function BackupProgressBar() {
  const theme = useTheme();
  const progress = useBackupProgress((state) =>
    state.active ? { label: state.label, value: state.progress } : null,
  );

  if (!progress) return null;

  return (
    <View style={{ gap: theme.space(2) }}>
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${progress.value == null ? 100 : Math.max(2, Math.min(100, progress.value * 100))}%`,
            backgroundColor: theme.colors.primary,
            opacity: progress.value == null ? 0.4 : 1,
          }}
        />
      </View>
      <Text variant="caption" tone="muted">
        {progress.label}
        {progress.value != null ? ` · ${Math.round(progress.value * 100)}%` : ''}
      </Text>
    </View>
  );
}