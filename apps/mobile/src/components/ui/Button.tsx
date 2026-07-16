import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { theme } from '../../theme';

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
  const getBackgroundColor = () => {
    if (disabled) return theme.colors.surfaceHover;
    switch (variant) {
      case 'primary': return theme.colors.foreground;
      case 'secondary': return theme.colors.surface;
      case 'danger': return theme.colors.accentRed;
      default: return theme.colors.foreground;
    }
  };

  const getTextColor = () => {
    if (disabled) return theme.colors.muted;
    switch (variant) {
      case 'primary': return theme.colors.background;
      case 'secondary': return theme.colors.foreground;
      case 'danger': return theme.colors.highContrast;
      default: return theme.colors.background;
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: getBackgroundColor() },
        variant === 'secondary' && styles.secondaryBorder,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={[
        styles.text,
        { color: getTextColor() },
        textStyle
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryBorder: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  text: {
    fontFamily: 'Geist_500Medium',
    fontSize: theme.typography.sizes.sm,
    fontWeight: '500',
  }
});
