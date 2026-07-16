/**
 * Dextro Theme System
 * Vercel-inspired monochromatic, high-contrast aesthetic.
 */

export const colors = {
  // Base
  background: '#000000',
  surface: '#111111',
  surfaceHover: '#222222',
  
  // Text
  foreground: '#EDEDED',
  highContrast: '#FFFFFF',
  muted: '#888888',
  
  // Borders
  border: '#333333',
  borderMuted: '#222222',
  
  // Accents
  accentAmber: '#F5A623',
  accentRed: '#FF3333',
  accentEmerald: '#33FF77',
  accentBlue: '#0070F3',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
};

export const typography = {
  // We will load these custom fonts in the root layout
  fonts: {
    ui: 'GeistPixel', // Using Geist Pixel for UI per user request
    mono: 'JetBrainsMono_400Regular', // For terminal/code blocks
  },
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
  }
};

export const theme = {
  colors,
  spacing,
  radius,
  typography,
};

export default theme;
