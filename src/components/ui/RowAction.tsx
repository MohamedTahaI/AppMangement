import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { theme } from './theme';

export interface RowActionProps {
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RowAction({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  style,
}: RowActionProps) {
  const color = variant === 'danger' ? theme.colors.danger : theme.colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderColor: color },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {icon ? <MaterialIcons name={icon} size={18} color={color} /> : null}
      <AppText numberOfLines={1} style={[styles.label, { color }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    minHeight: 44,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: theme.borderWidths.hairline,
    backgroundColor: theme.colors.surface,
  },
  label: {
    flexShrink: 1,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.bold,
  },
  pressed: { opacity: 0.84 },
  disabled: { opacity: 0.5 },
});
