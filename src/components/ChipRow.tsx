import React from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  /** Small trailing badge, e.g. stock level. */
  meta?: string;
};

type Props<T extends string> = {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Horizontal scroller (default) or a wrapped grid. */
  layout?: 'scroll' | 'wrap';
  size?: 'sm' | 'md';
  allowEmpty?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  layout = 'scroll',
  size = 'md',
  allowEmpty = false,
  style,
}: Props<T>) {
  const theme = useTheme();
  const minHeight = size === 'sm' ? 34 : theme.tapTarget - 6;
  const paddingHorizontal = size === 'sm' ? 12 : 16;

  const chips = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => onChange(selected && allowEmpty ? (null as unknown as T) : option.value)}
        style={({ pressed }) => ({
          minHeight,
          paddingHorizontal,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          backgroundColor: selected
            ? theme.colors.primary
            : pressed
              ? theme.colors.surfacePressed
              : theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 6,
        })}
      >
        <Text
          variant={size === 'sm' ? 'caption' : 'label'}
          style={{
            fontFamily: theme.font.semibold,
            color: selected ? theme.colors.onPrimary : theme.colors.text,
          }}
        >
          {option.label}
        </Text>
        {option.meta ? (
          <Text
            variant="caption"
            style={{
              color: selected ? theme.colors.onPrimary : theme.colors.textFaint,
            }}
          >
            {option.meta}
          </Text>
        ) : null}
      </Pressable>
    );
  });

  if (layout === 'wrap') {
    return (
      <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }, style]}>
        {chips}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[{ gap: theme.space(2), paddingVertical: 2 }, style]}
    >
      {chips}
    </ScrollView>
  );
}
