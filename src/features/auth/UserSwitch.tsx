import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Text } from '@/components/Text';
import { authenticate, recoverOwnerPin } from '@/db/repositories/usersRepo';
import { promptBiometrics } from '@/features/auth/biometrics';
import { attemptsBeforeLock, remainingLockMs } from '@/lib/lockout';
import { isValidPin } from '@/lib/pin';
import { roleLabel } from '@/lib/roles';
import { useTheme } from '@/theme/theme';
import type { User } from '@/db/types';

import { useSessionStore } from './sessionStore';

type Mode = 'pick' | 'pin' | 'recover';

/** Quick user switch + PIN gate shown whenever the app is locked. */
export function UserSwitch({ shopName }: { shopName?: string }) {
  const theme = useTheme();
  const users = useSessionStore((state) => state.users);
  const biometrics = useSessionStore((state) => state.biometrics);

  const [mode, setMode] = useState<Mode>('pick');
  const [selected, setSelected] = useState<User | null>(null);
  const [recoverFor, setRecoverFor] = useState<User | null>(null);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        padding: theme.space(5),
        flexGrow: 1,
        justifyContent: 'center',
        gap: theme.space(4),
      }}
      keyboardShouldPersistTaps="handled"
    >
      {mode === 'pick' ? (
        <>
          {shopName ? (
            <Text variant="caption" tone="muted">
              {shopName}
            </Text>
          ) : null}
          <PickUser
          users={users}
          onPick={(user) => {
            setSelected(user);
            setMode('pin');
          }}
          onRecover={(user) => {
            setRecoverFor(user);
            setMode('recover');
          }}
          biometrics={biometrics}
        />
        </>
      ) : mode === 'pin' && selected ? (
        <PinEntry
          user={selected}
          onBack={() => setMode('pick')}
          onRecover={() => {
            setRecoverFor(selected);
            setMode('recover');
          }}
        />
      ) : mode === 'recover' && recoverFor ? (
        <Recover owner={recoverFor} onBack={() => setMode('pick')} />
      ) : null}
    </ScrollView>
  );
}

