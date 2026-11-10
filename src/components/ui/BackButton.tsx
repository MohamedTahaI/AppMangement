import { AppText } from '@/components/ui/AppText';
import { MaterialIcons } from '@expo/vector-icons';
import { I18nManager, Pressable, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { theme } from '@/theme';

export interface BackButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export function BackButton({ label, onPress, style, labelStyle }: BackButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.button, style]}>
      <MaterialIcons
        name={I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'}
        size={theme.sizes.icon}
        color={theme.colors.primary}
      />
      <AppText style={[styles.label, labelStyle]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: theme.sizes.touch,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
  },
  label: {
    color: theme.colors.primary,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
  },
});
