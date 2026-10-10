import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  compact?: boolean;
};

export function Stepper({ value, onChange, min = 1, max, step = 1, compact }: Props) {
  const theme = useTheme();
  const size = compact ? 36 : 44;
  const canDecrease = value - step >= min;
  const canIncrease = max == null || value + step <= max;

  const buttonStyle = (enabled: boolean, pressed: boolean) => ({
    width: size,
    height: size,
    borderRadius: theme.radius.sm,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: !enabled
      ? theme.colors.surfaceAlt
      : pressed
        ? theme.colors.surfacePressed
        : theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    opacity: enabled ? 1 : 0.5,
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
    >
      <Pressable
        disabled={!canDecrease}
        accessibilityLabel="Decrease quantity"
        onPress={() => canDecrease && onChange(value - step)}
        style={({ pressed }) => buttonStyle(canDecrease, pressed)}
      >
        <Ionicons name="remove" size={compact ? 18 : 22} color={theme.colors.text} />
      </Pressable>
      <View style={{ minWidth: compact ? 40 : 52, alignItems: 'center' }}>
        <Text variant="bodyMedium" style={{ fontFamily: theme.font.semibold }}>
          {value}
        </Text>
      </View>
      <Pressable
        disabled={!canIncrease}
        accessibilityLabel="Increase quantity"
        onPress={() => canIncrease && onChange(value + step)}
        style={({ pressed }) => buttonStyle(canIncrease, pressed)}
      >
        <Ionicons name="add" size={compact ? 18 : 22} color={theme.colors.text} />
      </Pressable>
    </View>
  );
}
