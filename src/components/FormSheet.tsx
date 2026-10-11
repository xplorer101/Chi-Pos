import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
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
  footer?: React.ReactNode;
};

export function FormSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  dismissable = true,
  footer,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'android' ? 'height' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          style={{ justifyContent: 'flex-end', maxHeight: '90%' }}
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
              maxHeight: '100%',
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
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: theme.space(4), gap: theme.space(4) }}
              showsVerticalScrollIndicator={false}
              style={{ flexShrink: 1 }}
            >
              {children}
            </ScrollView>
            {footer}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
