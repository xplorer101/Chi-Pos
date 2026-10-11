import React, { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Divider, KeyValueRow, SectionTitle } from '@/components/Section';
import { FormSheet } from '@/components/FormSheet';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { writeBackupFile } from '@/db/export';
import { loadSampleData } from '@/db/seed';
import { getSettings, updateSettings } from '@/db/repositories/settingsRepo';
import { changeOwnPin } from '@/db/repositories/usersRepo';
import { promptBiometrics, setBiometricsEnabled } from '@/features/auth/biometrics';
import { useSessionStore } from '@/features/auth/sessionStore';
import { isValidPin } from '@/lib/pin';
import { roleCaption, roleLabel } from '@/lib/roles';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';

const AUTO_LOCK_OPTIONS = [1, 2, 5, 10, 15, 30].map((minutes) => ({
  value: String(minutes),
  label: `${minutes}m`,
}));

export default function SettingsScreen() {
  const currentUser = useSessionStore((state) => state.currentUser);
  if (!currentUser) return null;
  return <SettingsInner actor={currentUser as ActingUser} />;
}

function SettingsInner({ actor }: { actor: ActingUser }) {
  const theme = useTheme();
  const router = useRouter();
  const biometrics = useSessionStore((state) => state.biometrics);
  const setBiometrics = useSessionStore((state) => state.setBiometrics);

  const isOwner = actor.role === 'owner';

  const { data: settings } = useLiveQuery(() => getSettings(), []);

  const [shopName, setShopName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const [autoLockOpen, setAutoLockOpen] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setShopName(settings.shopName);
    setReceiptFooter(settings.receiptFooter);
    setShopAddress(settings.shopAddress ?? '');
    setShopPhone(settings.shopPhone ?? '');
  }, [settings]);

  const dirty =
    settings != null &&
    (shopName !== settings.shopName ||
      receiptFooter !== settings.receiptFooter ||
      shopAddress !== (settings.shopAddress ?? '') ||
      shopPhone !== (settings.shopPhone ?? ''));

  const saveProfile = async () => {
    if (!shopName.trim()) {
      Alert.alert('Shop name required', 'Give your shop a name so receipts look right.');
      return;
    }
    setSavingProfile(true);
    try {
      await updateSettings({
        shopName: shopName.trim(),
        receiptFooter: receiptFooter.trim(),
        shopAddress: shopAddress.trim(),
        shopPhone: shopPhone.trim(),
      });
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : String(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleBiometrics = async (value: boolean) => {
    try {
      await setBiometricsEnabled(value);
      setBiometrics({ enabled: value });
      if (value) {
        void promptBiometrics();
      }
    } catch {
      Alert.alert('Could not change setting', 'Biometric unlock is unavailable on this device.');
    }
  };

  const loadSamples = () => {
    Alert.alert(
      'Load sample data?',
      'Adds a few example products so you can try selling. You can delete them afterwards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Load samples',
          onPress: () => {
            void (async () => {
              setWorking('samples');
              try {
                const count = await loadSampleData(actor);
                Alert.alert('Done', `${count} sample item${count === 1 ? '' : 's'} added.`);
              } catch (error) {
                Alert.alert('Could not load', error instanceof Error ? error.message : String(error));
              } finally {
                setWorking(null);
              }
            })();
          },
        },
      ],
    );
  };

  const exportBackup = () => {
    void (async () => {
      setWorking('export');
      try {
        const uri = await writeBackupFile();
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/json',
            dialogTitle: 'Export ShopPOS backup',
          });
        } else {
          Alert.alert('Sharing not available', 'This device cannot share files.');
        }
      } catch (error) {
        Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
      } finally {
        setWorking(null);
      }
    })();
  };

  const switchUser = () => {
    Alert.alert('Switch user?', 'You will need the next person\u2019s PIN to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Lock now',
        onPress: () => useSessionStore.getState().lock(),
      },
    ]);
  };

  return (
    <Screen title="Settings" subtitle={settings?.shopName}>
      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>Account</SectionTitle>
        <Card>
          <View style={{ gap: theme.space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
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
                  {actor.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">{actor.name}</Text>
                <Text variant="caption" tone="muted">
                  {roleLabel(actor.role)} · {roleCaption(actor.role)}
                </Text>
              </View>
              <Badge label={roleLabel(actor.role)} tone={isOwner ? 'accent' : 'neutral'} />
            </View>
            <Button
              label="Change my PIN"
              variant="secondary"
              icon="keypad-outline"
              onPress={() => setPinSheetOpen(true)}
            />
            <Button
              label="Switch user"
              variant="outline"
              icon="swap-horizontal"
              onPress={switchUser}
            />
          </View>
        </Card>
      </View>

      {isOwner ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Shop profile</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              <Input label="Shop name" value={shopName} onChangeText={setShopName} placeholder="My Shop" />
              <Input
                label="Receipt footer"
                value={receiptFooter}
                onChangeText={setReceiptFooter}
                placeholder="Thank you for your patronage."
                multiline
              />
              <Input
                label="Shop address (optional)"
                value={shopAddress}
                onChangeText={setShopAddress}
                placeholder="e.g. Market road, Lagos"
                multiline
              />
              <Input
                label="Shop phone (optional)"
                value={shopPhone}
                onChangeText={setShopPhone}
                placeholder="e.g. 0803 123 4567"
                keyboardType="phone-pad"
              />
              <Divider />
              <KeyValueRow label="Business type" value="Provision shop" tone="muted" />
              <KeyValueRow label="Currency" value="Naira (₦)" tone="muted" />
              {dirty ? (
                <Button
                  label="Save profile"
                  onPress={() => void saveProfile()}
                  loading={savingProfile}
                />
              ) : null}
            </View>
          </Card>
        </View>
      ) : null}

      {isOwner ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Staff & security</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              <Button
                label="Manage staff & PIN resets"
                variant="secondary"
                icon="people-outline"
                onPress={() => router.push('/staff')}
              />
              <Button
                label={`Auto-lock: ${settings?.autoLockMinutes ?? 5} minutes`}
                variant="secondary"
                icon="timer-outline"
                onPress={() => setAutoLockOpen(true)}
              />
              <Button
                label="Audit log"
                variant="secondary"
                icon="receipt-outline"
                onPress={() => router.push('/audit-log')}
              />
              <Divider />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">Unlock with fingerprint</Text>
                  <Text variant="caption" tone="muted">
                    {biometrics.available
                      ? 'Fingerprint or face scan instead of typing the PIN.'
                      : 'No fingerprint sensor enrolled on this device.'}
                  </Text>
                </View>
                <Switch
                  value={biometrics.enabled}
                  disabled={!biometrics.available}
                  onValueChange={(value) => void toggleBiometrics(value)}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
                  thumbColor={theme.colors.surface}
                />
              </View>
            </View>
          </Card>
        </View>
      ) : (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Security</SectionTitle>
          <Card>
            <Text variant="caption" tone="muted">
              Forgot your PIN? Ask the owner to reset it from Staff & security.
            </Text>
          </Card>
        </View>
      )}

      {isOwner ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Data</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              <Button
                label="Export backup (JSON)"
                variant="secondary"
                icon="share-outline"
                onPress={exportBackup}
                loading={working === 'export'}
              />
              <Button
                label="Load sample data"
                variant="secondary"
                icon="download-outline"
                onPress={loadSamples}
                loading={working === 'samples'}
              />
              <Text variant="caption" tone="muted">
                Everything is stored on this device only. Nothing is sent anywhere — export a backup
                before you clear the app or change phones.
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>About</SectionTitle>
        <Card>
          <KeyValueRow label="App" value="ShopPOS" tone="muted" />
          <Divider />
          <KeyValueRow label="Version" value={String(Constants.expoConfig?.version ?? '1.0.0')} tone="muted" />
          <Divider />
          <KeyValueRow label="Works" value="Offline" tone="muted" />
        </Card>
      </View>

      {isOwner ? (
        <AutoLockSheet
          visible={autoLockOpen}
          onClose={() => setAutoLockOpen(false)}
          current={settings?.autoLockMinutes ?? 5}
        />
      ) : null}

      <ChangePinSheet visible={pinSheetOpen} onClose={() => setPinSheetOpen(false)} actor={actor} />
    </Screen>
  );
}

function AutoLockSheet({
  visible,
  onClose,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  current: number;
}) {
  const theme = useTheme();
  const [minutes, setMinutes] = useState(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setMinutes(current);
  }, [visible, current]);

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({ autoLockMinutes: minutes });
      useSessionStore.getState().setAutoLockMinutes(minutes);
      onClose();
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Auto-lock"
      subtitle="Lock the app after this much inactivity, and immediately after the app is backgrounded for that long."
      footer={
        <Button label="Save" icon="checkmark" onPress={() => void save()} loading={saving} />
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <ChipRow
          options={AUTO_LOCK_OPTIONS}
          value={String(minutes)}
          onChange={(value) => setMinutes(Number(value))}
        />
      </View>
    </FormSheet>
  );
}

function ChangePinSheet({
  visible,
  onClose,
  actor,
}: {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
}) {
  const theme = useTheme();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setSaving(false);
  }, [visible]);

  const submit = async () => {
    setError(null);
    if (!isValidPin(next)) {
      setError('New PIN must be 4 to 6 digits.');
      return;
    }
    if (next !== confirm) {
      setError('The two new PINs do not match.');
      return;
    }
    setSaving(true);
    try {
      await changeOwnPin(actor, current, next);
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
      title={`Change ${actor.role === 'owner' ? 'owner' : ''} PIN`}
      subtitle="Digits only, 4 to 6 characters"
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button label="Save PIN" onPress={() => void submit()} loading={saving} icon="checkmark" />
        </View>
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <Input
          label="Current PIN"
          value={current}
          onChangeText={setCurrent}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="••••"
        />
        <Input
          label="New PIN"
          value={next}
          onChangeText={setNext}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="••••"
        />
        <Input
          label="Confirm new PIN"
          value={confirm}
          onChangeText={setConfirm}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="••••"
        />
      </View>
    </FormSheet>
  );
}