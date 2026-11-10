import { useEffect, useState, type ReactNode } from 'react';
import { Animated } from 'react-native';

import { useMotion } from '@/hooks/useMotion';
import { theme } from './theme';

export interface StaggeredEntranceProps {
  index: number;
  children: ReactNode;
}

export function StaggeredEntrance({
  index,
  children,
}: StaggeredEntranceProps) {
  const motion = useMotion();
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(10));

  useEffect(() => {
    if (!motion.enabled) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    opacity.setValue(0);
    translateY.setValue(10);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.durations.normal,
        delay: Math.min(index, 3) * theme.motion.stagger,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.durations.normal,
        delay: Math.min(index, 3) * theme.motion.stagger,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [index, motion, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}
