import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { EmptyState } from '@/components/EmptyState';
import { useLiveQuery } from '@/db/hooks';
import { createCustomer, listCustomers } from '@/db/repositories/customersRepo';
import { useSessionStore } from '@/features/auth/sessionStore';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedId: string | null;
  onSelect: (id: string | null, name: string | null) => void;
};

export function CustomerPickerSheet({ visible, onClose, selectedId, onSelect }: Props) {
  const theme = useTheme();
  const actor = useSessionStore((state) => state.currentUser) as ActingUser;
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: customers } = useLiveQuery(
    () => listCustomers({ search }),
    [search, visible ? 'open' : 'closed'],
  );

  const reset = () => {
    setShowNew(false);
    setNewName('');
    setNewPhone('');
    setError(null);
  };

  const saveNew = async () => {
    if (!newName.trim()) {
      setError('Enter the customer name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const customer = await createCustomer(actor, { name: newName, phone: newPhone });
      onSelect(customer.id, customer.name);
      reset();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Choose customer"
      subtitle="Credit sales must be assigned to a customer"
      footer={
        <View style={{ gap: theme.space(2) }}>
          {showNew ? (
            <>
              <Input
                label="Name"
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Adaeze Okonkwo"
                error={error}
                autoCapitalize="words"
              />
              <Input
                label="Phone (optional)"
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="0803 000 0000"
                keyboardType="phone-pad"
              />
              <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
                <Button label="Cancel" variant="secondary" onPress={reset} fullWidth={false} style={{ flex: 1 }} />
                <Button label="Save customer" onPress={() => void saveNew()} loading={saving} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <Button
              label="New customer"
              variant="secondary"
              icon="person-add-outline"
              onPress={() => setShowNew(true)}
            />
          )}
        </View>
      }
    >
      {!showNew ? (
        <View style={{ gap: theme.space(3) }}>
          <Input
            placeholder="Search name or phone"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />

          <Pressable
            onPress={() => {
              onSelect(null, null);
              onClose();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space(3),
              minHeight: theme.tapTarget,
              paddingHorizontal: theme.space(3),
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: selectedId === null ? theme.colors.primary : theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
            })}
          >
            <Ionicons name="walk-outline" size={20} color={theme.colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">Walk-in customer</Text>
              <Text variant="caption" tone="muted">
                No name recorded on the receipt
              </Text>
            </View>
            {selectedId === null ? (
              <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent} />
            ) : null}
          </Pressable>

          {customers && customers.length === 0 && !search ? (
            <EmptyState
              icon="people-outline"
              title="No customers yet"
              message="Add customers to sell on credit and track who owes you."
            />
          ) : (
            <View style={{ gap: theme.space(2) }}>
              {(customers ?? []).map((customer) => {
                const selected = customer.id === selectedId;
                return (
                  <Pressable
                    key={customer.id}
                    onPress={() => {
                      onSelect(customer.id, customer.name);
                      onClose();
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.space(3),
                      minHeight: theme.tapTarget,
                      paddingHorizontal: theme.space(3),
                      borderRadius: theme.radius.md,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
                    })}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: theme.colors.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text variant="label" tone="accent" style={{ fontFamily: theme.font.semibold }}>
                        {customer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {customer.name}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {customer.phone || 'No phone'}
                      </Text>
                    </View>
                    {customer.owed > 0 ? (
                      <Text variant="label" tone="danger" style={{ fontFamily: theme.font.semibold }}>
                        {formatMoney(customer.owed)}
                      </Text>
                    ) : null}
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.colors.accent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}
