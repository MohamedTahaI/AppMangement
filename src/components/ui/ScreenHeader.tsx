import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { theme } from '@/theme';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
}

export function ScreenHeader({ title, subtitle, style }: ScreenHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacingScale.xs, alignItems: 'flex-end', writingDirection: 'rtl' },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.title,
    fontFamily: theme.typography.extraBold,
    textAlign: 'right',
  },
  subtitle: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'right',
  },
});
