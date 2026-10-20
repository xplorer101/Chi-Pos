import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { MoneyInput } from '@/components/Input';
import { KeyValueRow } from '@/components/Section';
import { FormSheet } from '@/components/FormSheet';
import { Text } from '@/components/Text';
import { SaleError } from '@/db/repositories/salesRepo';
import { useSessionStore } from '@/features/auth/sessionStore';
import { submitSale } from '@/features/net/salesQueue';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';

import { cartTotals, validatePaymentSplit, type CartLine as TotalsLine } from './cart';
import {
  buildPayments,
  useSellStore,
  type PartMethod,
  type PaymentMode,
  type SplitAmounts,
} from './sellStore';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCompleted: (saleId: string) => void;
  onPickCustomer: () => void;
};

const MODES: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'pos', label: 'POS' },
  { value: 'credit', label: 'Credit' },
  { value: 'part', label: 'Part payment' },
  { value: 'split', label: 'Split' },
];

const PART_METHODS: { value: PartMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'pos', label: 'POS' },
];

const SPLIT_FIELDS: { key: keyof SplitAmounts; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'pos', label: 'POS' },
  { key: 'credit', label: 'Credit' },
];

export function CheckoutSheet({ visible, onClose, onCompleted, onPickCustomer }: Props) {
  const theme = useTheme();
  const actor = useSessionStore((state) => state.currentUser) as ActingUser;
  const lines = useSellStore((state) => state.lines);
  const discount = useSellStore((state) => state.discount);
  const customerId = useSellStore((state) => state.customerId);
  const customerName = useSellStore((state) => state.customerName);
  const paymentMode = useSellStore((state) => state.paymentMode);
  const split = useSellStore((state) => state.split);
  const partPaidNow = useSellStore((state) => state.partPaidNow);
  const partMethod = useSellStore((state) => state.partMethod);
  const setDiscount = useSellStore((state) => state.setDiscount);
  const setPaymentMode = useSellStore((state) => state.setPaymentMode);
  const setSplitAmount = useSellStore((state) => state.setSplitAmount);
  const setPartPaidNow = useSellStore((state) => state.setPartPaidNow);
  const setPartMethod = useSellStore((state) => state.setPartMethod);
  const clearCart = useSellStore((state) => state.clear);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(
    () => cartTotals(lines as TotalsLine[], discount),
    [lines, discount],
  );

  const payments = useMemo(
    () => buildPayments({ paymentMode, split, partPaidNow, partMethod }, totals.total),
    [paymentMode, split, partPaidNow, partMethod, totals.total],
  );

  const validation = validatePaymentSplit(payments, totals.total, Boolean(customerId));
  const owed = payments
    .filter((payment) => payment.method === 'credit')
    .reduce((sum, payment) => sum + payment.amount, 0);

  const stockWarnings = lines
    .filter((line) => line.tracksStock)
    .map((line) => ({ line, projected: line.stock - line.quantity * line.unitsPerBase }))
    .filter((entry) => entry.projected < 0);

  const canSubmit = validation.ok && stockWarnings.length === 0 && !submitting;

  const complete = async () => {
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const sale = await submitSale(actor, {
        customerId,
        discount: totals.discount,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          unitId: line.unitId,
          quantity: line.quantity,
        })),
        payments,
      });
      clearCart();
      onCompleted(sale.id);
    } catch (caught) {
      const message =
        caught instanceof SaleError || caught instanceof Error
          ? caught.message
          : 'Could not complete the sale.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Checkout"
      subtitle={`${lines.length} item${lines.length === 1 ? '' : 's'} in this sale`}
      dismissable={!submitting}
      footer={
        <View style={{ gap: theme.space(3) }}>
          {error ? (
            <View
              style={{
                backgroundColor: theme.colors.dangerSoft,
                borderRadius: theme.radius.sm,
                padding: 10,
              }}
            >
              <Text variant="label" tone="danger">
                {error}
              </Text>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="body" tone="muted">
              Total to pay
            </Text>
            <Text variant="moneyLarge" style={{ fontFamily: theme.font.bold }}>
              {formatMoney(totals.total)}
            </Text>
          </View>
          <Button
            label={`Complete sale · ${formatMoney(totals.total)}`}
            onPress={() => void complete()}
            disabled={!canSubmit}
            loading={submitting}
            size="lg"
          />
          {!validation.ok ? (
            <Text variant="caption" tone="warning" center>
              {validation.error}
            </Text>
          ) : stockWarnings.length > 0 ? (
            <Text variant="caption" tone="warning" center>
              Restock or lower a quantity before completing this sale.
            </Text>
          ) : null}
        </View>
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <View
          style={{
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.md,
            padding: theme.space(3),
            gap: 2,
          }}
        >
          <KeyValueRow label="Subtotal" value={formatMoney(totals.subtotal)} />
          <MoneyInput label="Discount" value={totals.discount} onChangeKobo={setDiscount} preview />
          <KeyValueRow label="Total" value={formatMoney(totals.total)} emphasise />
        </View>

        <View style={{ gap: theme.space(2) }}>
          <Text variant="label" tone="muted">
            Customer
          </Text>
          <Pressable
            onPress={onPickCustomer}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space(3),
              minHeight: theme.tapTarget,
              paddingHorizontal: theme.space(3),
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: owed > 0 && !customerId ? theme.colors.danger : theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
            })}
          >
            <Ionicons name="person-outline" size={19} color={theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">{customerName ?? 'Walk-in customer'}</Text>
              <Text variant="caption" tone="muted">
                {customerId ? 'Tap to change' : 'Required for credit sales'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} />
          </Pressable>
        </View>

        <View style={{ gap: theme.space(2) }}>
          <Text variant="label" tone="muted">
            Payment method
          </Text>
          <ChipRow
            options={MODES}
            value={paymentMode}
            onChange={(mode) => setPaymentMode(mode, totals.total)}
          />

          {paymentMode === 'split' ? (
            <View style={{ gap: theme.space(2), marginTop: theme.space(2) }}>
              {SPLIT_FIELDS.map((field) => (
                <MoneyInput
                  key={field.key}
                  label={field.label}
                  value={split[field.key]}
                  onChangeKobo={(value) => setSplitAmount(field.key, value)}
                />
              ))}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  backgroundColor: theme.colors.surfaceAlt,
                  borderRadius: theme.radius.sm,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text variant="label" tone="muted">
                  Remaining
                </Text>
                <Text variant="label" style={{ fontFamily: theme.font.semibold }}>
                  {formatMoney(
                    totals.total - payments.reduce((sum, payment) => sum + payment.amount, 0),
                  )}
                </Text>
              </View>
            </View>
          ) : null}

          {paymentMode === 'part' ? (
            <View style={{ gap: theme.space(3), marginTop: theme.space(2) }}>
              <View style={{ gap: theme.space(2) }}>
                <Text variant="label" tone="muted">
                  Paid by
                </Text>
                <ChipRow options={PART_METHODS} value={partMethod} onChange={(value) => setPartMethod(value)} />
              </View>

              <MoneyInput
                label="Amount paid now"
                value={partPaidNow}
                onChangeKobo={setPartPaidNow}
                placeholder="0"
                preview
              />

              <View
                style={{
                  backgroundColor: theme.colors.warningSoft,
                  borderRadius: theme.radius.sm,
                  padding: 10,
                  gap: 2,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label" tone="warning">
                    Total to pay
                  </Text>
                  <Text variant="label" tone="warning" style={{ fontFamily: theme.font.semibold }}>
                    {formatMoney(totals.total)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label" tone="muted">
                    Paid now
                  </Text>
                  <Text variant="label" style={{ fontFamily: theme.font.semibold }}>
                    {formatMoney(Math.min(partPaidNow, totals.total))}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.warningSoft,
                    paddingTop: 6,
                    marginTop: 2,
                  }}
                >
                  <Text variant="label" tone="warning">
                    Balance on credit
                  </Text>
                  <Text variant="label" tone="warning" style={{ fontFamily: theme.font.semibold }}>
                    {formatMoney(Math.max(0, totals.total - partPaidNow))}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {owed > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: theme.colors.warningSoft,
                borderRadius: theme.radius.sm,
                padding: 10,
              }}
            >
              <Ionicons name="alert-circle-outline" size={16} color={theme.colors.warning} />
              <Text variant="label" tone="warning" style={{ flex: 1 }}>
                {customerId
                  ? `${customerName ?? 'Customer'} will owe ${formatMoney(owed)} after this sale.`
                  : 'Choose a customer before taking credit.'}
              </Text>
            </View>
          ) : null}
        </View>

        {stockWarnings.length > 0 ? (
          <View
            style={{
              gap: 6,
              backgroundColor: theme.colors.warningSoft,
              borderRadius: theme.radius.md,
              padding: theme.space(3),
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="warning-outline" size={16} color={theme.colors.warning} />
              <Text variant="label" tone="warning">
                Stock will go negative
              </Text>
            </View>
            {stockWarnings.map((entry) => (
              <Text key={entry.line.key} variant="caption" tone="warning">
                {entry.line.itemName}: {entry.line.stock} in stock, selling{' '}
                {entry.line.quantity * entry.line.unitsPerBase} → {entry.projected}
              </Text>
            ))}
            <Text variant="caption" tone="muted">
              Tracked items cannot go below zero. Restock or lower a quantity.
            </Text>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            gap: theme.space(2),
            flexWrap: 'wrap',
          }}
        >
          {payments.map((payment) => (
            <Badge
              key={payment.method}
              label={`${payment.method.charAt(0).toUpperCase()}${payment.method.slice(1)} ${formatMoney(payment.amount)}`}
              tone="accent"
            />
          ))}
        </View>
      </View>
    </FormSheet>
  );
}
