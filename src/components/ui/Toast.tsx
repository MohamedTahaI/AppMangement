import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { theme } from './theme';

export interface ToastProps {
  visible: boolean;
  message: string;
  variant?: 'success' | 'error' | 'info';
  duration?: number;
  onDismiss?: () => void;
}

const BACKGROUND: Record<NonNullable<ToastProps['variant']>, string> = {
  success: theme.colors.success,
  error: theme.colors.danger,
  info: theme.colors.primary,
};

export function Toast({
  visible,
  message,
  variant = 'info',
  duration = 2500,
  onDismiss,
}: ToastProps) {
  const motion = useMotion();
  const progress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 18 }],
  }));

  useEffect(() => {
    progress.value = motion.enabled
      ? withTiming(visible ? 1 : 0, { duration: motion.durations.fast })
      : Number(visible);
    if (!visible || !onDismiss) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, motion, onDismiss, progress, visible]);

  if (!visible) return null;
  return (
    <Animated.View accessibilityRole="alert" style={[styles.toast, { backgroundColor: BACKGROUND[variant] }, animatedStyle]}>
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: theme.spacingScale.md,
    right: theme.spacingScale.md,
    bottom: theme.spacingScale.xl,
    zIndex: 100,
    minHeight: theme.sizes.touch,
    padding: theme.spacingScale.md,
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    elevation: 5,
  },
  message: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'center',
  },
});
