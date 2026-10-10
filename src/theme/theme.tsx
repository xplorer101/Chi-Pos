import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';

export type ThemeColors = {
  dark: boolean;
  /** App background behind cards. */
  bg: string;
  /** Default card / row surface. */
  surface: string;
  /** Slightly recessed surface (inputs, chips). */
  surfaceAlt: string;
  /** Stronger surface for pressed states. */
  surfacePressed: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Filled buttons and primary surfaces. */
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  /** Cyan accent for text, icons and outlines. */
  accent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  scrim: string;
  /** Tab bar background. */
  tabBar: string;
};

export type Theme = {
  colors: ThemeColors;
  space: (steps?: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  font: {
    regular?: string;
    medium?: string;
    semibold?: string;
    bold?: string;
  };
  /** True once the bundled Inter faces are registered with the native layer. */
  fontsReady: boolean;
  /** Minimum size for interactive controls (cashiers tap fast). */
  tapTarget: number;
};

const FONT_FILES = {
  regular: require('../../assets/fonts/Inter-Regular.ttf'),
  medium: require('../../assets/fonts/Inter-Medium.ttf'),
  semibold: require('../../assets/fonts/Inter-SemiBold.ttf'),
  bold: require('../../assets/fonts/Inter-Bold.ttf'),
};

const FONT_ALIASES = {
  regular: 'Inter',
  medium: 'InterMedium',
  semibold: 'InterSemiBold',
  bold: 'InterBold',
};

const lightColors: ThemeColors = {
  dark: false,
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F4',
  surfacePressed: '#E4E9EE',
  border: '#DFE4EA',
  borderStrong: '#C9D1DA',
  text: '#10161D',
  textMuted: '#566272',
  textFaint: '#8792A1',
  primary: '#0E7490',
  primaryPressed: '#0A5A72',
  onPrimary: '#FFFFFF',
  accent: '#0E7490',
  accentSoft: '#E2F1F6',
  danger: '#B3261E',
  dangerSoft: '#FBEAE9',
  onDanger: '#FFFFFF',
  warning: '#A65B00',
  warningSoft: '#FDF1E0',
  success: '#0B6E4F',
  successSoft: '#E3F3ED',
  scrim: 'rgba(16, 22, 29, 0.45)',
  tabBar: '#FFFFFF',
};

const darkColors: ThemeColors = {
  dark: true,
  bg: '#0E1317',
  surface: '#171D23',
  surfaceAlt: '#1F272F',
  surfacePressed: '#27313A',
  border: '#2A333C',
  borderStrong: '#3A4552',
  text: '#E9EDF2',
  textMuted: '#A2ADB9',
  textFaint: '#77828F',
  primary: '#0E7490',
  primaryPressed: '#0A5A72',
  onPrimary: '#FFFFFF',
  accent: '#4FC3DE',
  accentSoft: '#12313A',
  danger: '#E8776F',
  dangerSoft: '#331B1A',
  onDanger: '#1A0B0A',
  warning: '#E8B25C',
  warningSoft: '#33270F',
  success: '#5CCB9E',
  successSoft: '#0F2E24',
  scrim: 'rgba(2, 6, 10, 0.6)',
  tabBar: '#141A20',
};

function buildTheme(colors: ThemeColors, fontsReady: boolean): Theme {
  return {
    colors,
    space: (steps = 1) => steps * 4,
    radius: { sm: 6, md: 10, lg: 14, pill: 999 },
    font: fontsReady
      ? {
          regular: FONT_ALIASES.regular,
          medium: FONT_ALIASES.medium,
          semibold: FONT_ALIASES.semibold,
          bold: FONT_ALIASES.bold,
        }
      : {},
    fontsReady,
    tapTarget: 48,
  };
}

const ThemeContext = createContext<Theme>(buildTheme(lightColors, false));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const fontsReady = fontsLoaded || fontError !== null;

  const colors = scheme === 'dark' ? darkColors : lightColors;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  const theme = useMemo(() => buildTheme(colors, fontsReady), [colors, fontsReady]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
