import React from 'react';
import {
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from '@/theme/theme';

type Variant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyMedium'
  | 'label'
  | 'caption'
  | 'overline'
  | 'money'
  | 'moneyLarge'
  | 'moneySmall';

type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'success' | 'warning' | 'onPrimary';

type Props = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
};

export function Text({ variant = 'body', tone = 'default', center, style, children, ...rest }: Props) {
  const theme = useTheme();

  const fontKey =
    variant === 'display' || variant === 'title' || variant === 'moneyLarge'
      ? 'bold'
      : variant === 'heading' || variant === 'subheading' || variant === 'money' || variant === 'moneySmall' || variant === 'overline'
        ? 'semibold'
        : variant === 'label' || variant === 'bodyMedium'
          ? 'medium'
          : 'regular';

  const sizes: Record<Variant, { fontSize: number; lineHeight: number; letterSpacing?: number }> = {
    display: { fontSize: 30, lineHeight: 36 },
    title: { fontSize: 23, lineHeight: 30 },
    heading: { fontSize: 19, lineHeight: 25 },
    subheading: { fontSize: 16, lineHeight: 22 },
    body: { fontSize: 15, lineHeight: 21 },
    bodyMedium: { fontSize: 15, lineHeight: 21 },
    label: { fontSize: 13, lineHeight: 18 },
    caption: { fontSize: 12, lineHeight: 16 },
    overline: { fontSize: 11, lineHeight: 14, letterSpacing: 0.6 },
    money: { fontSize: 17, lineHeight: 22 },
    moneyLarge: { fontSize: 27, lineHeight: 33 },
    moneySmall: { fontSize: 14, lineHeight: 19 },
  };

  const toneColor: Record<Tone, string> = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    faint: theme.colors.textFaint,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    success: theme.colors.success,
    warning: theme.colors.warning,
    onPrimary: theme.colors.onPrimary,
  };

  const size = sizes[variant];
  const isMoney = variant.startsWith('money');

  return (
    <RNText
      {...rest}
      style={[
        {
          fontSize: size.fontSize,
          lineHeight: size.lineHeight,
          fontFamily: theme.font[fontKey],
          fontWeight: fontKey === 'regular' ? '400' : undefined,
          color: toneColor[tone],
          textAlign: center ? 'center' : undefined,
          fontVariant: isMoney ? ['tabular-nums'] : undefined,
          ...(variant === 'overline' ? { textTransform: 'uppercase' as const } : null),
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
