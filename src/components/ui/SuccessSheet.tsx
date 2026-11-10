import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { MoneyText } from './MoneyText';
import { AppBottomSheet } from './AppBottomSheet';
import { theme } from './theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface SuccessSheetProps {
  visible: boolean;
  title?: string;
  amount?: number;
  message?: string;
  duration?: number;
  onDismiss: () => void;
}

export function SuccessSheet({
  visible,
  title = 'تم الحفظ بنجاح',
  amount,
  message,
  duration = 1500,
  onDismiss,
}: SuccessSheetProps) {
  const motion = useMotion();
  const progress = useSharedValue(0);
  const strokeLength = 42;
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: strokeLength * (1 - progress.value),
  }));

  useEffect(() => {
    if (!visible) return;
    if (motion.enabled) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: motion.durations.normal });
    } else {
      progress.value = 1;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, motion, onDismiss, progress, visible]);

  return (
    <AppBottomSheet visible={visible} onClose={onDismiss} snapPoints={['38%']}>
      <View style={styles.content}>
        <Svg width={82} height={82} viewBox="0 0 82 82">
          <Circle cx="41" cy="41" r="37" fill={theme.colors.successBackground} />
          <AnimatedPath
            d="M22 42l13 13 26-29"
            fill="none"
            stroke={theme.colors.success}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={strokeLength}
            animatedProps={animatedProps}
          />
        </Svg>
        <Text style={styles.title}>{title}</Text>
        {amount !== undefined ? <MoneyText amount={amount} size={theme.typography.number} style={styles.amount} /> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: theme.spacingScale.sm, paddingVertical: theme.spacingScale.md },
  title: {
    color: theme.colors.success,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
    textAlign: 'center',
  },
  amount: {
    color: theme.colors.text,
    fontFamily: theme.typography.extraBold,
    textAlign: 'center',
  },
  message: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'center',
  },
});
