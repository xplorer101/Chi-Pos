import React from 'react';
import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { listAuditEntries } from '@/db/repositories/auditRepo';
import { can } from '@/features/auth/permissions';
import { useSessionStore } from '@/features/auth/sessionStore';
import { formatDateTime } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import type { AuditAction } from '@/db/types';

const ACTION_LABEL: Record<AuditAction, string> = {
  void_sale: 'Voided sale',
  price_change: 'Price change',
  cost_change: 'Cost change',
  stock_adjustment: 'Stock adjustment',
  item_delete: 'Deleted item',
  customer_delete: 'Deleted customer',
  pin_reset: 'PIN reset',
  role_change: 'Staff update',
  staff_add: 'Staff added',
  staff_delete: 'Staff deleted',
  backup: 'Backup',
  restore: 'Restore',
};

export default function AuditLogScreen() {
  const currentUser = useSessionStore((state) => state.currentUser);
  if (!can(currentUser, 'change_settings')) {
    return <Redirect href="/" />;
  }
  return <AuditLogInner />;
}

function AuditLogInner() {
  const theme = useTheme();
  const router = useRouter();

  const { data: entries } = useLiveQuery(() => listAuditEntries({ limit: 200 }), []);

  return (
    <Screen title="Audit log" subtitle="Read-only record of privileged actions" onBack={() => router.back()}>
      {entries && entries.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="Nothing logged yet"
          message="Voids, price and cost changes, stock adjustments, deletions and PIN resets will appear here."
        />
      ) : (
        <View style={{ gap: theme.space(2) }}>
          {(entries ?? []).map((entry) => (
            <Card key={entry.id}>
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </Text>
                  <Text variant="caption" tone="faint">
                    {formatDateTime(entry.createdAt)}
                  </Text>
                </View>
                <Text variant="body" tone="muted">
                  {entry.summary}
                </Text>
                <Text variant="caption" tone="faint">
                  by {entry.userName || 'Unknown'}
                  {entry.userRole ? ` (${entry.userRole})` : ''}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}