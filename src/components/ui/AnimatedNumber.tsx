import { AppText } from '@/components/ui/AppText';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, type TextProps } from 'react-native';

import { useMotion } from '@/hooks/useMotion';
import { theme } from './theme';

function formatNumber(amount: number): string {
  return (Math.round(amount * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

interface AnimatedNumberProps extends TextProps {
  value: number;
  duration?: number;
  size?: number;
  suffix?: string;
  suffixColor?: string;
}

export function AnimatedNumber({
  value,
  duration = theme.motion.slow,
  size = 34,
  suffix = '',
  suffixColor = theme.colors.secondaryText,
  style,
  ...props
}: AnimatedNumberProps) {
  const motion = useMotion();
  const [animatedValue] = useState(() => new Animated.Value(0));
  const [displayValue, setDisplayValue] = useState(formatNumber(0));

  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value: current }) => {
      setDisplayValue(formatNumber(current));
    });
    if (motion.enabled) {
      Animated.timing(animatedValue, {
        toValue: value,
        duration: Math.min(duration, motion.durations.slow),
        useNativeDriver: false,
      }).start();
    } else {
      animatedValue.setValue(value);
    }
    return () => animatedValue.removeListener(listenerId);
  }, [animatedValue, duration, motion, suffix, value]);

  return (
    <AppText {...props} style={[styles.text, { fontSize: size }, style]}>
      <AppText>{displayValue}</AppText>
      {suffix ? <AppText style={[styles.suffix, { color: suffixColor }]}>{suffix}</AppText> : null}
    </AppText>
  );
}

const styles = StyleSheet.create({
  text: {
    color: theme.colors.text,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  suffix: { fontSize: theme.typography.small, fontFamily: theme.typography.medium },
});
