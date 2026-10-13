import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { EmptyState } from '@/components/EmptyState';
import { QueryErrorState } from '@/components/QueryErrorState';
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
import { can, canViewProfit } from '@/features/auth/permissions';
import { useSessionStore } from '@/features/auth/sessionStore';
import { BackupReminderBanner } from '@/features/backup/BackupReminderBanner';
import { getBackupMeta } from '@/features/backup/backupMeta';
import type { ActingUser } from '@/db/types';
import {
  DAY,
  customRange,
  formatDate,
  formatDateTime,
  formatDayShort,
  periodRange,
  yesterdayRange,
} from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Transfer',
  pos: 'POS',
  credit: 'Credit given',
};

export default function ReportsScreen() {
  const currentUser = useSessionStore((state) => state.currentUser);
  if (!can(currentUser, 'view_reports')) {
    return <Redirect href="/" />;
  }
  return <ReportsInner />;
}

function ReportsInner() {
  const theme = useTheme();
  const router = useRouter();
  const actor = useSessionStore((state) => state.currentUser) as ActingUser;
  const users = useSessionStore((state) => state.users);
  const showStaffFilter = users.length > 0;
  const [staffId, setStaffId] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [customFrom, setCustomFrom] = useState(() => Date.now() - 6 * DAY);
  const [customTo, setCustomTo] = useState(() => Date.now());
  const [costBackfill, setCostBackfill] = useState<number | null>(null);

  const staffChip = useMemo(
    () => [
      { value: 'all', label: 'All staff' },
      ...users.map((user) => ({ value: user.id, label: user.name })),
    ],
    [users],
);

  const range = useMemo(() => {
    switch (period) {
      case 'yesterday':
        return yesterdayRange();
      case 'week':
        return periodRange('week');
      case 'month':
        return periodRange('month');
      case 'custom':
        return customRange(customFrom, customTo);
      case 'today':
      default:
        return periodRange('today');
    }
  }, [period, customFrom, customTo]);

  const { data: report, isLoading, error: reportError, refresh: refreshReport } = useLiveQuery(() => getReport(actor, range.start, range.end, { userId: staffId ?? undefined }), [range.start, range.end, staffId], 'reports');
  const { data: eod, error: eodError, refresh: refreshEod } = useLiveQuery(() => getEndOfDaySummary(actor), [period, staffId], 'reports');
  const { data: sales, error: salesError, refresh: refreshSales } = useLiveQuery(() => listSales(actor, { start: range.start, end: range.end, limit: 15 }), [range.start, range.end], 'reports');
  const { data: backupMeta } = useLiveQuery(
    () => getBackupMeta(),
    [],
    'reports-backup-meta',
  );
  const isOwner = actor.role === 'owner';

  const queryError = reportError ?? eodError ?? salesError;
  const retryQueries = () => {
    refreshReport();
    refreshEod();
    refreshSales();
  };

  useEffect(() => {
    let mounted = true;
    void import('@/db/repositories/auditRepo')
      .then(({ getCostBackfillCount }) => getCostBackfillCount())
      .then((count) => {
        if (mounted && count > 0) setCostBackfill(count);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const showProfit = canViewProfit(actor);
  const profitMargin =
    report && report.totalSales > 0 ? Math.round((report.profit / report.totalSales) * 100) : 0;
  const maxDayTotal = report ? Math.max(...report.daily.map((day) => day.total), 0) : 0;
  const rangeLabel =
    range.start === range.end ? formatDate(range.start) : `${formatDate(range.start)} – ${formatDate(range.end)}`;

  return (
    <Screen title="Reports" subtitle={rangeLabel}>
      <ChipRow options={PERIODS} value={period} onChange={setPeriod} />

      {showStaffFilter && users.length > 1 ? (
        <ChipRow
          options={staffChip}
          value={staffId ?? 'all'}
          onChange={(value) => setStaffId(value === 'all' ? null : value)}
        />
      ) : null}

      {isOwner ? (
        <>
          <BackupReminderBanner
            onBackupNow={() => router.navigate('/settings')}
            onOpenSettings={() => router.navigate('/settings')}
          />
          <Card>
            <KeyValueRow
              label="Last backup"
              value={
                backupMeta?.lastBackupAt == null
                  ? 'Never'
                  : `${formatDate(backupMeta.lastBackupAt)} · every ${backupMeta.reminderDays} days`
              }
              tone="muted"
            />
          </Card>
        </>
      ) : null}

      {costBackfill != null ? (
        <Text variant="caption" tone="warning">
          {costBackfill} sale line{costBackfill === 1 ? '' : 's'} had their cost estimated from the
          current item cost (they were sold before costs were tracked).
        </Text>
      ) : null}

      {period === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
          <RangeField label="From" value={customFrom} onChange={setCustomFrom} />
          <RangeField label="To" value={customTo} onChange={setCustomTo} />
        </View>
      ) : null}

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
          label="Collected (cash + transfer + POS)"
          value={formatMoney(report?.collected.total ?? 0)}
          tone="muted"
        />
        <KeyValueRow
          label="Cash / Transfer / POS"
          value={`${formatMoney(report?.collected.cash ?? 0)} · ${formatMoney(
            report?.collected.transfer ?? 0,
          )} · ${formatMoney(report?.collected.pos ?? 0)}`}
          tone="muted"
        />
        <KeyValueRow
          label="Credit given"
          value={formatMoney(report?.creditGiven ?? 0)}
          tone="warning"
        />
        {showProfit ? (
          <>
            <KeyValueRow
              label="Cost of goods sold"
              value={formatMoney(report?.costOfGoods ?? 0)}
              tone="muted"
            />
            <KeyValueRow
              label={`Profit${profitMargin > 0 ? ` (${profitMargin}%)` : ''}`}
              value={formatMoney(report?.profit ?? 0)}
              tone="success"
            />
          </>
        ) : null}

        {report && !report.reconciliation.ok ? (
          <Text variant="caption" tone="danger" style={{ marginTop: theme.space(2) }}>
            Heads up: collected + credit does not match total sales by{' '}
            {formatMoney(Math.abs(report.reconciliation.difference))}.
          </Text>
        ) : null}
      </Card>

      {queryError ? (
        <QueryErrorState onRetry={retryQueries} />
      ) : !isLoading && (report?.salesCount ?? 0) === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title="Nothing here yet"
          message="Complete a sale and this period will start filling in."
          actionLabel="Go to Sell"
          onAction={() => router.replace('/')}
        />
      ) : null}

      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>Money received on old debts</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space(3) }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="muted">
                Total received
              </Text>
              <Text variant="moneyLarge" tone="success">
                {formatMoney(report?.debtPayments.total ?? 0)}
              </Text>
            </View>
            <Badge
              label={`${report?.debtPayments.count ?? 0} payment${
                report?.debtPayments.count === 1 ? '' : 's'
              }`}
              tone="success"
            />
          </View>
          <Text variant="caption" tone="faint" style={{ marginTop: theme.space(2) }}>
            Counted on the day each payment was received, including backdated ones.
          </Text>
        </Card>
      </View>

      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>Outstanding debt</SectionTitle>
        <Pressable
          onPress={() => router.push({ pathname: '/customers', params: { view: 'owing' } })}
          style={({ pressed }) => ({
            borderRadius: theme.radius.lg,
            backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent',
          })}
        >
          <Card tone="alt">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
              <View style={{ flex: 1 }}>
                <Text variant="label" tone="muted">
                  Owed to you right now
                </Text>
                <Text variant="moneyLarge" tone="warning">
                  {formatMoney(report?.outstandingDebt ?? 0)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text variant="label" tone="accent">
                  Debtors
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
              </View>
            </View>
          </Card>
        </Pressable>
      </View>

      {report && report.daily.length > 0 && maxDayTotal > 0 ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Sales per day</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              {report.daily.map((day) => (
                <View key={day.day} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text variant="caption" tone="muted">
                      {formatDayShort(day.day)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatMoney(day.total)} · {day.count} sale{day.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: theme.colors.surfaceAlt,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        height: '100%',
                        width: `${maxDayTotal > 0 ? Math.round((day.total / maxDayTotal) * 100) : 0}%`,
                        backgroundColor: theme.colors.primary,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </View>
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
          <SectionTitle>Top sellers (by quantity)</SectionTitle>
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
            {report.lowStock.map((item, index) => (
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
                    alert at {item.lowStockLevel}
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
                    {sale.servedByName ? ` · Served by ${sale.servedByName}` : ''}
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

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (ts: number) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ flex: 1, gap: theme.space(2) }}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space(2),
          minHeight: theme.tapTarget,
          paddingHorizontal: theme.space(3),
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
        })}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
        <Text variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>
          {formatDate(value)}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={new Date(value)}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(_event, selected) => {
            setOpen(false);
            if (selected) onChange(selected.getTime());
          }}
        />
      ) : null}
    </View>
);
}
