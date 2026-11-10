import { AppText } from '@/components/ui/AppText';
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  style?: ViewStyle;
}

export function ProgressRing({
  progress,
  size = theme.sizes.progressRing,
  strokeWidth = theme.sizes.progressStroke,
  color = theme.colors.primary,
  label,
  style,
}: ProgressRingProps) {
  const motion = useMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = useSharedValue(0);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - percentage.value / 100),
  }));

  useEffect(() => {
    const target = Math.max(0, Math.min(100, progress));
    percentage.value = motion.enabled
      ? withTiming(target, { duration: motion.durations.slow })
      : target;
  }, [motion, progress, percentage]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(100, progress)) }}
      style={[styles.container, { width: size, height: size }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          strokeLinecap="round"
          fill="none"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <AppText style={styles.label}>{label ?? `${Math.round(progress)}٪`}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.colors.text, fontSize: theme.typography.body, fontFamily: theme.typography.extraBold },
});
