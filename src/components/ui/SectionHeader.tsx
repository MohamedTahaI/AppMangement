import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { theme } from '@/theme';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  style?: ViewStyle;
  size?: 'screen' | 'section';
}

export function SectionHeader({ title, subtitle, action, style, size = 'section' }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleContainer}>
        <AppText
          accessibilityRole="header"
          numberOfLines={2}
          style={[styles.title, size === 'screen' && styles.screenTitle]}>
          {title}
        </AppText>
        {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacingScale.sm,
    direction: 'rtl',
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacingScale.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.heading,
    fontFamily: theme.typography.extraBold,
  },
  screenTitle: {
    fontSize: theme.typography.title,
  },
  subtitle: {
    color: theme.colors.secondaryText,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.fontFamily,
  },
  action: {
    flexShrink: 0,
    maxWidth: '55%',
    minWidth: 0,
    alignItems: 'flex-end',
  },
});
