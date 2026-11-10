import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, I18nManager, type StyleProp, type ViewStyle } from 'react-native';

import { useMotion } from '@/hooks/useMotion';

export interface MonthTransitionProps {
  month: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function MonthTransition({ month, children, style }: MonthTransitionProps) {
  const motion = useMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const [translateX] = useState(() => new Animated.Value(0));
  const previousMonth = useRef(month);

  useEffect(() => {
    if (previousMonth.current === month) return;
    const direction = month > previousMonth.current ? 1 : -1;
    previousMonth.current = month;
    if (!motion.enabled) {
      opacity.setValue(1);
      translateX.setValue(0);
      return;
    }
    const offset = (I18nManager.isRTL ? -1 : 1) * direction * 14;
    opacity.setValue(0);
    translateX.setValue(offset);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.durations.normal,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: motion.durations.normal,
        useNativeDriver: true,
      }),
    ]).start();
  }, [month, motion, opacity, translateX]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateX }] }]}>
      {children}
    </Animated.View>
  );
}
