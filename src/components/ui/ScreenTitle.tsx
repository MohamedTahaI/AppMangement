import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';
import { theme as designTheme } from '@/theme';

export interface ScreenTitleProps {
  title: string;
  subtitle?: string;
}

export function ScreenTitle({ title, subtitle }: ScreenTitleProps) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacingScale.xs,
    alignItems: 'flex-end',
    writingDirection: 'rtl',
  },
  title: {
    color: theme.colors.text,
    fontSize: designTheme.typography.title,
    fontFamily: designTheme.typography.extraBold,
    textAlign: 'right',
  },
  subtitle: {
    color: theme.colors.secondaryText,
    fontSize: designTheme.typography.body,
    fontFamily: designTheme.typography.fontFamily,
    textAlign: 'right',
  },
});
