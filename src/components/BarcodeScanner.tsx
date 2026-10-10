import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/Text';
import { Toast } from '@/components/Toast';
import { useTheme } from '@/theme/theme';

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  hint?: string;
  continuous?: boolean;
  onContinuousChange?: (next: boolean) => void;
};

export function BarcodeScanner({
  visible,
  onClose,
  onScan,
  hint = 'Point the camera at a barcode',
  continuous = false,
  onContinuousChange,
}: Props) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const lockedRef = useRef(false);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      lockedRef.current = false;
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      setTorch(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const handleScan = (data: string) => {
    if (lockedRef.current || !data) return;
    lockedRef.current = true;
    onScan(data);
    if (!continuous) onClose();
    cooldownRef.current = setTimeout(() => {
      lockedRef.current = false;
    }, 1500);
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
            onBarcodeScanned={(event) => handleScan(event.data)}
          />
        ) : (
          <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
            <Ionicons name="camera-outline" size={40} color="#FFFFFF" />
            <Text variant="subheading" tone="onPrimary" center>
              Camera access is needed to scan barcodes
            </Text>
            <Pressable
              onPress={() => void requestPermission()}
              style={{
                marginTop: 8,
                paddingHorizontal: 20,
                minHeight: 48,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="label" tone="onPrimary" style={{ fontFamily: theme.font.semibold }}>
                Grant permission
              </Text>
            </Pressable>
          </SafeAreaView>
        )}

        {/* Scrim + reticle */}
        <View pointerEvents="none" style={{ ...StyleSheetAbsolute }}>
          <View
            style={{
              position: 'absolute',
              top: '30%',
              alignSelf: 'center',
              width: 240,
              height: 160,
              borderWidth: 3,
              borderColor: theme.colors.primary,
              borderRadius: theme.radius.lg,
              backgroundColor: 'transparent',
            }}
          />
        </View>

        <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: theme.space(4),
              paddingVertical: theme.space(3),
              gap: theme.space(3),
            }}
          >
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close scanner"
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: theme.radius.md,
                backgroundColor: pressed ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="onPrimary" center>
                {hint}
              </Text>
            </View>
            {onContinuousChange ? (
              <Pressable
                onPress={() => onContinuousChange(!continuous)}
                accessibilityLabel="Toggle continuous scanning"
                accessibilityState={{ selected: continuous }}
                style={({ pressed }) => ({
                  height: 44,
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: continuous ? 12 : 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                  backgroundColor: continuous
                    ? theme.colors.primary
                    : pressed
                      ? 'rgba(255,255,255,0.25)'
                      : 'rgba(0,0,0,0.45)',
                })}
              >
                <Ionicons
                  name="infinite"
                  size={20}
                  color={continuous ? theme.colors.onPrimary : '#FFFFFF'}
                />
                {continuous ? (
                  <Text variant="label" tone="onPrimary">
                    Continuous
                  </Text>
                ) : null}
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setTorch((value) => !value)}
              accessibilityLabel="Toggle flashlight"
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: theme.radius.md,
                backgroundColor: torch
                  ? theme.colors.primary
                  : pressed
                    ? 'rgba(255,255,255,0.25)'
                    : 'rgba(0,0,0,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Ionicons name="flashlight" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </SafeAreaView>

        <Toast position="bottom" />
      </View>
    </Modal>
  );
}

const StyleSheetAbsolute = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.35)',
};
