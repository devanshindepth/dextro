/**
 * Dextro Theme System
 * Vercel-inspired monochromatic, high-contrast aesthetic.
 * Supports dark (default) and light mode via ThemeContext.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Dark Colors ──────────────────────────────────────────────────────────────
const darkColors = {
  background: '#0a0a0a',
  surface: '#111111',
  surfaceHover: '#1a1a1a',
  surfaceActive: '#222222',

  foreground: '#EDEDED',
  highContrast: '#FFFFFF',
  muted: '#717171',
  mutedForeground: '#999999',

  border: '#2a2a2a',
  borderMuted: '#1e1e1e',
  borderFocus: '#555555',

  accentAmber: '#F5A623',
  accentRed: '#FF4444',
  accentEmerald: '#00D97E',
  accentBlue: '#0070F3',
  accentPurple: '#8B5CF6',

  sidebarBg: '#0d0d0d',
  sidebarBorder: '#1f1f1f',
  sidebarItem: 'transparent',
  sidebarItemHover: '#1a1a1a',
  sidebarItemActive: '#222222',
  sidebarText: '#AAAAAA',
  sidebarTextActive: '#FFFFFF',

  inputBg: '#111111',
  inputBorder: '#2a2a2a',
  inputFocusBorder: '#444444',

  chatInputBg: '#141414',
  chatInputCard: '#161616',

  overlayBg: 'rgba(0,0,0,0.7)',
};

// ─── Light Colors ─────────────────────────────────────────────────────────────
const lightColors = {
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceHover: '#F3F4F6',
  surfaceActive: '#E5E7EB',

  foreground: '#111111',
  highContrast: '#000000',
  muted: '#6B7280',
  mutedForeground: '#4B5563',

  border: '#E5E7EB',
  borderMuted: '#F3F4F6',
  borderFocus: '#9CA3AF',

  accentAmber: '#D97706',
  accentRed: '#DC2626',
  accentEmerald: '#059669',
  accentBlue: '#2563EB',
  accentPurple: '#7C3AED',

  sidebarBg: '#F3F4F6',
  sidebarBorder: '#E5E7EB',
  sidebarItem: 'transparent',
  sidebarItemHover: '#E5E7EB',
  sidebarItemActive: '#D1D5DB',
  sidebarText: '#4B5563',
  sidebarTextActive: '#111111',

  inputBg: '#FFFFFF',
  inputBorder: '#E5E7EB',
  inputFocusBorder: '#9CA3AF',

  chatInputBg: '#F9FAFB',
  chatInputCard: '#FFFFFF',

  overlayBg: 'rgba(0,0,0,0.4)',
};

export type ColorScheme = typeof darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

export const radius = {
  xs: 3,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const typography = {
  fonts: {
    // Geist Pixel — loaded from local TTF assets
    ui: 'GeistPixel-Regular',
    uiMedium: 'GeistPixel-Medium',
    uiSemiBold: 'GeistPixel-SemiBold',
    // Geist Mono — for code/terminal blocks
    mono: 'GeistMono-Regular',
  },
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    '2xl': 28,
  },
};

export const colors = darkColors; // default export for non-context usage

export const theme = {
  colors: darkColors,
  spacing,
  radius,
  typography,
};

export default theme;

// ─── Theme Context ────────────────────────────────────────────────────────────
export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: darkColors,
  spacing,
  radius,
  typography,
  toggleTheme: () => {},
});

const THEME_STORAGE_KEY = '@dextro_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setMode(stored);
      }
    });
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  };

  return (
    <ThemeContext.Provider value={{
      mode,
      colors: mode === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
