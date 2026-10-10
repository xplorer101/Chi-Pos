import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type Tone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success';

type Props = {
  label: string;
  tone?: Tone;
  /** Renders as a small dot + text instead of a pill. */
  subtle?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone = 'neutral', subtle, style }: Props) {
  const theme = useTheme();

  const palette: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.textMuted },
    accent: { bg: theme.colors.accentSoft, fg: theme.colors.accent },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warning },
    success: { bg: theme.colors.successSoft, fg: theme.colors.success },
  };
  const colors = palette[tone];

  if (subtle) {
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 5 }, style]}>
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: colors.fg,
          }}
        />
        <Text variant="caption" tone={tone === 'neutral' ? 'muted' : tone}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: colors.bg,
          borderRadius: theme.radius.pill,
          paddingHorizontal: 9,
          paddingVertical: 3,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text
        variant="caption"
        style={{ color: colors.fg, fontFamily: theme.font.semibold }}
      >
        {label}
      </Text>
    </View>
  );
}
