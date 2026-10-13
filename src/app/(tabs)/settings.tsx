import React, { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipRow } from '@/components/ChipRow';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { QueryErrorState } from '@/components/QueryErrorState';
import { Divider, KeyValueRow, SectionTitle } from '@/components/Section';
import { FormSheet } from '@/components/FormSheet';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { loadSampleData } from '@/db/seed';
import { getSettings, updateSettings } from '@/db/repositories/settingsRepo';
import { changeOwnPin } from '@/db/repositories/usersRepo';
import { promptBiometrics, setBiometricsEnabled } from '@/features/auth/biometrics';
import { useSessionStore } from '@/features/auth/sessionStore';
import { StatusChip, statusLabel } from '@/features/net/StatusChip';
import { useClientStore } from '@/features/net/clientStore';
import { deviceModeCaption, deviceModeLabel, setDeviceMode } from '@/features/net/deviceMode';
import { BackupReminderBanner } from '@/features/backup/BackupReminderBanner';
import { ExportBackupSheet } from '@/features/backup/ExportBackupSheet';
import { RestoreBackupModal } from '@/features/backup/RestoreBackupModal';
import { SafetyCopiesSheet } from '@/features/backup/SafetyCopiesSheet';
import { getBackupMeta, setBackupReminderDays } from '@/features/backup/backupMeta';
import { formatDateTime } from '@/lib/dates';
import { isValidPin } from '@/lib/pin';
import { roleCaption, roleLabel } from '@/lib/roles';
import { useTheme } from '@/theme/theme';
import type { ActingUser, DeviceMode } from '@/db/types';

const DEVICE_MODE_OPTIONS = [
  { value: 'standalone', label: 'Standalone' },
  { value: 'admin', label: 'Admin host' },
  { value: 'cashier', label: 'Cashier' },
];

const AUTO_LOCK_OPTIONS = [1, 2, 5, 10, 15, 30].map((minutes) => ({
  value: String(minutes),
  label: `${minutes}m`,
}));

const REMINDER_OPTIONS = [1, 3, 7, 14, 30].map((days) => ({
  value: String(days),
  label: `${days} days`,
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

  const { data: settings, error: settingsError, refresh: refreshSettings } = useLiveQuery(() => getSettings(), [], 'settings');

  const [shopName, setShopName] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const [autoLockOpen, setAutoLockOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [working, setWorking] = useState<string | null>(null);

  const { data: backupMeta, refresh: refreshBackupMeta } = useLiveQuery(
    () => getBackupMeta(),
    [],
    'backup-meta',
  );

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

  const switchUser = () => {
    Alert.alert('Switch user?', 'You will need the next person\u2019s PIN to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Lock now',
        onPress: () => useSessionStore.getState().lock(),
      },
    ]);
  };

  if (settingsError) {
    return (
      <Screen title="Settings" subtitle={settings?.shopName}>
        <QueryErrorState onRetry={refreshSettings} />
      </Screen>
    );
  }

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
          <SectionTitle>Multi-device</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              <KeyValueRow label="Device mode" value={deviceModeLabel(settings?.deviceMode ?? 'standalone')} />
              <Text variant="caption" tone="muted">
                {deviceModeCaption(settings?.deviceMode ?? 'standalone')}
              </Text>
              <Button
                label="Change device mode"
                variant="secondary"
                icon="git-branch-outline"
                onPress={() => setModeOpen(true)}
              />
              {settings?.deviceMode === 'admin' ? (
                <Button
                  label="Open admin host"
                  icon="wifi-outline"
                  onPress={() => router.push('/host')}
                />
              ) : null}
              {settings?.deviceMode === 'cashier' ? (
                <Button
                  label="Open pairing screen"
                  icon="link-outline"
                  onPress={() => router.push('/connect')}
                />
              ) : null}
              <Text variant="caption" tone="muted">
                Multi-device runs entirely on your local Wi-Fi. No internet or cloud is involved.
              </Text>
            </View>
          </Card>
        </View>
      ) : null}

      {settings?.deviceMode === 'cashier' ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Admin connection</SectionTitle>
          <AdminConnectionCard />
        </View>
      ) : null}

      {isOwner ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Backup & restore</SectionTitle>
          <BackupReminderBanner onBackupNow={() => setBackupSheetOpen(true)} />
          <Card>
            <View style={{ gap: theme.space(3) }}>
              {backupMeta ? (
                <>
                  <KeyValueRow
                    label="Last backup"
                    value={
                      backupMeta.lastBackupAt == null
                        ? 'Never'
                        : formatDateTime(backupMeta.lastBackupAt)
                    }
                    tone="muted"
                  />
                  <Divider />
                </>
              ) : null}
              <Button
                label="Back up now"
                icon="share-outline"
                onPress={() => setBackupSheetOpen(true)}
              />
              <Button
                label="Restore a backup"
                variant="secondary"
                icon="cloud-download-outline"
                onPress={() => setRestoreOpen(true)}
              />
              <Button
                label="Safety copies"
                variant="secondary"
                icon="time-outline"
                onPress={() => setSafetyOpen(true)}
              />
              <Button
                label={`Remind me every ${backupMeta?.reminderDays ?? 7} days`}
                variant="secondary"
                icon="alarm-outline"
                onPress={() => setReminderOpen(true)}
              />
              <Divider />
              <Button
                label="Load sample data"
                variant="secondary"
                icon="download-outline"
                onPress={loadSamples}
                loading={working === 'samples'}
              />
              <Text variant="caption" tone="muted">
                Everything is stored on this device only. Nothing is sent anywhere. Export a backup
                before you clear the app or change phones, and keep it somewhere safe.
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

      {isOwner ? (
        <ExportBackupSheet
          visible={backupSheetOpen}
          onClose={() => setBackupSheetOpen(false)}
          actor={actor}
          onExported={() => {
            refreshBackupMeta();
          }}
        />
      ) : null}

      {isOwner ? (
        <RestoreBackupModal
          visible={restoreOpen}
          onClose={() => setRestoreOpen(false)}
          actor={actor}
        />
      ) : null}

      {isOwner ? (
        <SafetyCopiesSheet
          visible={safetyOpen}
          onClose={() => setSafetyOpen(false)}
          actor={actor}
        />
      ) : null}

      {isOwner ? (
        <ReminderSheet
          visible={reminderOpen}
          onClose={() => setReminderOpen(false)}
          current={backupMeta?.reminderDays ?? 7}
        />
      ) : null}

      {isOwner ? (
        <DeviceModeSheet
          visible={modeOpen}
          onClose={() => setModeOpen(false)}
          current={settings?.deviceMode ?? 'standalone'}
        />
      ) : null}

      <ChangePinSheet visible={pinSheetOpen} onClose={() => setPinSheetOpen(false)} actor={actor} />
    </Screen>
  );
}

