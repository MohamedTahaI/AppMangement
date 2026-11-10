import { useEffect } from 'react';
import { I18nManager, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';

export interface ProgressBarProps {
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  color = theme.colors.primary,
  trackColor = theme.colors.border,
  height = theme.sizes.progressBar,
  style,
}: ProgressBarProps) {
  const motion = useMotion();
  const value = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: value.value / 100 }] }));

  useEffect(() => {
    const target = Math.max(0, Math.min(100, progress));
    value.value = motion.enabled ? withTiming(target, { duration: motion.durations.slow }) : target;
  }, [motion, progress, value]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(100, progress)) }}
      style={[styles.track, { height, backgroundColor: trackColor }, style]}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            [I18nManager.isRTL ? 'right' : 'left']: 0,
            transformOrigin: `${I18nManager.isRTL ? 'right' : 'left'} center`,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', borderRadius: theme.radii.pill, position: 'relative' },
  fill: { width: '100%', height: '100%', borderRadius: theme.radii.pill, position: 'absolute', top: 0 },
});
