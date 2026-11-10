import { AppText } from '@/components/ui/AppText';
import { Pressable, StyleSheet, View } from 'react-native';

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
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && styles.optionSelected]}>
            <AppText
              accessible
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.label, selected && styles.selectedLabel]}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    flexDirection: 'row',
    direction: 'rtl',
    gap: theme.spacingScale.xs,
    paddingHorizontal: theme.spacingScale.xs,
    borderRadius: theme.radii.md,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacingScale.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    flexShrink: 1,
  },
  optionSelected: { backgroundColor: theme.colors.primary },
  label: {
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.typography.medium,
    textAlign: 'center',
  },
  selectedLabel: { color: theme.colors.onPrimary },
});
