import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Disallow dismissing by tapping the backdrop (used while committing). */
  dismissable?: boolean;
  /** Scroll the body instead of clipping it. */
  scroll?: boolean;
  footer?: React.ReactNode;
};

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  dismissable = true,
  scroll = true,
  footer,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: theme.space(4), gap: theme.space(4) }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ gap: theme.space(4), paddingBottom: theme.space(4) }}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={dismissable ? onClose : undefined}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: theme.colors.scrim, justifyContent: 'flex-end' }}
        onPress={dismissable ? onClose : undefined}
      >
        <Pressable
          onPress={(event) => event.stopPropagation?.()}
          style={{
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
            paddingHorizontal: theme.space(4),
            paddingTop: theme.space(3),
            paddingBottom: insets.bottom + theme.space(4),
            maxHeight: '88%',
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.borderStrong,
              alignSelf: 'center',
              marginBottom: theme.space(3),
            }}
          />
          {title ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space(3),
                marginBottom: theme.space(3),
              }}
            >
              <View style={{ flex: 1 }}>
                {title ? <Text variant="heading">{title}</Text> : null}
                {subtitle ? (
                  <Text variant="caption" tone="muted">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {dismissable ? (
                <Pressable
                  onPress={onClose}
                  accessibilityLabel="Close"
                  hitSlop={10}
                  style={({ pressed }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: theme.radius.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceAlt,
                  })}
                >
                  <Ionicons name="close" size={20} color={theme.colors.text} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {body}
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
