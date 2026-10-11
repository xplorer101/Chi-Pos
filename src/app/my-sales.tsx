import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/Section';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { listSales } from '@/db/repositories/salesRepo';
import { useSessionStore } from '@/features/auth/sessionStore';
import { formatDate, formatDateTime, periodRange } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';

type Scope = 'today' | 'all';

export default function MySalesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const actor = useSessionStore((state) => state.currentUser) as ActingUser;
  const [scope, setScope] = useState<Scope>('today');

  const today = useMemo(() => periodRange('today'), []);

  const { data: sales } = useLiveQuery(
    () =>
      listSales(actor, {
        start: scope === 'today' ? today.start : undefined,
        end: scope === 'today' ? today.end : undefined,
        limit: 200,
        userId: actor.id,
      }),
    [scope, today.start, today.end],
  );

  const todayTotal = useMemo(() => {
    if (scope !== 'today') return 0;
    return (sales ?? []).reduce((sum, sale) => sum + sale.total, 0);
  }, [sales, scope]);

  return (
    <Screen title="My sales" subtitle={`Signed in as ${actor.name}`} onBack={() => router.back()}>
      <ChipRow
        options={[
          { value: 'today', label: 'Today' },
          { value: 'all', label: 'All mine' },
        ]}
        value={scope}
        onChange={(value) => setScope(value as Scope)}
      />

      {scope === 'today' ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space(3) }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="muted">
                My sales today ({formatDate(today.start)})
              </Text>
              <Text variant="moneyLarge" tone="accent">
                {formatMoney(todayTotal)}
              </Text>
            </View>
            <Badge label={`${sales?.length ?? 0} sale${sales?.length === 1 ? '' : 's'}`} tone="neutral" />
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>My receipts</SectionTitle>
        {sales && sales.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No sales yet"
            message={scope === 'today' ? 'Complete a sale and it will show up here.' : 'Sales you make are grouped here.'}
          />
        ) : (
          <Card padded={false}>
            {(sales ?? []).map((sale, index) => (
              <Pressable
                key={sale.id}
                onPress={() => router.push(`/receipt/${sale.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space(3),
                  paddingHorizontal: theme.space(4),
                  paddingVertical: theme.space(3),
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                  backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent',
                })}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(2) }}>
                    <Text variant="bodyMedium">#{sale.receiptNo}</Text>
                    {sale.status === 'voided' ? <Badge label="Voided" tone="danger" /> : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {formatDateTime(sale.soldAt)} · {sale.itemCount} line
                    {sale.itemCount === 1 ? '' : 's'}
                    {sale.customerName ? ` · ${sale.customerName}` : ''}
                  </Text>
                </View>
                <Text variant="moneySmall" style={{ fontFamily: theme.font.semibold }}>
                  {formatMoney(sale.total)}
                </Text>
              </Pressable>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}