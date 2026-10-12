import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { EmptyState } from '@/components/EmptyState';
import { QueryErrorState } from '@/components/QueryErrorState';
import { SearchInput } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { listCustomers } from '@/db/repositories/customersRepo';
import { getOutstandingDebt } from '@/db/repositories/reportsRepo';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';

const VIEWS: { value: 'all' | 'owing'; label: string }[] = [
  { value: 'all', label: 'All customers' },
  { value: 'owing', label: 'Debtors' },
];

export default function CustomersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'owing'>('all');
  const debtorsOnly = view === 'owing';

  useEffect(() => {
    if (viewParam === 'owing') setView('owing');
  }, [viewParam]);

  const { data: customers, isLoading, error: customersError, refresh: refreshCustomers } = useLiveQuery(
    () => listCustomers({ search, owingOnly: debtorsOnly }),
    [search, debtorsOnly],
    'customers-list',
  );
  const { data: totalOutstanding } = useLiveQuery(() => getOutstandingDebt(), [], 'customers-list');

  const list = customers ?? [];
  const owedTotal = list.reduce((sum, customer) => sum + customer.owed, 0);
  const subtitle = debtorsOnly
    ? `${formatMoney(totalOutstanding ?? 0)} owed in total`
    : owedTotal > 0
      ? `${formatMoney(owedTotal)} owed to you`
      : 'Everyone is settled up';

  return (
    <Screen
      title="Customers"
      subtitle={subtitle}
      right={
        <Pressable
          onPress={() => router.push('/customer/new')}
          accessibilityLabel="Add customer"
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: theme.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
          })}
        >
          <Ionicons name="add" size={24} color={theme.colors.onPrimary} />
        </Pressable>
      }
      footer={<Button label="Add customer" icon="person-add" onPress={() => router.push('/customer/new')} />}
    >
      <ChipRow options={VIEWS} value={view} onChange={setView} />

      <SearchInput value={search} onChange={setSearch} placeholder="Search name or phone number" />

      {debtorsOnly ? (
        <Card tone="alt">
          <View style={{ gap: 4 }}>
            <Text variant="label" tone="muted">
              Total outstanding
            </Text>
            <Text variant="moneyLarge" tone="warning">
              {formatMoney(totalOutstanding ?? 0)}
            </Text>
            <Text variant="caption" tone="faint">
              Money customers owe across every sale
            </Text>
          </View>
        </Card>
      ) : null}

      {customersError ? (
        <QueryErrorState onRetry={refreshCustomers} />
      ) : isLoading ? null : list.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={
            search
              ? 'No customers match'
              : debtorsOnly
                ? 'No debts right now'
                : 'No customers yet'
          }
          message={
            search
              ? 'Try a different name or phone number.'
              : debtorsOnly
                ? 'Everyone has settled their balance — nice.'
                : 'Customers you give credit to show up here with their running balance.'
          }
          actionLabel={debtorsOnly ? undefined : 'Add customer'}
          onAction={() => router.push('/customer/new')}
        />
      ) : (
        <View style={{ gap: theme.space(2) }}>
          {list.map((customer) => {
            const owes = customer.owed > 0;
            return (
              <Pressable
                key={customer.id}
                onPress={() => router.push(`/customer/${customer.id}`)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space(3),
                  minHeight: theme.tapTarget + 12,
                  backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
                  borderRadius: theme.radius.lg,
                  borderWidth: 1,
                  borderColor: owes ? theme.colors.warning : theme.colors.border,
                  padding: theme.space(3),
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: theme.radius.pill,
                    backgroundColor: theme.colors.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="person" size={19} color={theme.colors.textMuted} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text variant="subheading" numberOfLines={1}>
                    {customer.name}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {customer.phone || 'No phone number'}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Badge label={owes ? 'Owes' : 'Settled'} tone={owes ? 'warning' : 'success'} />
                  <Text
                    variant="moneySmall"
                    style={{
                      fontFamily: theme.font.semibold,
                      color: owes ? theme.colors.warning : theme.colors.textFaint,
                    }}
                  >
                    {formatMoney(customer.owed)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
