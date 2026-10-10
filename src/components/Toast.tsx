import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type ToastState = {
  key: number;
  message: string;
};

const useToastStore = create<ToastState>(() => ({ key: 0, message: '' }));

export function showToast(message: string): void {
  useToastStore.setState((state) => ({ key: state.key + 1, message }));
}

const TOAST_DURATION_MS = 2200;

export function Toast({ position = 'top' }: { position?: 'top' | 'bottom' }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const key = useToastStore((state) => state.key);
  const message = useToastStore((state) => state.message);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (key === 0) return;
    setVisible(true);
    const handle = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    return () => clearTimeout(handle);
  }, [key]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1000,
        alignItems: 'center',
        top: position === 'top' ? insets.top + theme.space(3) : undefined,
        bottom: position === 'bottom' ? insets.bottom + theme.space(6) : undefined,
      }}
    >
      <View
        style={{
          maxWidth: '85%',
          backgroundColor: theme.colors.text,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(3),
        }}
      >
        <Text variant="label" style={{ color: theme.colors.bg }} center>
          {message}
        </Text>
      </View>
    </View>
  );
}