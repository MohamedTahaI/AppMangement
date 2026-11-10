import { MaterialIcons } from '@expo/vector-icons';
import { I18nManager, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { theme as designTheme } from '@/theme';
import { useMotion } from '@/hooks/useMotion';
import { theme } from './theme';

export interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

export function FormField({ label, error, icon, style, ...props }: FormFieldProps) {
  const motion = useMotion();
  const shake = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (!error || !motion.enabled) {
      shake.value = 0;
      return;
    }
    const direction = I18nManager.isRTL ? 1 : -1;
    shake.value = withSequence(
      withTiming(direction * 7, { duration: motion.durations.fast / 3 }),
      withTiming(direction * -7, { duration: motion.durations.fast / 3 }),
      withTiming(direction * 4, { duration: motion.durations.fast / 3 }),
      withTiming(0, { duration: motion.durations.fast / 3 }),
    );
  }, [error, motion, shake]);

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, error ? styles.invalidInput : null]}>
        {icon ? <MaterialIcons name={icon} size={theme.sizes.icon} color={theme.colors.secondaryText} /> : null}
        <TextInput
          {...props}
          placeholderTextColor={theme.colors.secondaryText}
          accessibilityHint={error ?? undefined}
          style={[styles.input, style]}
          textAlign="right"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: designTheme.spacingScale.xs,
  },
  label: {
    color: theme.colors.text,
    fontSize: designTheme.typography.body,
    fontFamily: designTheme.typography.bold,
    textAlign: 'right',
  },
  inputShell: {
    minHeight: theme.sizes.input,
    paddingHorizontal: theme.spacingScale.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
    borderRadius: designTheme.radii.sm,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  input: {
    flex: 1,
    minHeight: theme.sizes.input - 2,
    paddingHorizontal: theme.spacingScale.xs,
    color: theme.colors.text,
    fontSize: designTheme.typography.body,
    fontFamily: designTheme.typography.fontFamily,
    writingDirection: 'rtl',
  },
  invalidInput: { borderColor: theme.colors.danger },
  error: {
    color: theme.colors.danger,
    fontSize: designTheme.typography.body,
    fontFamily: designTheme.typography.bold,
    textAlign: 'right',
  },
});
