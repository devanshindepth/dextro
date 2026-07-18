import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../theme';

interface ThinkingIndicatorProps {
  visible: boolean;
  label?: string;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  visible,
  label = 'Dextro is thinking',
}) => {
  const { colors, spacing, radius, typography } = useTheme();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();

      const animate = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
            Animated.delay(800 - delay),
          ])
        );

      const anim1 = animate(dot1, 0);
      const anim2 = animate(dot2, 200);
      const anim3 = animate(dot3, 400);

      anim1.start(); anim2.start(); anim3.start();
      return () => { anim1.stop(); anim2.stop(); anim3.stop(); };
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, paddingHorizontal: spacing.md, marginVertical: spacing.xs }]}>
      <View style={[styles.avatar, { backgroundColor: colors.surfaceHover }]}>
        <Text style={styles.avatarText}>🤖</Text>
      </View>
      <View style={[styles.bubble, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }]}>
        <View style={styles.row}>
          <Text style={{ fontFamily: typography.fonts.ui, fontSize: typography.sizes.sm, color: colors.muted }}>
            {label}
          </Text>
          <View style={styles.dots}>
            {[dot1, dot2, dot3].map((dot, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: colors.muted, opacity: dot },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginTop: 2 },
  avatarText: { fontSize: 14 },
  bubble: { maxWidth: '82%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
