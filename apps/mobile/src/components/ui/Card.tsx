import React from 'react';
import { View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, style, noPadding = false }) => {
  const { colors, spacing, radius } = useTheme();

  return (
    <View style={[{
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden' as const,
      ...(noPadding ? {} : { padding: spacing.md }),
    }, style]}>
      {children}
    </View>
  );
};
