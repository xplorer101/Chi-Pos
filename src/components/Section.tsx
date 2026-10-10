import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

export function SectionTitle({
  children,
  action,
  style,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space(3),
          marginTop: theme.space(2),
        },
        style,
      ]}
    >
      <Text variant="overline" tone="muted" style={{ flex: 1 }}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export function KeyValueRow({
  label,
  value,
  tone = 'default',
  emphasise,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'accent' | 'danger' | 'success' | 'onPrimary' | 'faint' | 'warning';
  emphasise?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: theme.space(3),
        paddingVertical: 5,
      }}
    >
      <Text variant={emphasise ? 'subheading' : 'body'} tone={emphasise ? 'default' : 'muted'}>
        {label}
      </Text>
      <Text
        variant={emphasise ? 'subheading' : 'body'}
        tone={tone}
        style={{ fontFamily: emphasise ? theme.font.bold : theme.font.semibold, textAlign: 'right' }}
      >
        {value}
      </Text>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.space(3) },
        style,
      ]}
    />
  );
}
