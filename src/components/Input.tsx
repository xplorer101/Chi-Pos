import React, { useEffect, useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { formatMoney, parseMoneyToKobo } from '@/lib/money';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

type BaseProps = {
  label?: string;
  error?: string | null;
  hint?: string;
  containerStyle?: StyleProp<Record<string, unknown>>;
  style?: StyleProp<TextStyle>;
  /** Rendered inside the field, after the text (e.g. a scan button). */
  rightAccessory?: React.ReactNode;
} & Omit<TextInputProps, 'style'>;

export function Input({ label, error, hint, containerStyle, style, rightAccessory, ...rest }: BaseProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border;

  const textStyle: StyleProp<TextStyle> = [
    { color: theme.colors.text, fontSize: 16, lineHeight: 22 },
    rest.multiline ? { minHeight: 96, textAlignVertical: 'top' as const } : null,
    style as StyleProp<TextStyle>,
  ];

  const handleFocus = (event: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
    setFocused(true);
    rest.onFocus?.(event);
  };

  const handleBlur = (event: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
    setFocused(false);
    rest.onBlur?.(event);
  };

  return (
    <View style={[{ gap: 6 }, containerStyle as StyleProp<TextStyle>]}>
      {label ? <Text variant="label" tone="muted">{label}</Text> : null}
      {rightAccessory ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: theme.tapTarget,
            paddingHorizontal: theme.space(3),
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor,
            backgroundColor: theme.colors.surface,
          }}
        >
          <TextInput
            {...rest}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholderTextColor={theme.colors.textFaint}
            style={[{ flex: 1, paddingVertical: theme.space(3) }, textStyle]}
          />
          {rightAccessory}
        </View>
      ) : (
        <TextInput
          {...rest}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={theme.colors.textFaint}
          style={[
            {
              minHeight: theme.tapTarget,
              paddingHorizontal: theme.space(3),
              paddingVertical: theme.space(3),
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor,
              backgroundColor: theme.colors.surface,
            },
            textStyle,
          ]}
        />
      )}
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function koboToInputText(kobo: number): string {
  const safe = Number.isFinite(kobo) ? Math.round(kobo) : 0;
  const abs = Math.abs(safe);
  const naira = Math.floor(abs / 100);
  const sub = abs % 100;
  const base = sub === 0 ? String(naira) : `${naira}.${String(sub).padStart(2, '0')}`;
  return safe < 0 ? `-${base}` : base;
}

type MoneyInputProps = {
  label?: string;
  /** Value in kobo. */
  value: number;
  onChangeKobo: (kobo: number) => void;
  error?: string | null;
  hint?: string;
  containerStyle?: StyleProp<Record<string, unknown>>;
  placeholder?: string;
  editable?: boolean;
  /** Show the running ₦ preview under the field. */
  preview?: boolean;
};

/** Numeric money field. The user types naira; the app stores kobo. */
export function MoneyInput({
  label,
  value,
  onChangeKobo,
  error,
  hint,
  containerStyle,
  placeholder = '0',
  editable = true,
  preview = false,
}: MoneyInputProps) {
  const theme = useTheme();
  const [text, setText] = useState(() => koboToInputText(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(koboToInputText(value));
  }, [value, focused]);

  return (
    <View style={[{ gap: 6 }, containerStyle as StyleProp<TextStyle>]}>
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: theme.tapTarget,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: error
            ? theme.colors.danger
            : focused
              ? theme.colors.accent
              : theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: theme.space(3),
          gap: 6,
        }}
      >
        <Text variant="bodyMedium" tone="muted">
          ₦
        </Text>
        <TextInput
          value={text}
          editable={editable}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textFaint}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(koboToInputText(value));
          }}
          onChangeText={(next) => {
            setText(next);
            onChangeKobo(parseMoneyToKobo(next));
          }}
          style={{
            flex: 1,
            color: theme.colors.text,
            fontSize: 16,
            lineHeight: 22,
            paddingVertical: theme.space(3),
          }}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : preview ? (
        <Text variant="caption" tone="faint">
          {formatMoney(value)}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function KeyboardTypeHint(_type: KeyboardTypeOptions) {}

type SearchInputProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export function SearchInput({ value, onChange, placeholder = 'Search', autoFocus }: SearchInputProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: theme.tapTarget,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.space(3),
        gap: 8,
      }}
    >
      <Ionicons name="search" size={18} color={theme.colors.textFaint} />
      <TextInput
        value={value}
        autoFocus={autoFocus}
        autoCorrect={false}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        returnKeyType="search"
        style={{
          flex: 1,
          color: theme.colors.text,
          fontSize: 16,
          lineHeight: 22,
          paddingVertical: theme.space(3),
        }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={theme.colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}
