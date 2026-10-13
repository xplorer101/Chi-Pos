import React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/theme/theme';

import type { ClientStatus } from './clientStore';

const LABELS: Record<ClientStatus, string> = {
  unpaired: 'Not paired',
  connecting: 'Connecting…',
  pending: 'Awaiting approval',
  connected: 'Connected',
  offline: 'Offline',
};

export function statusLabel(status: ClientStatus): string {
  return LABELS[status];
}

type Tone = 'success' | 'warning' | 'danger' | 'muted';

function toneFor(status: ClientStatus): Tone {
  if (status === 'connected') return 'success';
  if (status === 'offline' || status === 'pending' || status === 'connecting') return 'warning';
  return 'muted';
}

/** Small pill showing whether this cashier phone can reach the admin. */
export function StatusChip({ status, compact }: { status: ClientStatus; compact?: boolean }) {
  const theme = useTheme();
  const color =
    toneFor(status) === 'success'
      ? theme.colors.success
      : toneFor(status) === 'warning'
        ? theme.colors.warning
        : theme.colors.textFaint;

  if (compact) {
    return <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />;
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="caption" style={{ fontFamily: theme.font.semibold, color: theme.colors.textMuted }}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}
