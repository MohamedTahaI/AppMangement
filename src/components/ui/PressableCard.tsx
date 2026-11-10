import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { Card } from './Card';

export interface PressableCardProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
}

export function PressableCard({ children, style, cardStyle, onPressIn, onPressOut, onPress, ...props }: PressableCardProps) {
  const scale = useSharedValue(1);
  const motion = useMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (!motion.enabled) scale.value = 1;
  }, [motion.enabled, scale]);

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        {...props}
        onPressIn={(event) => {
          if (motion.enabled) scale.value = withSpring(0.97, motion.spring);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          if (motion.enabled) scale.value = withSpring(1, motion.spring);
          onPressOut?.(event);
        }}
        onPress={(event) => {
          if (onPress) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress(event);
          }
        }}>
        <Card style={cardStyle}>{children}</Card>
      </Pressable>
    </Animated.View>
  );
}
