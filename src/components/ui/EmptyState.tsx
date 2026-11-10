import { AppText } from '@/components/ui/AppText';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { useMotion } from '@/hooks/useMotion';
import { BigButton } from './BigButton';
import { theme as designTheme } from '@/theme';

export interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  const motion = useMotion();
  const float = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: float.value }] }));
  useEffect(() => {
    if (!motion.enabled) {
      float.value = 0;
      return;
    }
    float.value = withRepeat(withTiming(-4, { duration: designTheme.motion.slow }), -1, true);
  }, [float, motion]);

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        <Svg width={84} height={72} viewBox="0 0 84 72" accessibilityLabel="رسم توضيحي">
          <Circle cx="42" cy="36" r="32" fill={designTheme.colors.successBackground} />
          <Path
            d="M25 42h34M30 35l12-11 12 11M32 43v11h20V43"
            fill="none"
            stroke={designTheme.colors.primary}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
      <AppText style={styles.message}>{message}</AppText>
      {actionLabel && onAction ? <BigButton title={actionLabel} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: designTheme.spacingScale.md,
    alignItems: 'center',
    gap: designTheme.spacingScale.sm,
    borderRadius: designTheme.radii.md,
    backgroundColor: designTheme.colors.surface,
    borderWidth: designTheme.borderWidths.hairline,
    borderColor: designTheme.colors.border,
    ...designTheme.shadows.card,
  },
  message: {
    color: designTheme.colors.secondaryText,
    fontSize: designTheme.typography.body,
    fontFamily: designTheme.typography.fontFamily,
    textAlign: 'center',
  },
  action: { width: '100%' },
});
