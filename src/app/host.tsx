import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as KeepAwake from 'expo-keep-awake';
import QRCode from 'react-native-qrcode-svg';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Divider, KeyValueRow, SectionTitle } from '@/components/Section';
import { FormSheet } from '@/components/FormSheet';
import { Text } from '@/components/Text';
import { listUsers } from '@/db/repositories/usersRepo';
import { useSessionStore } from '@/features/auth/sessionStore';
import { useHostStore } from '@/features/net/hostStore';
import { PROTOCOL_VERSION } from '@/features/net/protocol';
import { isTcpAvailable } from '@/features/net/tcp';
import { formatDateTime } from '@/lib/dates';
import { roleLabel } from '@/lib/roles';
import { useTheme } from '@/theme/theme';
import type { DeviceRecord } from '@/db/repositories/devicesRepo';
import type { User } from '@/db/types';

const KEEP_AWAKE_TAG = 'shoppos-host';

export default function HostScreen() {
  const theme = useTheme();
  const router = useRouter();
  const currentUser = useSessionStore((state) => state.currentUser);
  const isOwner = currentUser?.role === 'owner';

  const running = useHostStore((state) => state.running);
  const starting = useHostStore((state) => state.starting);
  const error = useHostStore((state) => state.error);
  const ip = useHostStore((state) => state.ip);
  const port = useHostStore((state) => state.port);
  const pairingKey = useHostStore((state) => state.pairingKey);
  const shopId = useHostStore((state) => state.shopId);
  const devices = useHostStore((state) => state.devices);
  const lastEvent = useHostStore((state) => state.lastEvent);

  const [approving, setApproving] = useState<DeviceRecord | null>(null);

  const tcpAvailable = isTcpAvailable();

  useEffect(() => {
    void useHostStore.getState().refresh();
  }, []);

  useEffect(() => {
    if (running) {
      void KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } else {
      void KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
    return () => {
      void KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void useHostStore.getState().refresh(), 3000);
    return () => clearInterval(timer);
  }, [running]);

  if (!isOwner) {
    return (
      <Screen title="Admin host" onBack={() => router.back()}>
        <Card>
          <Text variant="body" tone="muted">
            Only the owner can host cashier devices.
          </Text>
        </Card>
      </Screen>
    );
  }

  const pairingJson = running && ip && pairingKey && shopId
    ? JSON.stringify({ v: PROTOCOL_VERSION, ip, port, shopId, key: pairingKey, name: 'ShopPOS' })
    : '';

  const pending = devices.filter((device) => device.status === 'pending');
  const approved = devices.filter((device) => device.status === 'approved');
  const revoked = devices.filter((device) => device.status === 'revoked');

  const stop = () => {
    Alert.alert('Stop hosting?', 'Cashier phones will not be able to sync while the server is off.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => useHostStore.getState().stop() },
    ]);
  };

  return (
    <Screen
      title="Admin host"
      subtitle="Serve cashier phones on your Wi-Fi"
      onBack={() => router.back()}
      right={<Badge label={running ? 'Running' : 'Stopped'} tone={running ? 'success' : 'neutral'} />}
    >
      {!tcpAvailable ? (
        <Card>
          <View style={{ gap: theme.space(2) }}>
            <Text variant="bodyMedium" tone="warning">
              Development build required
            </Text>
            <Text variant="caption" tone="muted">
              Hosting needs the native network server, which Expo Go does not include. Install a
              development build of ShopPOS on this phone to turn it on.
            </Text>
          </View>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <Text variant="bodyMedium" tone="danger">
            {error}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>Server</SectionTitle>
        <Card>
          <View style={{ gap: theme.space(3) }}>
            {running ? (
              <>
                <KeyValueRow label="Address" value={ip ? `${ip}:${port}` : `Port ${port}`} emphasise />
                <Divider />
                <KeyValueRow label="Pairing key" value={pairingKey ?? '—'} />
                <KeyValueRow label="Cashier phones" value={String(approved.length)} tone="muted" />
                <KeyValueRow label="Last activity" value={lastEvent ?? '—'} tone="muted" />
                <Divider />
                <Button label="Stop hosting" variant="danger" icon="stop-circle-outline" onPress={stop} />
              </>
            ) : (
              <>
                <Text variant="caption" tone="muted">
                  Turn this phone into the shop server. Keep it charged and on the same Wi-Fi as the
                  cashier phones. Nothing leaves your network.
                </Text>
                <Button
                  label="Start hosting"
                  icon="play-circle-outline"
                  disabled={!tcpAvailable}
                  loading={starting}
                  onPress={() => void useHostStore.getState().start()}
                />
              </>
            )}
          </View>
        </Card>
      </View>

      {running ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Pair a cashier phone</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3), alignItems: 'center' }}>
              {pairingJson ? (
                <View style={{ backgroundColor: '#FFFFFF', padding: theme.space(3), borderRadius: theme.radius.md }}>
                  <QRCode value={pairingJson} size={196} />
                </View>
              ) : (
                <Text variant="caption" tone="warning" center>
                  Connect this phone to Wi-Fi to show a scannable address, or read the port and key
                  to the cashier.
                </Text>
              )}
              <Text variant="caption" tone="muted" center>
                On the cashier phone open Settings → Device mode → Cashier, then scan this code (or
                type the address and pairing key).
              </Text>
              <KeyValueRow label="Address" value={ip ? `${ip}:${port}` : `${port}`} />
              <KeyValueRow label="Key" value={pairingKey ?? '—'} />
            </View>
          </Card>
        </View>
      ) : null}

      {pending.length > 0 ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Waiting for approval</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              {pending.map((device) => (
                <View key={device.id} style={{ gap: theme.space(2) }}>
                  <DeviceRow device={device} />
                  <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
                    <View style={{ flex: 1 }}>
                      <Button label="Approve" size="sm" icon="checkmark" onPress={() => setApproving(device)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Reject"
                        size="sm"
                        variant="outline"
                        icon="close"
                        onPress={() => void useHostStore.getState().remove(device.id)}
                      />
                    </View>
                  </View>
                  <Divider />
                </View>
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      <View style={{ gap: theme.space(2) }}>
        <SectionTitle>Connected devices</SectionTitle>
        <Card>
          {approved.length === 0 && revoked.length === 0 ? (
            <Text variant="caption" tone="muted">
              No cashier phones are approved yet.
            </Text>
          ) : (
            <View style={{ gap: theme.space(3) }}>
              {approved.map((device) => (
                <View key={device.id} style={{ gap: theme.space(2) }}>
                  <DeviceRow device={device} />
                  <Button
                    label="Remove device"
                    size="sm"
                    variant="outline"
                    icon="trash-outline"
                    onPress={() => void useHostStore.getState().revoke(device.id)}
                  />
                  <Divider />
                </View>
              ))}
              {revoked.map((device) => (
                <View key={device.id} style={{ gap: theme.space(2) }}>
                  <DeviceRow device={device} />
                  <Button
                    label="Delete record"
                    size="sm"
                    variant="outline"
                    icon="trash-outline"
                    onPress={() => void useHostStore.getState().remove(device.id)}
                  />
                  <Divider />
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>

      <ApproveSheet
        device={approving}
        onClose={() => setApproving(null)}
        onApproved={() => setApproving(null)}
      />
    </Screen>
  );
}

function DeviceRow({ device }: { device: DeviceRecord }) {
  const theme = useTheme();
  const tone = device.status === 'approved' ? 'success' : device.status === 'pending' ? 'warning' : 'danger';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyMedium">{device.name}</Text>
        <Text variant="caption" tone="muted">
          {device.userName ? `${device.userName} · ${roleLabel(device.role as 'owner' | 'cashier')}` : 'Not yet bound to staff'}
          {device.lastSeenAt ? ` · seen ${formatDateTime(device.lastSeenAt)}` : ''}
        </Text>
      </View>
      <Badge label={device.status} tone={tone} />
    </View>
  );
}

function ApproveSheet({
  device,
  onClose,
  onApproved,
}: {
  device: DeviceRecord | null;
  onClose: () => void;
  onApproved: () => void;
}) {
  const theme = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!device) return;
    setSelected(null);
    setError(null);
    setSaving(false);
    void (async () => {
      const all = await listUsers();
      const cashiers = all.filter((user) => user.role === 'cashier');
      setUsers(cashiers.length > 0 ? cashiers : all);
    })();
  }, [device]);

  const approve = async () => {
    if (!selected || !device) {
      setError('Choose who will sell on this phone.');
      return;
    }
    setSaving(true);
    try {
      await useHostStore.getState().approve(device.id, selected);
      onApproved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      visible={device !== null}
      onClose={onClose}
      title="Approve cashier phone"
      subtitle={device ? `Allow "${device.name}" to ring up sales as:` : undefined}
      dismissable={!saving}
      footer={<Button label="Approve device" icon="checkmark" onPress={() => void approve()} loading={saving} />}
    >
      <View style={{ gap: theme.space(3) }}>
        {error ? (
          <Text variant="label" tone="danger">
            {error}
          </Text>
        ) : null}
        {users.length === 0 ? (
          <Text variant="caption" tone="muted">
            No cashier accounts yet. Add one from Staff & security first.
          </Text>
        ) : (
          <View style={{ gap: theme.space(2) }}>
            {users.map((user) => {
              const active = user.id === selected;
              return (
                <Card key={user.id} tone={active ? 'alt' : 'default'}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">{user.name}</Text>
                      <Text variant="caption" tone="muted">
                        {roleLabel(user.role)}
                      </Text>
                    </View>
                    <Button
                      label={active ? 'Selected' : 'Select'}
                      size="sm"
                      variant={active ? 'primary' : 'outline'}
                      fullWidth={false}
                      onPress={() => setSelected(user.id)}
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </FormSheet>
  );
}
