import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';

import { theme } from './theme';

export type GradientCardProps = ViewProps;

export function GradientCard({ children, style, ...props }: GradientCardProps) {
  return (
    <View {...props} style={[styles.container, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.colors.heroStart, theme.colors.heroEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg pointerEvents="none" style={styles.decorations} width="100%" height="100%">
        <Circle cx="100%" cy="0" r="118" fill={theme.colors.heroDecoration} />
        <Circle cx="0" cy="100%" r="82" fill={theme.colors.heroDecoration} />
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: theme.sizes.heroCardHeight,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  decorations: { ...StyleSheet.absoluteFill },
  content: {
    flex: 1,
    padding: theme.spacingScale.md,
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: theme.spacingScale.xs,
  },
});
