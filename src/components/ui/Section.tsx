import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { SectionHeader } from './SectionHeader';
import { theme } from '@/theme';

export interface SectionProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  style?: ViewStyle;
  size?: 'screen' | 'section';
  children: React.ReactNode;
}

/**
 * A section composed of a SectionHeader followed by its children.
 * - marginTop: sectionGap (24) between this section and the previous one.
 * - gap: cardGap (12) between the header/action and the first child, and
 *   between every child underneath.
 * Never use margins on individual cards inside a section — rely on this gap.
 */
export function Section({
  title,
  subtitle,
  action,
  style,
  size = 'section',
  children,
}: SectionProps) {
  return (
    <View style={[styles.container, style]}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
        action={action}
        size={size}
      />
      <View style={styles.children}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: theme.spacingScale.sectionGap,
    gap: theme.spacingScale.cardGap,
  },
  children: {
    gap: theme.spacingScale.cardGap,
  },
});
