import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  icon,
  iconPosition = 'left',
  fullWidth = true,
  style,
  testID,
}: Props) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const heights: Record<Size, number> = { sm: 40, md: 48, lg: 56 };
  const fontSizes: Record<Size, number> = { sm: 14, md: 16, lg: 17 };

  const palette: Record<Variant, { bg: string; border?: string; fg: string; pressed: string }> = {
    primary: {
      bg: theme.colors.primary,
      fg: theme.colors.onPrimary,
      pressed: theme.colors.primaryPressed,
    },
    secondary: {
      bg: theme.colors.surfaceAlt,
      border: theme.colors.border,
      fg: theme.colors.text,
      pressed: theme.colors.surfacePressed,
    },
    outline: {
      bg: 'transparent',
      border: theme.colors.borderStrong,
      fg: theme.colors.text,
      pressed: theme.colors.surfacePressed,
    },
    ghost: {
      bg: 'transparent',
      fg: theme.colors.accent,
      pressed: theme.colors.surfaceAlt,
    },
    danger: {
      bg: theme.colors.danger,
      fg: theme.colors.onDanger,
      pressed: theme.colors.dangerSoft,
    },
  };

  const colors = palette[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: heights[size],
          paddingHorizontal: theme.space(size === 'sm' ? 3 : 4),
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? colors.pressed : colors.bg,
          borderWidth: colors.border ? 1 : 0,
          borderColor: colors.border,
          opacity: isDisabled ? 0.45 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        fullWidth ? { alignSelf: 'stretch' } : null,
        style,
      ]}
    >
      {icon && iconPosition === 'left' ? (
        <Ionicons name={icon} size={fontSizes[size] + 3} color={colors.fg} />
      ) : null}
      <Text
        style={{
          fontFamily: theme.font.semibold,
          fontSize: fontSizes[size],
          lineHeight: fontSizes[size] + 6,
          color: colors.fg,
        }}
      >
        {loading ? 'Please wait…' : label}
      </Text>
      {icon && iconPosition === 'right' ? (
        <Ionicons name={icon} size={fontSizes[size] + 3} color={colors.fg} />
      ) : null}
    </Pressable>
  );
}
