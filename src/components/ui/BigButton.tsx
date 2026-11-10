import { AppText } from '@/components/ui/AppText';
import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { theme } from './theme';

export interface BigButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'default' | 'compact';
  icon?: keyof typeof MaterialIcons.glyphMap;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
}

export function BigButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'default',
  icon,
  numberOfLines,
  style,
}: BigButtonProps) {
  const compact = size === 'compact';
  const backgroundColor = variant === 'danger' ? theme.colors.danger : theme.colors.surface;
  const textColor = variant === 'secondary' ? theme.colors.primary : theme.colors.surface;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        { backgroundColor: variant === 'primary' ? 'transparent' : backgroundColor },
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        pressed && !disabled && !loading && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={[theme.colors.heroStart, theme.colors.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={compact ? styles.compactContent : undefined}>
          {compact && icon ? <MaterialIcons name={icon} size={18} color={textColor} /> : null}
          <AppText
            numberOfLines={numberOfLines ?? (compact ? 1 : undefined)}
            style={[styles.text, compact && styles.compactText, { color: textColor }]}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: theme.sizes.button,
    paddingHorizontal: theme.spacingScale.md,
    paddingVertical: theme.spacingScale.xs,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compact: {
    height: 44,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 12,
  },
  compactContent: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondary: {
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.primary,
  },
  danger: { borderWidth: theme.borderWidths.hairline, borderColor: theme.colors.danger },
  pressed: {
    opacity: 0.84,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'center',
  },
  compactText: {
    flexShrink: 1,
    fontSize: 15,
    fontFamily: theme.typography.medium,
  },
});