function AdminConnectionCard() {
  const theme = useTheme();
  const router = useRouter();
  const status = useClientStore((state) => state.status);
  const pairing = useClientStore((state) => state.pairing);
  const shopName = useClientStore((state) => state.shopName);
  const syncing = useClientStore((state) => state.syncing);
  const syncError = useClientStore((state) => state.syncError);
  const catalogSyncedAt = useClientStore((state) => state.catalogSyncedAt);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void useClientStore.getState().load();
  }, []);

  const lastSynced = catalogSyncedAt
    ? `Items synced ${formatDateTime(catalogSyncedAt)}`
    : 'Items have not been synced yet';

  return (
    <Card>
      <View style={{ gap: theme.space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">{shopName ?? 'Admin phone'}</Text>
            <Text variant="caption" tone="muted">
              {pairing ? `${pairing.host}:${pairing.port}` : 'No admin phone paired yet'}
            </Text>
          </View>
          <StatusChip status={status} />
        </View>
        <Text variant="caption" tone="muted">
          {statusLabel(status)}
          {pairing ? ` · selling as ${pairing.userName}` : ''}
        </Text>
        {pairing ? (
          <>
            <Divider />
            <KeyValueRow label="Catalog" value={lastSynced} tone="muted" />
            {syncError ? (
              <Text variant="caption" tone="danger">
                {syncError}
              </Text>
            ) : null}
            <Button
              label="Sync items now"
              variant="secondary"
              icon="cloud-download-outline"
              loading={syncing}
              onPress={() => void useClientStore.getState().syncCatalog()}
            />
          </>
        ) : null}
        <Button
          label={pairing ? 'Manage connection' : 'Connect to admin'}
          icon="link-outline"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await useClientStore.getState().ping().catch(() => false);
            setBusy(false);
            router.push('/connect');
          }}
        />
      </View>
    </Card>
  );
}

function DeviceModeSheet({
  visible,
  onClose,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  current: DeviceMode;
}) {
  const theme = useTheme();
  const [mode, setMode] = useState<DeviceMode>(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setMode(current);
  }, [visible, current]);

  const save = async () => {
    setSaving(true);
    try {
      await setDeviceMode(mode);
      if (mode !== 'cashier' && current !== 'cashier') {
        onClose();
        return;
      }
      onClose();
      await useSessionStore.getState().restart();
    } catch (error) {
      Alert.alert('Could not change mode', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={visible}
      onClose={onClose}
      title="Device mode"
      subtitle="Choose how this phone fits into the shop. Standalone keeps everything on this phone. Admin host serves other phones. Cashier pairs with an admin phone."
      dismissable={!saving}
      footer={
        <Button label="Save" icon="checkmark" onPress={() => void save()} loading={saving} />
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <ChipRow options={DEVICE_MODE_OPTIONS} value={mode} onChange={(value) => setMode(value as DeviceMode)} />
        {mode === 'cashier' ? (
          <Text variant="caption" tone="warning">
            Saving will switch this phone into cashier mode and restart the app.
          </Text>
        ) : null}
      </View>
    </FormSheet>
  );
}

function ReminderSheet({
  visible,
  onClose,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  current: number;
}) {
  const theme = useTheme();
  const [days, setDays] = useState(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setDays(current);
  }, [visible, current]);

  const save = async () => {
    setSaving(true);
    try {
      await setBackupReminderDays(days);
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
      title="Backup reminder"
      subtitle="A gentle reminder appears until a backup has been made within this many days. Set 1 day to be nagged the most, or 30 days for the least."
      dismissable={!saving}
      footer={
        <Button label="Save" icon="checkmark" onPress={() => void save()} loading={saving} />
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <ChipRow options={REMINDER_OPTIONS} value={String(days)} onChange={(value) => setDays(Number(value))} />
      </View>
    </FormSheet>
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