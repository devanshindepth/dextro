import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../../theme';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error';

interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'default', style }) => {
  const getColors = () => {
    switch (variant) {
      case 'success':
        return { bg: 'rgba(51, 255, 119, 0.1)', text: theme.colors.accentEmerald, border: 'rgba(51, 255, 119, 0.2)' };
      case 'warning':
        return { bg: 'rgba(245, 166, 35, 0.1)', text: theme.colors.accentAmber, border: 'rgba(245, 166, 35, 0.2)' };
      case 'error':
        return { bg: 'rgba(255, 51, 51, 0.1)', text: theme.colors.accentRed, border: 'rgba(255, 51, 51, 0.2)' };
      default:
        return { bg: theme.colors.surfaceHover, text: theme.colors.muted, border: theme.colors.border };
    }
  };

  const colors = getColors();

  return (
    <View style={[
      styles.badge,
      { backgroundColor: colors.bg, borderColor: colors.border },
      style
    ]}>
      <Text style={[styles.text, { color: colors.text }]}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Geist_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }
});
