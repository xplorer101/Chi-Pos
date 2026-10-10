import React from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type Props = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  /** Sticky bottom action bar (e.g. Complete sale). */
  footer?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra space at the bottom of the scroller. */
  bottomInset?: number;
};

export function Screen({
  title,
  subtitle,
  onBack,
  right,
  children,
  scroll = true,
  footer,
  contentStyle,
  bottomInset = 24,
}: Props) {
  const theme = useTheme();

  const header =
    title || onBack || right ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space(3),
          paddingHorizontal: theme.space(4),
          paddingTop: theme.space(3),
          paddingBottom: theme.space(3),
          minHeight: 56,
        }}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: theme.radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceAlt,
            })}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          {title ? (
            <Text variant="heading" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[
        { paddingHorizontal: theme.space(4), paddingBottom: bottomInset, gap: theme.space(4) },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingHorizontal: theme.space(4) }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['top', 'left', 'right']}>
      {header}
      <View style={{ flex: 1 }}>{body}</View>
      {footer ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.space(4),
            paddingVertical: theme.space(3),
            paddingBottom: theme.space(4),
            gap: theme.space(2),
          }}
        >
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
