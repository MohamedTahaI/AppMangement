import { AppText } from '@/components/ui/AppText';
import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { Card } from './Card';
import { MoneyText } from './MoneyText';
import { theme } from '@/theme';

export interface StatCardProps {
  title: string;
  amount: number;
  icon: keyof typeof MaterialIcons.glyphMap;
  style?: ViewStyle;
}

export function StatCard({ title, amount, icon, style }: StatCardProps) {
  return (
    <Card variant="surface" style={[styles.card, style]}>
      <View style={styles.heading}>
        <View style={styles.iconCircle}>
          <MaterialIcons name={icon} size={theme.sizes.icon} color={theme.colors.primary} />
        </View>
        <AppText style={styles.title}>{title}</AppText>
      </View>
      <MoneyText amount={amount} size={theme.typography.section} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: theme.sizes.regularCardHeight, justifyContent: 'space-between', alignItems: 'flex-end' },
  heading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacingScale.xs },
  iconCircle: { width: theme.sizes.iconBadge, height: theme.sizes.iconBadge, borderRadius: theme.radii.pill, backgroundColor: theme.colors.successBackground, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: theme.colors.secondaryText, fontSize: theme.typography.small, fontFamily: theme.typography.medium, textAlign: 'auto' },
});
