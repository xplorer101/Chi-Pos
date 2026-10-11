import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Vibration, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Button } from '@/components/Button';
import { ChipRow } from '@/components/ChipRow';
import { Input, MoneyInput } from '@/components/Input';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/Section';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useLiveQuery } from '@/db/hooks';
import {
  createItem,
  deleteItem,
  getItem,
  getItemUnits,
  listMovements,
  recordAdjustment,
  recordRestock,
  updateItem,
  type ItemUnitInput,
} from '@/db/repositories/itemsRepo';
import { can } from '@/features/auth/permissions';
import { useSessionStore } from '@/features/auth/sessionStore';
import { formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { useTheme } from '@/theme/theme';
import type { ActingUser } from '@/db/types';

type UnitDraft = ItemUnitInput;

export default function ItemScreen() {
  const currentUser = useSessionStore((state) => state.currentUser);
  if (!can(currentUser, 'manage_items')) {
    return <Redirect href="/" />;
  }
  return <ItemScreenInner />;
}

function ItemScreenInner() {
  const theme = useTheme();
  const router = useRouter();
  const currentUser = useSessionStore((state) => state.currentUser);
  const actor = currentUser as ActingUser;
  const { id, barcode: barcodeParam } = useLocalSearchParams<{ id: string; barcode?: string }>();
  const itemId = String(id ?? 'new');
  const isNew = itemId === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [tracksStock, setTracksStock] = useState(true);
  const [lowStockLevel, setLowStockLevel] = useState('');
  const [costPrice, setCostPrice] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [units, setUnits] = useState<UnitDraft[]>(() => [
    {
      unitName: 'Single',
      unitsPerBase: 1,
      sellingPrice: 0,
      isBase: true,
      sortOrder: 0,
      barcode: barcodeParam?.trim() || null,
    },
  ]);

  const [restockOpen, setRestockOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerUnit, setScannerUnit] = useState<number | null>(null);

  const { data: existing } = useLiveQuery(
    async () => (isNew ? null : getItem(itemId)),
    [itemId, isNew],
  );
  const { data: existingUnits } = useLiveQuery(
    async () => (isNew ? [] : getItemUnits(itemId)),
    [itemId, isNew],
  );
  const { data: movements } = useLiveQuery(
    async () => (isNew ? [] : listMovements(itemId, 30)),
    [itemId, isNew],
  );

  useEffect(() => {
    if (isNew && barcodeParam) {
      setUnits((current) =>
        current.map((unit, i) => (i === 0 && !unit.barcode ? { ...unit, barcode: barcodeParam } : unit)),
      );
    }
  }, [isNew, barcodeParam]);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setCategory(existing.category);
    setTracksStock(existing.tracksStock);
    setLowStockLevel(String(existing.lowStockLevel));
    setCostPrice(existing.costPrice);
    setSellingPrice(existing.sellingPrice);
    setLoading(false);
  }, [existing]);

  useEffect(() => {
    if (!existingUnits || existingUnits.length === 0) return;
    setUnits(
      existingUnits.map((unit) => ({
        id: unit.id,
        unitName: unit.unitName,
        unitsPerBase: unit.unitsPerBase,
        sellingPrice: unit.sellingPrice,
        isBase: unit.isBase,
        sortOrder: unit.sortOrder,
        barcode: unit.barcode,
      })),
    );
  }, [existingUnits]);

  const updateUnit = (index: number, patch: Partial<UnitDraft>) => {
    setUnits((current) => current.map((unit, i) => (i === index ? { ...unit, ...patch } : unit)));
  };

  const makeBase = (index: number) => {
    setUnits((current) => current.map((unit, i) => ({ ...unit, isBase: i === index })));
  };

  const addUnit = () => {
    setUnits((current) => [
      ...current,
      {
        unitName: '',
        unitsPerBase: 1,
        sellingPrice: 0,
        isBase: false,
        sortOrder: current.length,
        barcode: null,
      },
    ]);
  };

  const removeUnit = (index: number) => {
    setUnits((current) => {
      const next = current.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((unit) => unit.isBase)) {
        let smallest = 0;
        next.forEach((unit, i) => {
          if ((unit.unitsPerBase ?? 1) < (next[smallest].unitsPerBase ?? 1)) smallest = i;
        });
        next[smallest] = { ...next[smallest], isBase: true };
      }
      return next;
    });
  };

  const handleUnitScan = (code: string) => {
    const scanned = code.trim();
    Vibration.vibrate(10);
    if (scannerUnit != null) updateUnit(scannerUnit, { barcode: scanned });
  };

  const save = useCallback(async () => {
    if (!name.trim()) {
      setError('Give the item a name.');
      return;
    }
    const draftUnits = units.filter((unit) => unit.unitName.trim().length > 0);
    if (draftUnits.some((unit) => !unit.unitName.trim())) {
      setError('Every unit needs a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        category: category.trim(),
        tracksStock,
        lowStockLevel: Number.parseInt(lowStockLevel, 10) || 0,
        costPrice,
        sellingPrice,
        units: draftUnits,
      };
      if (isNew) {
        await createItem(actor, payload);
      } else {
        await updateItem(actor, itemId, payload);
      }
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }, [actor, category, costPrice, isNew, itemId, lowStockLevel, name, router, sellingPrice, tracksStock, units]);

  const remove = () => {
    Alert.alert('Delete item?', `${name} will be removed from your catalogue. Stock history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteItem(actor, itemId).then(() => router.back());
        },
      },
    ]);
  };

  const stock = existing?.stock ?? 0;

  const historyEntries = useMemo(() => movements ?? [], [movements]);

  if (loading) {
    return (
      <Screen title={isNew ? 'New item' : 'Item'} onBack={() => router.back()}>
        <Text tone="muted">Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title={isNew ? 'Add item' : name || 'Item'}
      subtitle={isNew ? 'Create a product or service' : `Stock ${stock} base units`}
      onBack={() => router.back()}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <View
              style={{
                backgroundColor: theme.colors.dangerSoft,
                borderRadius: theme.radius.sm,
                padding: 10,
              }}
            >
              <Text variant="label" tone="danger">
                {error}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
            {!isNew ? (
              <Button
                label="Delete"
                variant="danger"
                icon="trash-outline"
                onPress={remove}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button
              label={isNew ? 'Add item' : 'Save changes'}
              onPress={() => void save()}
              loading={saving}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      }
    >
      {!isNew ? (
        <View style={{ flexDirection: 'row', gap: theme.space(2) }}>
          <Button
            label="Restock"
            variant="secondary"
            icon="cube"
            onPress={() => setRestockOpen(true)}
            style={{ flex: 1 }}
          />
          <Button
            label="Adjust stock"
            variant="secondary"
            icon="swap-horizontal"
            onPress={() => setAdjustOpen(true)}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      <View style={{ gap: theme.space(4) }}>
        <SectionTitle>Details</SectionTitle>
        <Input
          label="Item name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Indomie Chicken Noodles"
          autoFocus={isNew && Boolean(barcodeParam)}
        />
        <Input
          label="Category"
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Staples"
          autoCapitalize="words"
          hint="Used for filtering on the Items tab"
        />

        <Pressable
          onPress={() => setTracksStock((value) => !value)}
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
            <Text variant="bodyMedium">Track stock for this item</Text>
            <Text variant="caption" tone="muted">
              Turn off for services (repairs, airtime, etc.)
            </Text>
          </View>
          <Badge label={tracksStock ? 'On' : 'Off'} tone={tracksStock ? 'success' : 'neutral'} />
        </Pressable>

        {tracksStock ? (
          <Input
            label={`Low-stock alert at (base units)`}
            value={lowStockLevel}
            onChangeText={setLowStockLevel}
            keyboardType="number-pad"
            placeholder="0"
            hint="You will see a warning in reports and on the item row"
          />
        ) : null}
      </View>

      <View style={{ gap: theme.space(4) }}>
        <SectionTitle>Prices</SectionTitle>
        <View style={{ flexDirection: 'row', gap: theme.space(3) }}>
          <MoneyInput
            label="Cost price (per base unit)"
            value={costPrice}
            onChangeKobo={setCostPrice}
            containerStyle={{ flex: 1 }}
          />
          <MoneyInput
            label="Selling price (per base unit)"
            value={sellingPrice}
            onChangeKobo={setSellingPrice}
            containerStyle={{ flex: 1 }}
          />
        </View>
      </View>

      <View style={{ gap: theme.space(3) }}>
        <SectionTitle
          action={
            <Button label="Add unit" variant="ghost" size="sm" icon="add" onPress={addUnit} fullWidth={false} />
          }
        >
          Selling units
        </SectionTitle>
        <Text variant="caption" tone="muted">
          One unit is the base unit (what stock and cost are counted in). Example: 1 carton = 12 packs,
          so the carton has 12 units per base.
        </Text>

        {units.map((unit, index) => (
          <View
            key={unit.id ?? `new-${index}`}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: unit.isBase ? theme.colors.accent : theme.colors.border,
              padding: theme.space(3),
              gap: theme.space(3),
            }}
          >
            <View style={{ flexDirection: 'row', gap: theme.space(2), alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Unit name"
                  value={unit.unitName}
                  onChangeText={(value) => updateUnit(index, { unitName: value })}
                  placeholder="e.g. Carton"
                  autoCapitalize="words"
                />
              </View>
              {units.length > 1 ? (
                <Pressable
                  onPress={() => removeUnit(index)}
                  accessibilityLabel="Remove unit"
                  style={({ pressed }) => ({
                    width: 44,
                    height: 44,
                    borderRadius: theme.radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? theme.colors.dangerSoft : theme.colors.surfaceAlt,
                    marginBottom: 2,
                  })}
                >
                  <Ionicons name="close" size={18} color={theme.colors.danger} />
                </Pressable>
              ) : null}
            </View>

            <Input
              label="Barcode (optional)"
              value={unit.barcode ?? ''}
              onChangeText={(value) => updateUnit(index, { barcode: value })}
              placeholder="Scan or type this unit's barcode"
              autoCapitalize="none"
              autoCorrect={false}
              rightAccessory={
                <Pressable
                  onPress={() => {
                    setScannerUnit(index);
                    setScannerOpen(true);
                  }}
                  accessibilityLabel="Scan barcode"
                  hitSlop={8}
                  style={({ pressed }) => ({
                    width: 40,
                    height: 40,
                    borderRadius: theme.radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.accentSoft,
                  })}
                >
                  <Ionicons name="barcode-outline" size={22} color={theme.colors.accent} />
                </Pressable>
              }
            />

            <View style={{ flexDirection: 'row', gap: theme.space(3) }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Units per base"
                  value={String(unit.unitsPerBase)}
                  onChangeText={(value) =>
                    updateUnit(index, {
                      unitsPerBase: Math.max(1, Number.parseInt(value.replace(/\D/g, ''), 10) || 1),
                    })
                  }
                  keyboardType="number-pad"
                  placeholder="1"
                />
              </View>
              <View style={{ flex: 1.4 }}>
                <MoneyInput
                  label="Selling price"
                  value={unit.sellingPrice}
                  onChangeKobo={(value) => updateUnit(index, { sellingPrice: value })}
                />
              </View>
            </View>

            <Pressable
              onPress={() => makeBase(index)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 40,
                paddingHorizontal: 10,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: unit.isBase ? theme.colors.accent : theme.colors.border,
                backgroundColor: unit.isBase ? theme.colors.accentSoft : 'transparent',
                alignSelf: 'flex-start',
              }}
            >
              <Ionicons
                name={unit.isBase ? 'radio-button-on' : 'radio-button-off'}
                size={17}
                color={unit.isBase ? theme.colors.accent : theme.colors.textFaint}
              />
              <Text variant="label" tone={unit.isBase ? 'accent' : 'muted'}>
                Base unit (stock is counted here)
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {!isNew && historyEntries.length > 0 ? (
        <View style={{ gap: theme.space(2) }}>
          <SectionTitle>Stock history</SectionTitle>
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: 'hidden',
            }}
          >
            {historyEntries.map((movement, index) => (
              <View
                key={movement.id}
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
                <Ionicons
                  name={
                    movement.type === 'sale'
                      ? 'arrow-down'
                      : movement.type === 'restock'
                        ? 'arrow-up'
                        : 'swap-horizontal'
                  }
                  size={17}
                  color={movement.quantityBase >= 0 ? theme.colors.success : theme.colors.danger}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">
                    {movement.type === 'sale'
                      ? 'Sold'
                      : movement.type === 'restock'
                        ? 'Restock'
                        : 'Adjustment'}
                    {movement.quantityBase > 0 ? ` +${movement.quantityBase}` : ` ${movement.quantityBase}`}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {formatDateTime(movement.createdAt)}
                    {movement.note ? ` · ${movement.note}` : ''}
                  </Text>
                </View>
                {movement.unitCost > 0 ? (
                  <Text variant="caption" tone="faint">
                    {formatMoney(movement.unitCost)}/unit
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!isNew ? (
        <>
          <RestockSheet
            visible={restockOpen}
            onClose={() => setRestockOpen(false)}
            actor={actor}
            itemId={itemId}
            itemName={name}
            units={units.map((unit) => ({
              id: unit.id ?? '',
              unitName: unit.unitName || 'Single',
              unitsPerBase: unit.unitsPerBase ?? 1,
              sellingPrice: unit.sellingPrice ?? 0,
            }))}
          />
          <AdjustSheet
            visible={adjustOpen}
            onClose={() => setAdjustOpen(false)}
            actor={actor}
            itemId={itemId}
            itemName={name}
            units={units.map((unit) => ({
              id: unit.id ?? '',
              unitName: unit.unitName || 'Single',
              unitsPerBase: unit.unitsPerBase ?? 1,
              sellingPrice: unit.sellingPrice ?? 0,
            }))}
          />
        </>
      ) : null}

      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleUnitScan}
        hint="Scan this unit's barcode"
      />
    </Screen>
  );
}

type SimpleUnit = { id: string; unitName: string; unitsPerBase: number; sellingPrice: number };

function RestockSheet({
  visible,
  onClose,
  actor,
  itemId,
  itemName,
  units,
}: {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
  itemId: string;
  itemName: string;
  units: SimpleUnit[];
}) {
  const theme = useTheme();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [totalCost, setTotalCost] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setUnitId(units.find((unit) => unit.unitsPerBase === 1)?.id ?? units[0]?.id ?? null);
      setQuantity(1);
      setTotalCost(0);
      setNote('');
      setError(null);
    }
  }, [visible, units]);

  const selected = units.find((unit) => unit.id === unitId) ?? units[0];
  const quantityBase = quantity * (selected?.unitsPerBase ?? 1);
  const perBase = quantityBase > 0 ? Math.round(totalCost / quantityBase) : 0;

  const submit = async () => {
    if (quantityBase <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordRestock(actor, {
        itemId,
        quantityBase,
        unitCost: perBase,
        note: note.trim() || undefined,
      });
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
      title="Restock"
      subtitle={itemName}
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button
            label={`Add ${quantityBase} base unit${quantityBase === 1 ? '' : 's'} to stock`}
            onPress={() => void submit()}
            loading={saving}
            icon="arrow-up"
          />
        </View>
      }
    >
      <View style={{ gap: theme.space(4) }}>
        {units.length > 1 ? (
          <View style={{ gap: theme.space(2) }}>
            <Text variant="label" tone="muted">
              Received as
            </Text>
            <ChipRow
              size="sm"
              options={units.map((unit) => ({
                value: unit.id,
                label: unit.unitName,
                meta: `${unit.unitsPerBase}`,
              }))}
              value={unitId}
              onChange={setUnitId}
            />
          </View>
        ) : null}

        <View style={{ gap: theme.space(2) }}>
          <Text variant="label" tone="muted">
            Quantity
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="body" tone="muted">
              in {selected?.unitName.toLowerCase() ?? 'units'}
            </Text>
            <Stepper value={quantity} onChange={setQuantity} min={1} />
          </View>
        </View>

        <MoneyInput
          label="Total cost for this delivery"
          value={totalCost}
          onChangeKobo={setTotalCost}
          preview
          hint="We will work out the cost per base unit for you"
        />

        <View
          style={{
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.md,
            padding: theme.space(3),
            gap: 4,
          }}
        >
          <Text variant="caption" tone="muted">
            Adds <Text variant="caption" tone="accent" style={{ fontFamily: theme.font.semibold }}>{quantityBase}</Text> base
            unit{quantityBase === 1 ? '' : 's'} to stock
          </Text>
          <Text variant="caption" tone="muted">
            Cost per base unit: {formatMoney(perBase)}
          </Text>
        </View>

        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Delivery note, supplier…" />
      </View>
    </Sheet>
  );
}

function AdjustSheet({
  visible,
  onClose,
  actor,
  itemId,
  itemName,
  units,
}: {
  visible: boolean;
  onClose: () => void;
  actor: ActingUser;
  itemId: string;
  itemName: string;
  units: SimpleUnit[];
}) {
  const theme = useTheme();
  const [direction, setDirection] = useState<'add' | 'remove'>('remove');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDirection('remove');
      setUnitId(units.find((unit) => unit.unitsPerBase === 1)?.id ?? units[0]?.id ?? null);
      setQuantity(1);
      setReason('');
      setError(null);
    }
  }, [visible, units]);

  const selected = units.find((unit) => unit.id === unitId) ?? units[0];
  const signedBase = quantity * (selected?.unitsPerBase ?? 1) * (direction === 'remove' ? -1 : 1);

  const submit = async () => {
    if (!reason.trim()) {
      setError('Give a reason (damage, expiry, stocktake…).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordAdjustment(actor, { itemId, quantityBase: signedBase, reason: reason.trim() });
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
      title="Stock adjustment"
      subtitle={itemName}
      dismissable={!saving}
      footer={
        <View style={{ gap: theme.space(2) }}>
          {error ? (
            <Text variant="label" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button
            label={`${signedBase > 0 ? 'Add' : 'Remove'} ${Math.abs(signedBase)} base unit${Math.abs(signedBase) === 1 ? '' : 's'}`}
            onPress={() => void submit()}
            loading={saving}
          />
        </View>
      }
    >
      <View style={{ gap: theme.space(4) }}>
        <View style={{ gap: theme.space(2) }}>
          <Text variant="label" tone="muted">
            Adjustment type
          </Text>
          <ChipRow
            options={[
              { value: 'remove', label: 'Remove stock' },
              { value: 'add', label: 'Add stock' },
            ]}
            value={direction}
            onChange={setDirection}
          />
        </View>

        {units.length > 1 ? (
          <View style={{ gap: theme.space(2) }}>
            <Text variant="label" tone="muted">
              In unit
            </Text>
            <ChipRow
              size="sm"
              options={units.map((unit) => ({ value: unit.id, label: unit.unitName }))}
              value={unitId}
              onChange={setUnitId}
            />
          </View>
        ) : null}

        <View style={{ gap: theme.space(2) }}>
          <Text variant="label" tone="muted">
            Quantity
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="body" tone="muted">
              in {selected?.unitName.toLowerCase() ?? 'units'}
            </Text>
            <Stepper value={quantity} onChange={setQuantity} min={1} />
          </View>
        </View>

        <Input
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Damaged packaging, stocktake count"
        />
      </View>
    </Sheet>
  );
}
