import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Divider, KeyValueRow, SectionTitle } from '@/components/Section';
import { Text } from '@/components/Text';
import { useSessionStore } from '@/features/auth/sessionStore';
import { StatusChip, statusLabel } from '@/features/net/StatusChip';
import { useClientStore } from '@/features/net/clientStore';
import { setDeviceMode } from '@/features/net/deviceMode';
import { useTheme } from '@/theme/theme';

const DEFAULT_PORT = 8799;

export default function ConnectScreen() {
  const theme = useTheme();
  const router = useRouter();
  const currentUser = useSessionStore((state) => state.currentUser);

  const status = useClientStore((state) => state.status);
  const pairing = useClientStore((state) => state.pairing);
  const shopName = useClientStore((state) => state.shopName);
  const error = useClientStore((state) => state.error);

  const [host, setHost] = useState('');
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void useClientStore.getState().load();
  }, []);

  const connected = status === 'connected' || status === 'offline';

  const pair = async () => {
    const portNumber = Number.parseInt(port, 10);
    if (!host.trim()) {
      Alert.alert('Address needed', 'Type the admin phone address shown on its host screen.');
      return;
    }
    if (!Number.isFinite(portNumber) || portNumber <= 0) {
      Alert.alert('Port looks wrong', 'Use the port shown on the admin phone, e.g. 8799.');
      return;
    }
    if (!key.trim()) {
      Alert.alert('Pairing key needed', 'Type the key shown on the admin host screen.');
      return;
    }
    setBusy(true);
    await useClientStore.getState().pair({ host: host.trim(), port: portNumber, key: key.trim().toUpperCase() });
    setBusy(false);
  };

  const disconnect = () => {
    Alert.alert('Forget this admin phone?', 'You will need to pair again to sync.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => void useClientStore.getState().disconnect() },
    ]);
  };

  const refresh = async () => {
    setBusy(true);
    const ok = await useClientStore.getState().ping();
    useClientStore.setState({ status: ok ? 'connected' : 'offline' });
    setBusy(false);
  };

  const applyAsThisDevice = () => {
    if (!pairing) return;
    // The root gate watches the session and swaps to the app once unlocked.
    useSessionStore.getState().unlockAs({
      id: pairing.userId,
      name: pairing.userName,
      role: pairing.role === 'owner' ? 'owner' : 'cashier',
    });
  };

  const becomeStandalone = () => {
    Alert.alert(
      'Use as a standalone shop?',
      'This phone will keep its own data and stop syncing with an admin phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await setDeviceMode('standalone');
              await useSessionStore.getState().restart();
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen
      title="Connect to admin"
      subtitle="Pair this phone with the shop's admin phone"
      onBack={currentUser ? () => router.back() : undefined}
      right={currentUser ? <StatusChip status={status} /> : undefined}
    >
      {connected && pairing ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Linked</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space(3) }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{shopName ?? 'Admin phone'}</Text>
                  <Text variant="caption" tone="muted">
                    {pairing.host}:{pairing.port}
                  </Text>
                </View>
                <Badge label={statusLabel(status)} tone={status === 'connected' ? 'success' : 'warning'} />
              </View>
              <Divider />
              <KeyValueRow label="Selling as" value={pairing.userName} />
              <Divider />
              <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
                <View style={{ flex: 1 }}>
                  <Button label="Check again" variant="secondary" icon="refresh" loading={busy} onPress={() => void refresh()} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Settings" variant="secondary" icon="settings-outline" onPress={() => router.replace('/(tabs)/settings')} />
                </View>
              </View>
              <Button label="Forget this admin phone" variant="outline" icon="unlink-outline" onPress={disconnect} />
            </View>
          </Card>
        </View>
      ) : (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>New pairing</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              <Text variant="caption" tone="muted">
                On the admin phone, open Settings → Admin host and start hosting. Then scan its QR
                code (coming next) or type the address and key below. The admin must approve this
                phone before it can sell.
              </Text>
              <Input label="Admin address" value={host} onChangeText={setHost} placeholder="192.168.1.10" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
              <Input label="Port" value={port} onChangeText={setPort} keyboardType="number-pad" />
              <Input label="Pairing key" value={key} onChangeText={setKey} placeholder="ABCD-EFGH" autoCapitalize="characters" />
              {error ? (
                <Text variant="label" tone="danger">
                  {error}
                </Text>
              ) : null}
              <Button label="Pair with admin" icon="link-outline" loading={busy || status === 'connecting' || status === 'pending'} onPress={() => void pair()} />
              {status === 'pending' ? (
                <Text variant="caption" tone="warning" center>
                  Waiting for the admin to approve this phone…
                </Text>
              ) : null}
            </View>
          </Card>
        </View>
      )}

      {!currentUser && status === 'connected' && pairing ? (
        <Button label="Start selling as this device" icon="log-in-outline" onPress={applyAsThisDevice} />
      ) : null}

      {!currentUser && !pairing ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Or</SectionTitle>
          <Card>
            <View style={{ gap: theme.space(3) }}>
              <Text variant="caption" tone="muted">
                Not joining an admin phone? Set this phone up to run the shop on its own.
              </Text>
              <Button
                label="Set up as a standalone shop"
                variant="outline"
                icon="phone-portrait-outline"
                onPress={becomeStandalone}
              />
            </View>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