function PickUser({
  users,
  onPick,
  onRecover,
  biometrics,
}: {
  users: User[];
  onPick: (user: User) => void;
  onRecover: (user: User) => void;
  biometrics: { available: boolean; enabled: boolean };
}) {
  const theme = useTheme();

  return (
    <>
      <Text variant="heading">Who is serving?</Text>
      <Text variant="body" tone="muted">
        Pick your name to get back to work.
      </Text>

      <Card>
        <View style={{ gap: theme.space(1) }}>
          {users.length === 0 ? (
            <Text variant="body" tone="muted">
              No active staff yet.
            </Text>
          ) : (
            users.map((user) => (
              <Pressable
                key={user.id}
                onPress={() => void onPick(user)}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space(3),
                    paddingVertical: theme.space(3),
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <View
                  style={{
                    width: theme.space(8),
                    height: theme.space(8),
                    borderRadius: theme.space(4),
                    backgroundColor: theme.colors.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="title" tone="accent">
                    {user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{user.name}</Text>
                  <Text variant="caption" tone="muted">
                    {roleLabel(user.role)}
                  </Text>
                </View>
                <Badge label={user.role === 'owner' ? 'Owner' : 'Cashier'} tone="neutral" />
              </Pressable>
            ))
          )}
        </View>
      </Card>

      {users.some((user) => user.role === 'owner') ? (
        <Button
          label="Forgot owner PIN?"
          variant="ghost"
          icon="help-circle-outline"
          onPress={() => {
            const owner = users.find((user) => user.role === 'owner');
            if (owner) onRecover(owner);
          }}
        />
      ) : null}

      {biometrics.available && biometrics.enabled ? (
        <Button
          label="Unlock with fingerprint"
          variant="secondary"
          icon="finger-print"
          onPress={() => {
            void promptBiometrics().then((ok) => {
              const owner = users.find((user) => user.role === 'owner');
              if (ok && owner) useSessionStore.getState().unlock(owner);
            });
          }}
        />
      ) : null}
    </>
  );
}

function PinEntry({
  user,
  onBack,
  onRecover,
}: {
  user: User;
  onBack: () => void;
  onRecover: () => void;
}) {
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lockedFor, setLockedFor] = useState<number>(0);

  const locked = lockedFor > 0;
  const attemptsLeft = useMemo(
    () => attemptsBeforeLock(user.failedAttempts),
    [user.failedAttempts],
  );

  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setInterval(() => setLockedFor((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [lockedFor]);

  const submit = async () => {
    setError(null);
    if (!isValidPin(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    setChecking(true);
    try {
      const result = await authenticate(user.id, pin);
      if (result.ok) {
        useSessionStore.getState().unlock(result.user);
        return;
      }
      if (result.reason === 'locked') {
        setLockedFor(Math.ceil(remainingLockMs(result.lockedUntil, Date.now()) / 1000));
        setPin('');
      } else if (result.reason === 'incorrect') {
        const left = attemptsBeforeLock(result.failedAttempts);
        setError(
          left > 0
            ? `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} before a short lock.`
            : `Too many wrong attempts. \u231b Wait for the lock to expire.`,
        );
        setPin('');
      } else {
        setError('This account is not active.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Button label="← Back" variant="ghost" icon="arrow-back" onPress={onBack} />
      <Text variant="heading">Welcome back, {user.name}</Text>
      <Text variant="body" tone="muted">
        Enter your {user.role === 'owner' ? 'owner' : 'cashier'} PIN
      </Text>

      <Card>
        <View style={{ gap: theme.space(3) }}>
          <Input
            label="PIN"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="••••"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            editable={!locked}
          />
          {locked ? (
            <Text variant="label" tone="danger">
              Too many attempts. Try again in {lockedFor}s.
            </Text>
          ) : error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : (
            <Text variant="caption" tone="muted">
              {attemptsLeft} wrong attempt{attemptsLeft === 1 ? '' : 's'} before a lock kicks in.
            </Text>
          )}
          <Button
            label="Unlock"
            icon="lock-open-outline"
            onPress={() => void submit()}
            loading={checking}
            disabled={locked}
          />
        </View>
      </Card>

      {user.role === 'owner' ? (
        <Button label="Forgot your PIN? Recover" variant="ghost" onPress={onRecover} icon="key-outline" />
      ) : (
        <Text variant="caption" tone="muted" center>
          Forgot your PIN? Ask the owner to reset it.
        </Text>
      )}
    </>
  );
}

function Recover({ owner, onBack }: { owner: User; onBack: () => void }) {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nextCode, setNextCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async () => {
    setError(null);
    const trimmed = code.trim();
    if (trimmed.length < 8) {
      setError('Enter the full recovery code.');
      return;
    }
    if (!isValidPin(newPin)) {
      setError('New PIN must be 4 to 6 digits.');
      return;
    }
    if (newPin !== confirm) {
      setError('The two new PINs do not match.');
      return;
    }
    setWorking(true);
    try {
      const result = await recoverOwnerPin(trimmed, newPin);
      setNextCode(result.recoveryCode);
      setNewPin('');
      setConfirm('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setWorking(false);
    }
  };

  if (nextCode) {
    return (
      <>
        <Button label="← Back" variant="ghost" icon="arrow-back" onPress={onBack} />
        <Text variant="heading">PIN changed</Text>
        <Text variant="body" tone="muted">
          Sign in with your new PIN now, and write down this fresh recovery code in case it happens again.
        </Text>
        <Card>
          <Text variant="title" center selectable style={{ letterSpacing: 2 }}>
            {nextCode}
          </Text>
        </Card>
        <Button label="Back to user list" icon="checkmark" onPress={onBack} />
      </>
    );
  }

  return (
    <>
      <Button label="← Back" variant="ghost" icon="arrow-back" onPress={onBack} />
      <Text variant="heading">Recover owner access</Text>
      <Text variant="body" tone="muted">
        Enter the recovery code you wrote down during setup to set a new owner PIN.
      </Text>

      <Card>
        <View style={{ gap: theme.space(3) }}>
          <Input
            label="Recovery code"
            value={code}
            onChangeText={setCode}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
          />
          <Input
            label="New PIN"
            value={newPin}
            onChangeText={setNewPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="4 to 6 digits"
          />
          <Input
            label="Confirm new PIN"
            value={confirm}
            onChangeText={setConfirm}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="Repeat the PIN"
          />
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Reset PIN" icon="key-outline" onPress={() => void submit()} loading={working} />
        </View>
      </Card>
    </>
  );
}