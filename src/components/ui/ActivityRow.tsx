import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { Card } from './Card';
import { formatDate, formatSignedMoney } from '@/utils/format';
import { theme } from '@/theme';

export type ActivityType = 'payment' | 'expense' | 'adjustment';

export interface ActivityRowProps {
  type: ActivityType;
  title: string;
  date: string;
  note?: string;
  amount: number;
  onPress?: () => void;
  style?: ViewStyle;
}

const ACTIVITY_STYLE = {
  payment: { icon: 'arrow-downward', tint: theme.colors.successBackground, color: theme.colors.success },
  expense: { icon: 'arrow-upward', tint: theme.colors.dangerBackground, color: theme.colors.danger },
  adjustment: { icon: 'tune', tint: theme.colors.warningBackground, color: theme.colors.warning },
} as const;

export function ActivityRow({ type, title, date, note, amount, onPress, style }: ActivityRowProps) {
  const visual = ACTIVITY_STYLE[type];
  const prefix = type === 'payment' ? 'دفعة' : type === 'expense' ? 'مصروف' : 'تعديل الرصيد';
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => (pressed && onPress ? styles.pressed : undefined)}>
      <Card style={[styles.row, style]}>
        <View style={[styles.icon, { backgroundColor: visual.tint }]}>
          <MaterialIcons name={visual.icon} size={theme.sizes.icon} color={visual.color} />
        </View>
        <View style={styles.copy}>
          <AppText numberOfLines={1} style={styles.title}>
            {`${prefix} — ${title}`}
          </AppText>
          <AppText numberOfLines={2} style={styles.meta}>
            {formatDate(date)}{note ? ` · ${note}` : ''}
          </AppText>
        </View>
        <AppText
          numberOfLines={1}
          style={[styles.amount, { color: amount < 0 ? theme.colors.danger : theme.colors.success }]}>
          {formatSignedMoney(amount)}
        </AppText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minWidth: 0,
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'center',
    gap: theme.spacingScale.xs,
  },
  icon: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: theme.spacingScale.xs / 2,
  },
  title: {
    width: '100%',
    color: theme.colors.text,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.bold,
    textAlign: 'auto',
  },
  meta: {
    width: '100%',
    color: theme.colors.secondaryText,
    fontSize: theme.typography.small,
    fontFamily: theme.typography.fontFamily,
    textAlign: 'auto',
  },
  amount: {
    flexShrink: 0,
    fontSize: theme.typography.body,
    fontFamily: theme.typography.extraBold,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  pressed: { opacity: 0.84 },
});
