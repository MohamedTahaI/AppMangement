import { StyleSheet, View, type ViewProps } from 'react-native';

import { theme } from './theme';

export interface CardProps extends ViewProps {
  variant?: 'row' | 'surface';
}

export function Card({ variant = 'row', style, ...props }: CardProps) {
  return <View {...props} style={[styles.card, variant === 'surface' && styles.surface, style]} />;
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacingScale.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.borderWidths.hairline,
    borderColor: theme.colors.border,
    gap: theme.spacingScale.xs,
  },
  surface: { ...theme.shadows.card },
});
