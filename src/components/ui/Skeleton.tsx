import { useEffect } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';

export interface SkeletonProps {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
}

export function Skeleton({ height = 88, width = '100%', radius = theme.radii.md }: SkeletonProps) {
  const motion = useMotion();
  const translateX = useSharedValue(I18nManager.isRTL ? 240 : -240);
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  useEffect(() => {
    if (!motion.enabled) {
      translateX.value = 0;
      return;
    }
    translateX.value = withRepeat(
      withTiming(I18nManager.isRTL ? -240 : 240, { duration: theme.motion.normal }),
      -1,
      false,
    );
    return () => {
      translateX.value = 0;
    };
  }, [motion, translateX]);

  return (
    <View
      accessibilityLabel="جارٍ التحميل"
      style={[styles.skeleton, { height, width, borderRadius: radius }]}>
      {motion.enabled ? (
        <Animated.View
          style={[
            styles.shimmer,
            I18nManager.isRTL ? styles.shimmerRtl : styles.shimmerLtr,
            shimmerStyle,
          ]}>
          <LinearGradient
            colors={[theme.colors.shimmerEdge, theme.colors.shimmerHighlight, theme.colors.shimmerEdge]}
            start={{ x: I18nManager.isRTL ? 1 : 0, y: 0 }}
            end={{ x: I18nManager.isRTL ? 0 : 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { overflow: 'hidden', backgroundColor: theme.colors.border },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: theme.sizes.specialCardWidth,
  },
  shimmerLtr: { left: 0 },
  shimmerRtl: { right: 0 },
});
