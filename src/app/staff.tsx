import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { QueryErrorState } from '@/components/QueryErrorState';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/Section';
import { FormSheet } from '@/components/FormSheet';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import {
  adminSetPin,
  createCashier,
  deleteUser,
  listAllUsers,
  renameUser,
  setUserActive,
} from '@/db/repositories/usersRepo';
import { can } from '@/features/auth/permissions';
import { useSessionStore } from '@/features/auth/sessionStore';
import { isValidPin } from '@/lib/pin';
import { roleLabel } from '@/lib/roles';
import { useTheme } from '@/theme/theme';
import type { ActingUser, User } from '@/db/types';

export default function StaffScreen() {
  const currentUser = useSessionStore((state) => state.currentUser);
  if (!can(currentUser, 'manage_staff')) {
    return <Redirect href="/" />;
  }
  return <StaffInner />;
}

function StaffInner() {
  const theme = useTheme();
  const router = useRouter();
  const actor = useSessionStore((state) => state.currentUser) as ActingUser;

  const { data: users, error: usersError, refresh: refreshUsers } = useLiveQuery(() => listAllUsers(), [], 'staff');
  const [addOpen, setAddOpen] = useState(false);
  const [target, setTarget] = useState<User | null>(null);
  const [action, setAction] = useState<'rename' | 'reset' >('rename');

  const confirmDelete = (user: User) => {
    Alert.alert(
      `Delete ${user.name}?`,
      'They can no longer sign in. Their past sales and payments stay on the books.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteUser(actor, user.id).catch((caught) =>
              Alert.alert('Could not delete', caught.message),
            );
          },
        },
      ],
    );
  };

  const openRename = (user: User) => {
    setTarget(user);
    setAction('rename');
  };

  const openReset = (user: User) => {
    setTarget(user);
    setAction('reset');
  };

  return (
    <Screen title="Staff & roles" subtitle="Owner only" onBack={() => router.back()}>
      <View style={{ gap: theme.space(2) }}>
        <SectionTitle
          action={
            <Button label="Add cashier" variant="ghost" size="sm" icon="add" onPress={() => setAddOpen(true)} fullWidth={false} />
          }
        >
          Team
        </SectionTitle>

        <Card padded={false}>
          {usersError ? (
            <QueryErrorState onRetry={refreshUsers} />
          ) : (
            (users ?? []).map((user, index) => (
              <View
                key={user.id}
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
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{user.name}</Text>
                  <Text variant="caption" tone="muted">
                    {roleLabel(user.role)} · {user.isActive ? 'Active' : 'Deactivated'}
                  </Text>
                </View>
                {user.role === 'owner' ? (
                  <Badge label="Owner" tone="accent" />
                ) : (
                  <View style={{ flexDirection: 'row', gap: theme.space(1) }}>
                    <Button label="Rename" variant="outline" size="sm" onPress={() => openRename(user)} fullWidth={false} />
                    <Button label="PIN" variant="outline" size="sm" icon="key-outline" onPress={() => openReset(user)} fullWidth={false} />
                    <Button
                      label={user.isActive ? 'Deactivate' : 'Activate'}
                      variant="outline"
                      size="sm"
                      onPress={() => void setUserActive(actor, user.id, !user.isActive)}
                      fullWidth={false}
                    />
                    <Button label="Delete" variant="danger" size="sm" onPress={() => confirmDelete(user)} fullWidth={false} />
                  </View>
                )}
              </View>
            ))
          )}
        </Card>

        <Text variant="caption" tone="muted">
          Cashiers can sell, record credit and debt payments, manage customers and see their own
          sales. Products, prices, stock, reports, profit, staff and backups are owner-only. Audit
          log records every privileged action.
        </Text>
      </View>

      <AddCashierSheet visible={addOpen} onClose={() => setAddOpen(false)} actor={actor} />
      {target ? (
        action === 'rename' ? (
          <RenameSheet
            visible
            onClose={() => setTarget(null)}
            actor={actor}
            user={target}
          />
        ) : (
          <ResetPinSheet
            visible
            onClose={() => setTarget(null)}
            actor={actor}
            user={target}
          />
        )
      ) : null}
    </Screen>
  );
}

function AddCashierSheet({
  visible,
  onClose,
  actor,
}: {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (!isValidPin(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    setSaving(true);
    try {
      await createCashier(actor, { name, pin });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Add cashier"
      subtitle="Give them a name and a 4 to 6 digit PIN"
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Add cashier" onPress={() => void submit()} loading={saving} icon="checkmark" />
        </View>
      }
    >
      <View style={{ gap: theme.space(3) }}>
        <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Blessing" autoCapitalize="words" />
        <Input
          label="PIN"
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="4 to 6 digits"
        />
      </View>
    </FormSheet>
  );
}

function RenameSheet({
  visible,
  onClose,
  actor,
  user,
}: {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
  user: User;
}) {
  const theme = useTheme();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await renameUser(actor, user.id, name);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={`Rename ${user.name}`}
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Save" onPress={() => void submit()} loading={saving} icon="checkmark" />
        </View>
      }
    >
      <Input label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
    </FormSheet>
  );
}

function ResetPinSheet({
  visible,
  onClose,
  actor,
  user,
}: {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
  user: User;
}) {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (!isValidPin(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    setSaving(true);
    try {
      await adminSetPin(actor, user.id, pin);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title={`Reset ${user.name}'s PIN`}
      subtitle="They will need this next time they sign in"
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Set new PIN" onPress={() => void submit()} loading={saving} icon="key-outline" />
        </View>
      }
    >
      <Input
        label="New PIN"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        placeholder="4 to 6 digits"
      />
    </FormSheet>
  );
}