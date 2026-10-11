import React, { useMemo, useRef, useState } from 'react';
import { Alert, View, type StyleProp, type ViewStyle } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import { getSaleWithDetails, voidSale } from '@/db/repositories/salesRepo';
import { getSettings } from '@/db/repositories/settingsRepo';
import { can } from '@/features/auth/permissions';
import { useSessionStore } from '@/features/auth/sessionStore';
import { showToast } from '@/components/Toast';
import { formatMoney } from '@/lib/money';
import { formatDateTime } from '@/lib/dates';
import { useTheme } from '@/theme/theme';
import type { ActingUser, SaleWithDetails } from '@/db/types';

const PAPER_WIDTH = 340;

export default function ReceiptScreen() {
  const actor = useSessionStore((state) => state.currentUser) as ActingUser;
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!can(actor, 'view_receipts')) {
    return <Redirect href="/" />;
  }
  return <ReceiptInner actor={actor} saleId={String(id ?? '')} />;
}

function ReceiptInner({ actor, saleId }: { actor: ActingUser; saleId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const [sharing, setSharing] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const paperRef = useRef<View>(null);

  const { data: sale, isLoading } = useLiveQuery(() => getSaleWithDetails(saleId), [saleId]);
  const { data: settings } = useLiveQuery(() => getSettings(), []);

  const paymentLabel = useMemo(() => {
    if (!sale || sale.payments.length === 0) return '';
    if (sale.payments.length > 1) return 'Split payment';
    const method = sale.payments[0].method;
    return method.charAt(0).toUpperCase() + method.slice(1);
  }, [sale]);

  const owed = useMemo(
    () => sale?.payments.filter((payment) => payment.method === 'credit').reduce((sum, p) => sum + p.amount, 0) ?? 0,
    [sale],
  );

  const receiptText = useMemo(() => {
    if (!sale) return '';
    const shopName = settings?.shopName || 'My Shop';
    const shopAddress = settings?.shopAddress ? `\n${settings.shopAddress}` : '';
    const shopPhone = settings?.shopPhone ? `\n${settings.shopPhone}` : '';
    const lines = sale.lines
      .map(
        (line) =>
          `${line.itemName}\n  ${line.quantity} ${line.unitName} @ ${formatMoney(line.unitPrice)} = ${formatMoney(line.lineTotal)}`,
      )
      .join('\n');
    const rows = [
      shopName + shopAddress + shopPhone,
      `Receipt #${sale.receiptNo}`,
      formatDateTime(sale.soldAt),
      sale.customerName ? `Customer: ${sale.customerName}` : null,
      sale.servedByName ? `Served by: ${sale.servedByName}` : null,
      '',
      lines,
      '',
      `Subtotal: ${formatMoney(sale.subtotal)}`,
      sale.discount > 0 ? `Discount: -${formatMoney(sale.discount)}` : null,
      `Total: ${formatMoney(sale.total)}`,
      `Payment: ${paymentLabel}`,
      owed > 0 ? `Amount owed: ${formatMoney(owed)}` : null,
      settings?.receiptFooter ? settings.receiptFooter : null,
    ];
    return rows.filter(Boolean).join('\n');
  }, [sale, settings, paymentLabel, owed]);

  const shareOnWhatsApp = async () => {
    if (!sale) return;
    setSharing(true);
    try {
      const encoded = encodeURIComponent(receiptText);
      const deepLink = `whatsapp://send?text=${encoded}`;
      const webLink = `https://wa.me/?text=${encoded}`;
      try {
        if (await Linking.canOpenURL(deepLink)) {
          await Linking.openURL(deepLink);
          return;
        }
      } catch {}
      await Linking.openURL(webLink);
    } catch {
      Alert.alert('WhatsApp is not installed', 'Install WhatsApp to share receipts by text.');
    } finally {
      setSharing(false);
    }
  };

  const shareImage = async () => {
    if (!sale || !paperRef.current) return;
    setSharingImage(true);
    try {
      const uri = await captureRef(paperRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Receipt #${sale.receiptNo}`,
        });
      } else {
        Alert.alert('Sharing not available', 'This device cannot share files.');
      }
    } catch (error) {
      Alert.alert('Could not create image', error instanceof Error ? error.message : String(error));
    } finally {
      setSharingImage(false);
    }
  };

  if (!sale) {
    return (
      <Screen title="Receipt" onBack={() => router.back()}>
        {isLoading ? null : (
          <EmptyState
            icon="receipt-outline"
            title="Receipt not found"
            message="This sale may have been removed."
            actionLabel="Back to Sell"
            onAction={() => router.replace('/')}
          />
        )}
      </Screen>
    );
  }

  const shopName = settings?.shopName || 'My Shop';
  const shopAddress = settings?.shopAddress || '';
  const shopPhone = settings?.shopPhone || '';
  const receiptFooter = settings?.receiptFooter || '';

  return (
    <Screen
      title={`Receipt ${sale.receiptNo}`}
      subtitle={formatDateTime(sale.soldAt)}
      onBack={() => router.back()}
      footer={
        <View style={{ gap: theme.space(2) }}>
          <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
            <Button
              label="Image"
              variant="secondary"
              icon="image-outline"
              onPress={() => void shareImage()}
              loading={sharingImage}
              style={{ flex: 1 }}
            />
            <Button
              label="Share on WhatsApp"
              icon="logo-whatsapp"
              onPress={() => void shareOnWhatsApp()}
              loading={sharing}
              style={{ flex: 2 }}
            />
          </View>
          <Button
            label="New sale"
            variant="secondary"
            onPress={() => router.replace('/')}
          />
          {sale.status === 'completed' && can(actor, 'void_sale') ? (
            <Button
              label="Void sale"
              variant="danger"
              icon="close-circle-outline"
              onPress={() => setVoidOpen(true)}
            />
          ) : null}
        </View>
      }
    >
      <View
        ref={paperRef}
        collapsable={false}
        style={{
          alignSelf: 'center',
          width: PAPER_WIDTH,
          backgroundColor: '#FFFFFF',
          borderRadius: 4,
          borderWidth: 1,
          borderColor: '#D9DEE5',
          padding: 18,
          gap: 10,
        }}
      >
          <View style={{ alignItems: 'center', gap: 2 }}>
            <ReceiptText bold size={18}>
              {shopName}
            </ReceiptText>
            {shopAddress ? (
              <ReceiptText size={11} color="#566272" center>
                {shopAddress}
              </ReceiptText>
            ) : null}
            {shopPhone ? (
              <ReceiptText size={11} color="#566272">
                {shopPhone}
              </ReceiptText>
            ) : null}
          </View>

          <View style={{ alignItems: 'center', gap: 2 }}>
            <ReceiptText size={12} color="#566272">
              Receipt #{sale.receiptNo}
            </ReceiptText>
            <ReceiptText size={12} color="#566272">
              {formatDateTime(sale.soldAt)}
            </ReceiptText>
            {sale.customerName ? (
              <ReceiptText size={12} color="#566272">
                Customer: {sale.customerName}
              </ReceiptText>
            ) : null}
            {sale.servedByName ? (
              <ReceiptText size={12} color="#566272">
                Served by: {sale.servedByName}
              </ReceiptText>
            ) : null}
          </View>

          {sale.status === 'voided' ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#B3402C',
                backgroundColor: '#FDEBE7',
                borderRadius: 4,
                padding: 8,
                alignItems: 'center',
                gap: 2,
              }}
            >
              <ReceiptText size={13} color="#B3402C" bold>
                VOIDED
              </ReceiptText>
              {sale.voidReason ? (
                <ReceiptText size={11} color="#B3402C" center>
                  {sale.voidReason}
                </ReceiptText>
              ) : null}
              {sale.voidedByName ? (
                <ReceiptText size={11} color="#B3402C" center>
                  Voided by {sale.voidedByName} · {formatDateTime(sale.voidedAt ?? sale.soldAt)}
                </ReceiptText>
              ) : null}
            </View>
          ) : null}

          <View style={{ height: 1, backgroundColor: '#D9DEE5', marginVertical: 4 }} />

          <View style={{ gap: 6 }}>
            {sale.lines.map((line) => (
              <View key={line.id} style={{ gap: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <ReceiptText size={13} style={{ flex: 1 }} bold>
                    {line.itemName}
                  </ReceiptText>
                  <ReceiptText size={13} bold>
                    {formatMoney(line.lineTotal)}
                  </ReceiptText>
                </View>
                <ReceiptText size={11} color="#566272">
                  {line.quantity} {line.unitName.toLowerCase()}
                  {line.quantity > 1 ? 's' : ''} @ {formatMoney(line.unitPrice)}
                </ReceiptText>
              </View>
            ))}
          </View>

          <View style={{ height: 1, backgroundColor: '#D9DEE5', marginVertical: 4 }} />

          <ReceiptRow label="Subtotal" value={formatMoney(sale.subtotal)} />
          {sale.discount > 0 ? <ReceiptRow label="Discount" value={`-${formatMoney(sale.discount)}`} /> : null}
          <ReceiptRow label="Total" value={formatMoney(sale.total)} bold />
          <ReceiptRow label="Payment" value={paymentLabel} />
          {owed > 0 ? <ReceiptRow label="Amount owed" value={formatMoney(owed)} bold /> : null}

          {receiptFooter ? (
            <>
              <View style={{ height: 1, backgroundColor: '#D9DEE5', marginVertical: 4 }} />
              <ReceiptText size={12} color="#566272" center>
                {receiptFooter}
              </ReceiptText>
            </>
          ) : null}
        </View>

      <Text variant="caption" tone="faint" center>
        Share the receipt as an image or as text on WhatsApp.
      </Text>

      {sale ? (
        <VoidSaleSheet
          visible={voidOpen}
          sale={sale}
          actor={actor}
          onClose={() => setVoidOpen(false)}
          onVoided={() => {
            setVoidOpen(false);
            router.replace('/');
          }}
        />
      ) : null}
    </Screen>
  );
}

