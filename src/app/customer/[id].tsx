import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { Input, MoneyInput } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { QueryErrorState } from '@/components/QueryErrorState';
import { SectionTitle } from '@/components/Section';
import { FormSheet } from '@/components/FormSheet';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import {
  deleteCustomer,
  getCustomer,
  getCustomerHistory,
} from '@/db/repositories/customersRepo';
import { can } from '@/features/auth/permissions';
import { useSessionStore } from '@/features/auth/sessionStore';
import { submitCustomer, submitCustomerUpdate, submitDebtPayment } from '@/features/net/salesQueue';
import { formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';

export default function CustomerScreen() {
  const currentUser = useSessionStore((state) => state.currentUser);
  if (!can(currentUser, 'manage_customers')) {
    return null;
  }
  return <CustomerScreenInner />;
}

function CustomerScreenInner() {
  const theme = useTheme();
  const router = useRouter();
  const actor = useSessionStore((state) => state.currentUser) as ActingUser;
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = String(id ?? 'new');
  const isNew = customerId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: customer, error: customerError, refresh: refreshCustomer } = useLiveQuery(async () => (isNew ? null : getCustomer(customerId)), [customerId, isNew], 'customer');
  const { data: history, error: historyError, refresh: refreshHistory } = useLiveQuery(async () => (isNew ? [] : getCustomerHistory(customerId)), [customerId, isNew], 'customer');

  useEffect(() => {
    if (!customer) return;
    setName(customer.name);
    setPhone(customer.phone ?? '');
    setNotes(customer.notes ?? '');
    setLoading(false);
  }, [customer]);

  const owed = customer?.owed ?? 0;

  const save = async () => {
    if (!name.trim()) {
      setError('Give the customer a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        await submitCustomer(actor, { name: name.trim(), phone: phone.trim(), notes: notes.trim() });
      } else {
        await submitCustomerUpdate(actor, customerId, {
          name: name.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
        });
      }
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Delete customer?',
      `${name} will be removed. Past sales and payments are kept on the books.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteCustomer(actor, customerId)
              .then(() => router.back())
              .catch((caught) => {
                Alert.alert(
                  'Cannot delete',
                  caught instanceof Error ? caught.message : String(caught),
                );
              });
          },
        },
      ],
    );
  };

  if (customerError) {
    return (
      <Screen title={isNew ? 'New customer' : 'Customer'} onBack={() => router.back()}>
        <QueryErrorState onRetry={refreshCustomer} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen title={isNew ? 'New customer' : 'Customer'} onBack={() => router.back()}>
        <Text tone="muted">Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title={isNew ? 'Add customer' : name || 'Customer'}
      subtitle={
        isNew
          ? 'Keep a record of who you give credit to'
          : phone || 'No phone number'
      }
      onBack={() => router.back()}
      right={
        !isNew && owed > 0 ? <Badge label={`${formatMoney(owed)} owed`} tone="warning" /> : undefined
      }
      footer={
        <View style={{ gap: theme.space(2) }}>
          {!isNew && owed > 0 ? (
            <Button
              label="Record payment received"
              icon="cash-outline"
              onPress={() => setPaymentOpen(true)}
            />
          ) : null}
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
          <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
            {!isNew ? (
              <Button label="Delete" variant="danger" icon="trash-outline" onPress={remove} style={{ flex: 1 }} />
            ) : null}
            <Button
              label={isNew ? 'Add customer' : 'Save changes'}
              onPress={() => void save()}
              loading={saving}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <SectionTitle>Details</SectionTitle>
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Ade Bello" />
        <Input
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 0803 123 4567"
          keyboardType="phone-pad"
        />
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          multiline
        />
      </View>

      {!isNew ? (
        <View style={{ gap: theme.space(3) }}>
          <SectionTitle>Activity</SectionTitle>
          {historyError ? (
            <QueryErrorState onRetry={refreshHistory} />
          ) : !history || history.length === 0 ? (
            <Text variant="body" tone="muted">
              No sales or payments recorded for {name} yet.
            </Text>
          ) : (
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
              }}
            >
              {history.map((entry, index) => (
                <Pressable
                  key={entry.kind === 'sale' ? entry.sale.id : entry.payment.id}
                  onPress={
                    entry.kind === 'sale'
                      ? () => router.push(`/receipt/${entry.sale.id}`)
                      : undefined
                  }
                  disabled={entry.kind !== 'sale'}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space(3),
                    paddingHorizontal: theme.space(3),
                    paddingVertical: theme.space(3),
                    borderTopWidth: index === 0 ? 0 : 1,
                    borderTopColor: theme.colors.border,
                    backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent',
                  })}
                >
                  <Ionicons
                    name={entry.kind === 'sale' ? 'cart-outline' : 'arrow-down-circle-outline'}
                    size={19}
                    color={entry.kind === 'sale' ? theme.colors.textMuted : theme.colors.success}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">
                      {entry.kind === 'sale'
                        ? `Sale #${entry.sale.receiptNo}`
                        : `Payment · ${entry.payment.method}`}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDateTime(entry.at)}
                    </Text>
                  </View>
                  <Text
                    variant="moneySmall"
                    style={{ fontFamily: theme.font.semibold }}
                    tone={entry.kind === 'sale' ? 'default' : 'success'}
                  >
                    {entry.kind === 'sale' ? formatMoney(entry.sale.total) : formatMoney(entry.payment.amount)}
                  </Text>
                  {entry.kind === 'sale' ? (
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textFaint} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {!isNew ? (
        <PaymentSheet
          visible={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          customerId={customerId}
          customerName={name}
          owed={owed}
          actor={actor}
        />
      ) : null}
    </Screen>
  );
}

function PaymentSheet({
  visible,
  onClose,
  customerId,
  customerName,
  owed,
  actor,
}: {
  visible: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  owed: number;
  actor: ActingUser;
}) {
  const theme = useTheme();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<'cash' | 'transfer' | 'pos'>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(owed);
    setMethod('cash');
    setNote('');
    setError(null);
    setDate(new Date());
    setDatePickerOpen(false);
  }, [visible, owed]);

  const submit = async () => {
    if (amount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await submitDebtPayment(actor, {
        customerId,
        amount,
        method,
        note: note.trim() || undefined,
        paidAt: date.getTime(),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const displayDate = date.toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Record payment"
      subtitle={customerName}
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button
            label={`Receive ${formatMoney(amount)} toward the balance`}
            onPress={() => void submit()}
            loading={saving}
            icon="checkmark"
          />
        </View>
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <View
          style={{
            backgroundColor: theme.colors.warningSoft,
            borderRadius: theme.radius.md,
            padding: theme.space(3),
            gap: 4,
          }}
        >
          <Text variant="label" tone="warning">
            Current balance
          </Text>
          <Text variant="moneyLarge" style={{ color: theme.colors.warning }}>
            {formatMoney(owed)}
          </Text>
        </View>

        <MoneyInput label="Amount received" value={amount} onChangeKobo={setAmount} preview />

        <View style={{ gap: theme.space(2) }}>
          <Text variant="label" tone="muted">
            Paid by
          </Text>
          <ChipRow
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'pos', label: 'POS' },
            ]}
            value={method}
            onChange={setMethod}
          />
        </View>

        <View style={{ gap: theme.space(2) }}>
          <Text variant="label" tone="muted">
            Received on
          </Text>
          <Pressable
            onPress={() => setDatePickerOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space(3),
              minHeight: theme.tapTarget,
              paddingHorizontal: theme.space(3),
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
            })}
          >
            <Ionicons name="calendar-outline" size={19} color={theme.colors.textMuted} />
            <Text variant="bodyMedium" style={{ flex: 1 }}>
              {displayDate}
            </Text>
            <Ionicons name="chevron-down" size={18} color={theme.colors.textFaint} />
          </Pressable>
        </View>

        {datePickerOpen ? (
          <DateTimePicker
            value={date}
            mode="datetime"
            display="default"
            onChange={(_event, selected) => {
              setDatePickerOpen(false);
              if (selected) setDate(selected);
            }}
          />
        ) : null}

        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. part payment" />
      </View>
    </FormSheet>
  );
}
