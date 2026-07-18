import React from 'react';
import { TouchableOpacity, Text, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  style,
  textStyle,
  disabled = false,
}) => {
  const { colors, spacing, radius, typography } = useTheme();

  const getBackgroundColor = () => {
    if (disabled) return colors.surfaceHover;
    switch (variant) {
      case 'primary': return colors.foreground;
      case 'secondary': return colors.surface;
      case 'danger': return `${colors.accentRed}18`;
      default: return colors.foreground;
    }
  };

  const getTextColor = () => {
    if (disabled) return colors.muted;
    switch (variant) {
      case 'primary': return colors.background;
      case 'secondary': return colors.foreground;
      case 'danger': return colors.accentRed;
      default: return colors.background;
    }
  };

  const getBorderColor = () => {
    if (variant === 'secondary') return colors.border;
    if (variant === 'danger') return `${colors.accentRed}30`;
    return 'transparent';
  };

  return (
    <TouchableOpacity
      style={[{
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.sm,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        flexDirection: 'row' as const,
        backgroundColor: getBackgroundColor(),
        borderWidth: variant !== 'primary' ? 1 : 0,
        borderColor: getBorderColor(),
      }, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[{
        fontFamily: typography.fonts.uiMedium,
        fontSize: typography.sizes.sm,
        fontWeight: '500',
        color: getTextColor(),
      }, textStyle]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};