function VoidSaleSheet({
  visible,
  sale,
  actor,
  onClose,
  onVoided,
}: {
  visible: boolean;
  sale: SaleWithDetails;
  actor: ActingUser;
  onClose: () => void;
  onVoided: () => void;
}) {
  const theme = useTheme();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await voidSale(actor, sale.id, reason.trim());
      showToast('Sale voided');
      onVoided();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Void this sale?"
      subtitle={`Receipt #${sale.receiptNo} · ${formatMoney(sale.total)} — only the owner can do this.`}
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button
            label="Void sale"
            variant="danger"
            icon="close-circle-outline"
            onPress={() => void submit()}
            loading={saving}
          />
        </View>
      }
    >
      <View style={{ gap: theme.space(3) }}>
        <Card>
          <Text variant="body" tone="muted">
            Stock is put back and the sale leaves today&apos;s totals. A credit owed for this sale is
            also cancelled. This is recorded in the audit log and cannot be undone.
          </Text>
        </Card>
        <Input
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Wrong item entered, customer changed mind"
          multiline
        />
      </View>
    </Sheet>
  );
}

function ReceiptRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
      <ReceiptText size={bold ? 14 : 13} bold={bold}>
        {label}
      </ReceiptText>
      <ReceiptText size={bold ? 14 : 13} bold={bold}>
        {value}
      </ReceiptText>
    </View>
  );
}

function ReceiptText({
  children,
  size = 13,
  bold,
  color = '#10161D',
  center,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  bold?: boolean;
  color?: string;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={style}>
      <Text
        center={center}
        style={{
          fontSize: size,
          lineHeight: Math.round(size * 1.4),
          color,
          fontFamily: bold ? theme.font.semibold : theme.font.regular,
          fontVariant: ['tabular-nums'],
        }}
      >
        {children}
      </Text>
    </View>
  );
}
