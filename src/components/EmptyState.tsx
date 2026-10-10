import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/theme';
import { Button } from './Button';
import { Text } from './Text';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  style,
}: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: theme.space(10),
          paddingHorizontal: theme.space(6),
          gap: theme.space(2),
        },
        style,
      ]}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: theme.space(2),
        }}
      >
        <Ionicons name={icon} size={28} color={theme.colors.accent} />
      </View>
      <Text variant="heading" center>
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" center>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.space(4), alignSelf: 'stretch' }}>
          <Button label={actionLabel} onPress={onAction} icon="add" />
        </View>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <View style={{ marginTop: theme.space(2), alignSelf: 'stretch' }}>
          <Button label={secondaryLabel} onPress={onSecondary} variant="ghost" />
        </View>
      ) : null}
    </View>
  );
}
