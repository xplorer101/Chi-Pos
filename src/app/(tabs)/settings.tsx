import React, { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import * as Sharing from 'expo-sharing';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Divider, KeyValueRow, SectionTitle } from '@/components/Section';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { writeBackupFile } from '@/db/export';
import { loadSampleData } from '@/db/seed';
import { getSettings, setOwnerPin, updateSettings } from '@/db/repositories/settingsRepo';
import { useAuthStore } from '@/features/auth/authStore';
import { setBiometricsEnabled } from '@/features/auth/biometrics';
import { isValidPin, verifyPin } from '@/lib/pin';
import { useTheme } from '@/theme/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const pinHash = useAuthStore((state) => state.pinHash);
  const biometrics = useAuthStore((state) => state.biometrics);

  const { data: settings } = useLiveQuery(() => getSettings(), []);

  const [shopName, setShopName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
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

  const removePin = () => {
    Alert.alert('Remove PIN?', 'Anyone with this phone will be able to open the app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove PIN',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const updated = await setOwnerPin(null);
            useAuthStore.setState({ pinHash: updated.ownerPinHash });
            if (biometrics.enabled) await setBiometricsEnabled(false);
            useAuthStore.setState({ biometrics: { available: biometrics.available, enabled: false } });
          })();
        },
      },
    ]);
  };

  const toggleBiometrics = async (value: boolean) => {
    try {
      await setBiometricsEnabled(value);
      useAuthStore.setState({
        biometrics: { available: biometrics.available, enabled: value },
      });
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
                const count = await loadSampleData();
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

  return (
    <Screen title="Settings" subtitle={settings?.shopName}>
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

      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>Security</SectionTitle>
        <Card>
          <View style={{ gap: theme.space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">
                  {pinHash ? 'Change app PIN' : 'Protect the app with a PIN'}
                </Text>
                <Text variant="caption" tone="muted">
                  {pinHash ? 'Required to open the app.' : 'Ask for a 4 to 6 digit PIN on launch.'}
                </Text>
              </View>
              {pinHash ? <Badge label="On" tone="success" /> : <Badge label="Off" tone="neutral" />}
            </View>

            <Button
              label={pinHash ? 'Change PIN' : 'Set a PIN'}
              variant="secondary"
              icon="keypad-outline"
              onPress={() => setPinSheetOpen(true)}
            />

            {pinHash ? (
              <Button label="Remove PIN" variant="outline" onPress={removePin} />
            ) : null}

            <Divider />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">Unlock with fingerprint</Text>
                <Text variant="caption" tone="muted">
                  {biometrics.available
                    ? pinHash
                      ? 'Fingerprint or face scan instead of typing the PIN.'
                      : 'Set a PIN first — the PIN is the fallback.'
                    : 'No fingerprint sensor enrolled on this device.'}
                </Text>
              </View>
              <Switch
                value={biometrics.enabled}
                disabled={!biometrics.available || !pinHash}
                onValueChange={(value) => void toggleBiometrics(value)}
                trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
                thumbColor={theme.colors.surface}
              />
            </View>
          </View>
        </Card>
      </View>

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

      <PinSheet
        visible={pinSheetOpen}
        onClose={() => setPinSheetOpen(false)}
        hasPin={pinHash !== null}
        currentHash={pinHash}
      />
    </Screen>
  );
}

function PinSheet({
  visible,
  onClose,
  hasPin,
  currentHash,
}: {
  visible: boolean;
  onClose: () => void;
  hasPin: boolean;
  currentHash: string | null;
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
    if (hasPin && !(await verifyPin(current, currentHash))) {
      setError('Current PIN is not correct.');
      return;
    }
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
      const updated = await setOwnerPin(next);
      useAuthStore.setState({ pinHash: updated.ownerPinHash });
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
      onClose={onClose}
      title={hasPin ? 'Change PIN' : 'Set a PIN'}
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
        {hasPin ? (
          <Input
            label="Current PIN"
            value={current}
            onChangeText={setCurrent}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="••••"
          />
        ) : null}
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
    </Sheet>
  );
}
