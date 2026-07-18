import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error';

interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
  style?: object;
}

export const Badge: React.FC<BadgeProps> = ({ text, variant = 'default', style }) => {
  const { colors, spacing, radius, typography } = useTheme();

  const getColors = () => {
    switch (variant) {
      case 'success':
        return { bg: `${colors.accentEmerald}18`, text: colors.accentEmerald, border: `${colors.accentEmerald}30` };
      case 'warning':
        return { bg: `${colors.accentAmber}18`, text: colors.accentAmber, border: `${colors.accentAmber}30` };
      case 'error':
        return { bg: `${colors.accentRed}18`, text: colors.accentRed, border: `${colors.accentRed}30` };
      default:
        return { bg: colors.surfaceHover, text: colors.muted, border: colors.border };
    }
  };

  const badgeColors = getColors();

  return (
    <View style={[{
      backgroundColor: badgeColors.bg,
      borderColor: badgeColors.border,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.xs,
      alignSelf: 'flex-start' as const,
    }, style]}>
      <Text style={{
        fontFamily: typography.fonts.uiMedium,
        fontSize: 10,
        color: badgeColors.text,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
      }}>
        {text}
      </Text>
    </View>
  );
};
