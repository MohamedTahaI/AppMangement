import { useEffect, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '@/hooks/useMotion';
import { theme } from '@/theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  const [width, setWidth] = useState(0);
  const motion = useMotion();
  const position = useSharedValue(0);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const segmentWidth = width / Math.max(1, options.length);
  const visualIndex = I18nManager.isRTL ? options.length - selectedIndex - 1 : selectedIndex;
  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    transform: [{ translateX: position.value }],
  }));

  useEffect(() => {
    const target = visualIndex * segmentWidth;
    position.value = motion.enabled
      ? withTiming(target, { duration: motion.durations.normal })
      : target;
  }, [motion, position, segmentWidth, visualIndex]);

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.container, I18nManager.isRTL && styles.rtlContainer]}>
      <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
      {(I18nManager.isRTL ? [...options].reverse() : options).map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.option}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: theme.sizes.touch,
    flexDirection: 'row',
    padding: theme.spacingScale.xs,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  rtlContainer: { flexDirection: 'row-reverse' },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primary,
  },
  option: {
    flex: 1,
    minHeight: theme.sizes.touchCompact,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'center',
  },
  selectedLabel: { color: theme.colors.onPrimary },
});
