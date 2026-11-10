import { AppText } from '@/components/ui/AppText';
import { StyleSheet, TextProps } from 'react-native';

import { theme } from './theme';

export interface MoneyTextProps extends TextProps {
  amount: number;
  size?: number;
  currencyColor?: string;
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج`;
}

export function MoneyText({
  amount,
  size = theme.typography.section,
  currencyColor = theme.colors.secondaryText,
  style,
  ...props
}: MoneyTextProps) {
  return (
    <AppText {...props} style={[styles.text, { fontSize: size }, style]}>
      <AppText>{amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</AppText>
      <AppText style={[styles.currency, { color: currencyColor, fontSize: Math.max(theme.typography.small, size * 0.62) }]}> ج</AppText>
    </AppText>
  );
}

const styles = StyleSheet.create({
  text: {
    color: theme.colors.text,
    fontFamily: theme.typography.extraBold,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  currency: { color: theme.colors.secondaryText, fontFamily: theme.typography.medium },
});
