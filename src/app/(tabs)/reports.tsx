import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { Divider, KeyValueRow, SectionTitle } from '@/components/Section';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import {
  getEndOfDaySummary,
  getReport,
  type ReportPeriod,
} from '@/db/repositories/reportsRepo';
import { listSales } from '@/db/repositories/salesRepo';
import { periodRange, formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Transfer',
  pos: 'POS',
  credit: 'Credit given',
};

export default function ReportsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [period, setPeriod] = useState<ReportPeriod>('today');

  const { start, end } = useMemo(() => periodRange(period), [period]);

  const { data: report, isLoading } = useLiveQuery(() => getReport(start, end), [start, end]);
  const { data: eod } = useLiveQuery(() => getEndOfDaySummary(), [period]);
  const { data: sales } = useLiveQuery(() => listSales({ start, end, limit: 15 }), [start, end]);

  const profitMargin =
    report && report.totalSales > 0
      ? Math.round((report.estimatedProfit / report.totalSales) * 100)
      : 0;

  return (
    <Screen title="Reports" subtitle="How the shop is doing">
      <ChipRow options={PERIODS} value={period} onChange={setPeriod} />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space(3) }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="muted">
              Total sales
            </Text>
            <Text variant="moneyLarge" tone="accent">
              {formatMoney(report?.totalSales ?? 0)}
            </Text>
          </View>
          <Badge
            label={`${report?.salesCount ?? 0} sale${report?.salesCount === 1 ? '' : 's'}`}
            tone="neutral"
          />
        </View>
        <Divider />
        <KeyValueRow
          label="Items sold"
          value={String(report?.itemsSoldCount ?? 0)}
          tone="muted"
        />
        <KeyValueRow
          label="Estimated profit"
          value={`${formatMoney(report?.estimatedProfit ?? 0)}${profitMargin > 0 ? ` (${profitMargin}%)` : ''}`}
          tone="muted"
        />
        <KeyValueRow
          label="Money on credit"
          value={formatMoney(report?.outstandingDebt ?? 0)}
          tone="muted"
        />
      </Card>

      {!isLoading && (report?.salesCount ?? 0) === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title="Nothing here yet"
          message="Complete a sale and this period will start filling in."
          actionLabel="Go to Sell"
          onAction={() => router.replace('/')}
        />
      ) : null}

      {report && report.byMethod.length > 0 ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>How customers paid</SectionTitle>
          <Card>
            {report.byMethod.map((method, index) => (
              <View key={method.method}>
                {index > 0 ? <Divider /> : null}
                <KeyValueRow
                  label={METHOD_LABEL[method.method] ?? method.method}
                  value={formatMoney(method.amount)}
                  tone={method.method === 'credit' ? 'warning' : 'muted'}
                />
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {period === 'today' && eod ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>End of day</SectionTitle>
          <Card>
            <KeyValueRow label="Cash in drawer" value={formatMoney(eod.expectedCash)} tone="muted" />
            <Divider />
            <KeyValueRow label="Cash from sales" value={formatMoney(eod.cashFromSales)} tone="muted" />
            <Divider />
            <KeyValueRow label="Cash debt payments" value={formatMoney(eod.cashFromDebtPayments)} tone="muted" />
            <Divider />
            <KeyValueRow label="Transfer / POS" value={formatMoney(eod.nonCash)} tone="muted" />
            <Divider />
            <KeyValueRow label="Credit extended" value={formatMoney(eod.creditExtended)} tone="warning" />
          </Card>
        </View>
      ) : null}

      {report && report.topSellers.length > 0 ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Top sellers</SectionTitle>
          <Card padded={false}>
            {report.topSellers.map((seller, index) => (
              <View
                key={seller.itemId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space(3),
                  paddingHorizontal: theme.space(4),
                  paddingVertical: theme.space(3),
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Text
                  variant="label"
                  tone="faint"
                  style={{ width: 18, textAlign: 'center', fontFamily: theme.font.semibold }}
                >
                  {index + 1}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {seller.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {seller.quantityBase} base units · {seller.saleCount} sale
                    {seller.saleCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text variant="moneySmall" style={{ fontFamily: theme.font.semibold }}>
                  {formatMoney(seller.revenue)}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {report && report.lowStock.length > 0 ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Low stock</SectionTitle>
          <Card padded={false}>
            {report.lowStock.slice(0, 8).map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/item/${item.id}`)}
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
                <Ionicons name="alert-circle-outline" size={17} color={theme.colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    reorder at {item.lowStockLevel}
                  </Text>
                </View>
                <Badge label={`${item.stock} left`} tone="warning" />
              </Pressable>
            ))}
          </Card>
        </View>
      ) : null}

      {sales && sales.length > 0 ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Recent sales</SectionTitle>
          <Card padded={false}>
            {sales.map((sale, index) => (
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
                  <Text variant="bodyMedium">
                    #{sale.receiptNo}
                    {sale.customerName ? ` · ${sale.customerName}` : ''}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatDateTime(sale.soldAt)} · {sale.itemCount} line
                    {sale.itemCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text variant="moneySmall" style={{ fontFamily: theme.font.semibold }}>
                  {formatMoney(sale.total)}
                </Text>
              </Pressable>
            ))}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
