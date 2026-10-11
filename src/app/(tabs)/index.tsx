import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { SearchInput } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/Section';
import { Text } from '@/components/Text';
import { showToast } from '@/components/Toast';
import { useLiveQuery } from '@/db/hooks';
import { getUnitsForItems, listItems, lookupBarcode } from '@/db/repositories/itemsRepo';
import { getSettings } from '@/db/repositories/settingsRepo';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';

import { CartLineCard } from '@/features/sell/CartLineCard';
import { CheckoutSheet } from '@/features/sell/CheckoutSheet';
import { CustomerPickerSheet } from '@/features/sell/CustomerPickerSheet';
import { cartTotals, type CartLine as TotalsLine } from '@/features/sell/cart';
import { useSellStore } from '@/features/sell/sellStore';

export default function SellScreen() {
  const theme = useTheme();
  const router = useRouter();

  const lines = useSellStore((state) => state.lines);
  const discount = useSellStore((state) => state.discount);
  const addItem = useSellStore((state) => state.addItem);
  const setUnit = useSellStore((state) => state.setUnit);
  const setQuantity = useSellStore((state) => state.setQuantity);
  const setPrice = useSellStore((state) => state.setPrice);
  const removeLine = useSellStore((state) => state.removeLine);
  const clearCart = useSellStore((state) => state.clear);
  const customerId = useSellStore((state) => state.customerId);
  const customerName = useSellStore((state) => state.customerName);
  const setCustomer = useSellStore((state) => state.setCustomer);

  const [query, setQuery] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);

  const { data: items } = useLiveQuery(() => listItems(), []);
  const { data: unitsMap } = useLiveQuery(
    () => getUnitsForItems((items ?? []).map((item) => item.id)),
    [items],
  );
  const { data: settings } = useLiveQuery(() => getSettings(), []);

  const totals = useMemo(() => cartTotals(lines as TotalsLine[], discount), [lines, discount]);

  const trimmedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!items || !trimmedQuery) return [];
    return items
      .filter((item) => {
        const unitBarcodes = (unitsMap?.get(item.id) ?? []).map((unit) =>
          (unit.barcode ?? '').toLowerCase(),
        );
        return (
          item.name.toLowerCase().includes(trimmedQuery) ||
          unitBarcodes.includes(trimmedQuery) ||
          item.category.toLowerCase().includes(trimmedQuery)
        );
      })
      .slice(0, 20);
  }, [items, unitsMap, trimmedQuery]);

  const baseUnitFor = (itemId: string) => {
    const units = unitsMap?.get(itemId) ?? [];
    return units.find((unit) => unit.isBase) ?? units[0] ?? null;
  };

  const addByBarcode = async (code: string) => {
    const lookup = await lookupBarcode(code);
    if (!lookup) {
      showToast('Item not found');
      return;
    }
    addItem(lookup.item, lookup.unit);
    setQuery('');
  };

  const confirmClear = () => {
    Alert.alert('Clear cart?', 'All items in this sale will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearCart },
    ]);
  };

  return (
    <Screen
      title={settings?.shopName ? settings.shopName : 'Sell'}
      subtitle={lines.length > 0 ? `${lines.length} in cart` : 'Start a new sale'}
      right={
        lines.length > 0 ? (
          <Pressable
            onPress={confirmClear}
            accessibilityLabel="Clear cart"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.dangerSoft : theme.colors.surfaceAlt,
            })}
          >
            <Ionicons name="trash-outline" size={19} color={theme.colors.danger} />
          </Pressable>
        ) : null
      }
      footer={
        <View style={{ gap: theme.space(3) }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Text variant="caption" tone="muted">
                {lines.reduce((sum, line) => sum + line.quantity, 0)} unit
                {lines.reduce((sum, line) => sum + line.quantity, 0) === 1 ? '' : 's'} · subtotal{' '}
                {formatMoney(totals.subtotal)}
              </Text>
              {totals.discount > 0 ? (
                <Text variant="caption" tone="accent">
                  Discount -{formatMoney(totals.discount)}
                </Text>
              ) : null}
            </View>
            <Text variant="moneyLarge" style={{ fontFamily: theme.font.bold }}>
              {formatMoney(totals.total)}
            </Text>
          </View>
          <Button
            label={lines.length === 0 ? 'Add items to charge' : `Charge ${formatMoney(totals.total)}`}
            icon="card-outline"
            iconPosition="right"
            size="lg"
            disabled={lines.length === 0}
            onPress={() => setCheckoutOpen(true)}
          />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', gap: theme.space(2), alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search item name or barcode" />
        </View>
        <Pressable
          onPress={() => setScannerOpen(true)}
          accessibilityLabel="Scan barcode"
          style={({ pressed }) => ({
            width: theme.tapTarget,
            height: theme.tapTarget,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: pressed ? theme.colors.accent : theme.colors.border,
            backgroundColor: pressed ? theme.colors.accentSoft : theme.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Ionicons name="barcode-outline" size={24} color={theme.colors.accent} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => router.push('/my-sales')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons name="receipt-outline" size={15} color={theme.colors.accent} />
        <Text variant="caption" tone="accent">
          My sales
        </Text>
      </Pressable>

      {trimmedQuery ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>{results.length} result{results.length === 1 ? '' : 's'}</SectionTitle>
          {results.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="No items found"
              message={`Nothing matches "${query}". Try a different word or scan the barcode.`}
            />
          ) : (
            <View style={{ gap: theme.space(2) }}>
              {results.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => addItem(item, baseUnitFor(item.id))}
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
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {item.category || 'Uncategorised'}
                      {item.tracksStock ? ` · stock ${item.stock}` : ' · no stock tracking'}
                    </Text>
                  </View>
                  <Text variant="moneySmall" style={{ fontFamily: theme.font.semibold }}>
                    {formatMoney(item.sellingPrice)}
                  </Text>
                  <Ionicons name="add-circle" size={24} color={theme.colors.accent} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}

      <View style={{ gap: theme.space(3) }}>
        <SectionTitle
          action={lines.length > 0 ? <Badge label={`${lines.length}`} tone="accent" /> : null}
        >
          Current sale
        </SectionTitle>

        {lines.length === 0 ? (
          <EmptyState
            icon="cart-outline"
            title="Your cart is empty"
            message="Search above or scan a barcode to add your first item."
            actionLabel="Scan barcode"
            onAction={() => setScannerOpen(true)}
          />
        ) : (
          <View style={{ gap: theme.space(3) }}>
            {lines.map((line) => (
              <CartLineCard
                key={line.key}
                line={line}
                units={unitsMap?.get(line.itemId) ?? []}
                onChangeUnit={(unit) => setUnit(line.key, unit)}
                onChangeQuantity={(quantity) => setQuantity(line.key, quantity)}
                onChangePrice={(kobo) => setPrice(line.key, kobo)}
                onRemove={() => removeLine(line.key)}
              />
            ))}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: theme.radius.md,
                paddingHorizontal: theme.space(3),
                paddingVertical: theme.space(3),
                gap: theme.space(3),
              }}
            >
              <Pressable
                onPress={() => setCustomerOpen(true)}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Ionicons name="person-outline" size={18} color={theme.colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" tone="muted">
                    Customer
                  </Text>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {customerName ?? 'Walk-in'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textFaint} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={addByBarcode}
        hint="Scan the item's barcode"
      />

      <CustomerPickerSheet
        visible={customerOpen}
        onClose={() => setCustomerOpen(false)}
        selectedId={customerId}
        onSelect={(id, name) => setCustomer(id, name)}
      />

      <CheckoutSheet
        visible={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onPickCustomer={() => {
          setCheckoutOpen(false);
          setCustomerOpen(true);
        }}
        onCompleted={(saleId) => {
          setCheckoutOpen(false);
          router.push(`/receipt/${saleId}`);
        }}
      />
    </Screen>
  );
}
