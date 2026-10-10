import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Renders a stronger surface (used for summary panels). */
  tone?: 'default' | 'alt';
};

export function Card({ children, style, padded = true, tone = 'default' }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: tone === 'alt' ? theme.colors.surfaceAlt : theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: padded ? theme.space(4) : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
