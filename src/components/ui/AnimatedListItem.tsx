import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';

export interface AnimatedListItemProps {
  index: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedListItem({ index, children, style }: AnimatedListItemProps) {
  const motion = useMotion();
  const opacity = useSharedValue(index < 10 && motion.enabled ? 0 : 1);
  const translateY = useSharedValue(index < 10 && motion.enabled ? 10 : 0);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (index >= 10 || !motion.enabled) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = Math.min(index, 9) * theme.motion.stagger;
    opacity.value = withDelay(delay, withTiming(1, { duration: motion.durations.normal }));
    translateY.value = withDelay(delay, withTiming(0, { duration: motion.durations.normal }));
  }, [index, motion, opacity, translateY]);

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
