import React, { useMemo, useState } from 'react';
import { Pressable, Vibration, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { EmptyState } from '@/components/EmptyState';
import { QueryErrorState } from '@/components/QueryErrorState';
import { SearchInput } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { FormSheet } from '@/components/FormSheet';
import { Text } from '@/components/Text';
import { showToast } from '@/components/Toast';
import { useLiveQuery } from '@/db/hooks';
import { getCategories, listItems, lookupBarcode } from '@/db/repositories/itemsRepo';
import { isLowStock } from '@/db/stock';
import { useToAddStore } from '@/features/items/toAddStore';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';

export default function ItemsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [toAddOpen, setToAddOpen] = useState(false);

  const toAdd = useToAddStore((state) => state.barcodes);
  const addToAdd = useToAddStore((state) => state.add);
  const removeFromAdd = useToAddStore((state) => state.remove);
  const clearToAdd = useToAddStore((state) => state.clear);

  const { data: categories } = useLiveQuery(() => getCategories(), [], 'items-list');
  const { data: items, isLoading, error: itemsError, refresh: refreshItems } = useLiveQuery(
    () => listItems({ search, category: category === 'all' ? '' : category }),
    [search, category],
    'items-list',
  );

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'All' },
      ...(categories ?? []).map((value) => ({ value, label: value })),
    ],
    [categories],
  );

  const list = items ?? [];
  const lowCount = list.filter((item) => isLowStock(item, item.stock)).length;

  const openNewItem = (barcode: string | null = null) => {
    setScannerOpen(false);
    removeFromAdd(barcode ?? '');
    router.push(barcode ? `/item/new?barcode=${encodeURIComponent(barcode)}` : '/item/new');
  };

  const handleScan = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    Vibration.vibrate(10);
    const lookup = await lookupBarcode(trimmed);
    if (lookup) {
      if (continuous) {
        showToast(`Already added: ${lookup.item.name}`);
        return;
      }
      setScannerOpen(false);
      router.push(`/item/${lookup.item.id}`);
      return;
    }
    if (continuous) {
      addToAdd(trimmed);
      showToast('Added to To-add list');
      return;
    }
    showToast('Barcode not found, add it as a new item');
    openNewItem(trimmed);
  };

  return (
    <Screen
      title="Items"
      subtitle={list.length > 0 ? `${list.length} product${list.length === 1 ? '' : 's'}` : undefined}
      right={
        <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
          <Pressable
            onPress={() => setScannerOpen(true)}
            accessibilityLabel="Scan barcode"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceAlt,
            })}
          >
            <Ionicons name="barcode-outline" size={22} color={theme.colors.accent} />
          </Pressable>
          <Pressable
            onPress={() => openNewItem()}
            accessibilityLabel="Add item"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
            })}
          >
            <Ionicons name="add" size={24} color={theme.colors.onPrimary} />
          </Pressable>
        </View>
      }
      footer={
        <Button
          label="Add item"
          icon="add"
          onPress={() => openNewItem()}
        />
      }
    >
      <SearchInput value={search} onChange={setSearch} placeholder="Search items or barcode" />

      {toAdd.length > 0 ? (
        <Pressable
          onPress={() => setToAddOpen(true)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space(2),
            backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.accentSoft,
            borderRadius: theme.radius.md,
            padding: theme.space(3),
          })}
        >
          <Ionicons name="add-circle-outline" size={17} color={theme.colors.accent} />
          <Text variant="label" tone="accent" style={{ flex: 1 }}>
            {toAdd.length} barcode{toAdd.length === 1 ? '' : 's'} to add
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
        </Pressable>
      ) : null}

      {categoryOptions.length > 1 ? (
        <ChipRow
          size="sm"
          options={categoryOptions}
          value={category}
          onChange={setCategory}
        />
      ) : null}

      {itemsError ? (
        <QueryErrorState onRetry={refreshItems} />
      ) : isLoading ? null : list.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={search || category !== 'all' ? 'No items match' : 'No items yet'}
          message={
            search || category !== 'all'
              ? 'Try a different search or clear the filters.'
              : 'Add your first product to start selling and tracking stock.'
          }
          actionLabel="Add your first item"
          onAction={() => openNewItem()}
        />
      ) : (
        <View style={{ gap: theme.space(2) }}>
          {lowCount > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: theme.colors.warningSoft,
                borderRadius: theme.radius.md,
                padding: theme.space(3),
              }}
            >
              <Ionicons name="alert-circle-outline" size={17} color={theme.colors.warning} />
              <Text variant="label" tone="warning" style={{ flex: 1 }}>
                {lowCount} item{lowCount === 1 ? '' : 's'} at or below the low-stock level
              </Text>
            </View>
          ) : null}

          {list.map((item) => {
            const low = isLowStock(item, item.stock);
            return (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/item/${item.id}`)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
                  borderRadius: theme.radius.lg,
                  borderWidth: 1,
                  borderColor: low ? theme.colors.warning : theme.colors.border,
                  padding: theme.space(3),
                  gap: 6,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(2) }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {item.category || 'Uncategorised'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="money" style={{ fontFamily: theme.font.semibold }}>
                      {formatMoney(item.sellingPrice)}
                    </Text>
                    <Text variant="caption" tone="faint">
                      cost {formatMoney(item.costPrice)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {!item.tracksStock ? (
                    <Badge label="No stock tracking" tone="neutral" />
                  ) : (
                    <>
                      <Badge
                        label={`Stock ${item.stock}`}
                        tone={low ? 'warning' : 'success'}
                      />
                      {low ? <Badge label="Low stock" tone="warning" /> : null}
                      {item.lowStockLevel > 0 ? (
                        <Text variant="caption" tone="faint">
                          reorder at {item.lowStockLevel}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        hint="Scan an item barcode"
        continuous={continuous}
        onContinuousChange={setContinuous}
      />

      <FormSheet
        visible={toAddOpen}
        onClose={() => setToAddOpen(false)}
        title="To add"
        subtitle={`${toAdd.length} barcode${toAdd.length === 1 ? '' : 's'} scanned that aren't items yet`}
        footer={
          toAdd.length > 0 ? (
            <Button label="Clear list" variant="ghost" icon="trash-outline" onPress={clearToAdd} />
          ) : undefined
        }
      >
        {toAdd.length === 0 ? (
          <EmptyState
            icon="barcode-outline"
            title="Nothing to add"
            message="Scan barcodes in continuous mode to collect new items here."
          />
        ) : (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            {toAdd.map((barcode, index) => (
              <View
                key={barcode}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space(3),
                  paddingHorizontal: theme.space(3),
                  paddingVertical: theme.space(3),
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {barcode}
                  </Text>
                  <Text variant="caption" tone="faint">
                    No matching item
                  </Text>
                </View>
                <Button
                  label="Add item"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  onPress={() => openNewItem(barcode)}
                />
              </View>
            ))}
          </View>
        )}
      </FormSheet>
    </Screen>
  );
}
