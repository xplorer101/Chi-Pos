import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { ChipRow } from '@/components/ChipRow';
import { MoneyInput } from '@/components/Input';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { formatMoney } from '@/lib/money';
import type { ItemUnit } from '@/db/types';
import { useTheme } from '@/theme/theme';

import type { CartLine } from './sellStore';

type Props = {
  line: CartLine;
  units: ItemUnit[];
  onChangeUnit: (unit: ItemUnit) => void;
  onChangeQuantity: (quantity: number) => void;
  onChangePrice: (kobo: number) => void;
  onRemove: () => void;
};

export function CartLineCard({ line, units, onChangeUnit, onChangeQuantity, onChangePrice, onRemove }: Props) {
  const theme = useTheme();

  const quantityBase = line.quantity * line.unitsPerBase;
  const projected = line.stock - quantityBase;
  const warning: string | null = !line.tracksStock
    ? null
    : projected < 0
      ? `Stock will go to ${projected}`
      : line.lowStockLevel > 0 && projected <= line.lowStockLevel
        ? `Only ${projected} left after this`
        : null;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.space(3),
        gap: theme.space(3),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space(2) }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading" numberOfLines={2}>
            {line.itemName}
          </Text>
          <Text variant="caption" tone="muted">
            {formatMoney(line.unitPrice)} per {line.unitName.toLowerCase()}
            {line.unitsPerBase > 1 ? ` · ${line.unitsPerBase} units each` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityLabel={`Remove ${line.itemName}`}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 34,
            height: 34,
            borderRadius: theme.radius.sm,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.colors.dangerSoft : theme.colors.surfaceAlt,
          })}
        >
          <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
        </Pressable>
      </View>

      {units.length > 1 ? (
        <ChipRow
          size="sm"
          options={units.map((unit) => ({
            value: unit.id,
            label: unit.unitName,
            meta: formatMoney(unit.sellingPrice),
          }))}
          value={line.unitId}
          onChange={(unitId) => {
            const next = units.find((unit) => unit.id === unitId);
            if (next) onChangeUnit(next);
          }}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Badge label={line.unitName} tone="accent" />
        </View>
      )}

      <MoneyInput
        label="Unit price"
        value={line.unitPrice}
        onChangeKobo={onChangePrice}
        hint="Price for this sale (unit cost is still recorded)"
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Stepper
          value={line.quantity}
          onChange={onChangeQuantity}
          min={1}
          compact
        />
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="money" style={{ fontFamily: theme.font.bold }}>
            {formatMoney(line.quantity * line.unitPrice)}
          </Text>
          <Text variant="caption" tone="muted">
            {quantityBase} base unit{quantityBase === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {warning ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: theme.colors.warningSoft,
            borderRadius: theme.radius.sm,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Ionicons name="alert-circle-outline" size={15} color={theme.colors.warning} />
          <Text variant="caption" tone="warning" style={{ flex: 1 }}>
            {warning}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
