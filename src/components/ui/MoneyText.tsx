import { StyleSheet, Text, TextProps } from 'react-native';

import { theme } from './theme';

export interface MoneyTextProps extends TextProps {
  amount: number;
  size?: number;
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج`;
}

export function MoneyText({ amount, size = theme.typography.section, style, ...props }: MoneyTextProps) {
  return (
    <Text {...props} style={[styles.text, { fontSize: size }, style]}>
      <Text>{amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
      <Text style={[styles.currency, { fontSize: Math.max(theme.typography.small, size * 0.62) }]}> ج</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: theme.colors.text,
    fontFamily: theme.typography.extraBold,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  currency: { color: theme.colors.secondaryText, fontFamily: theme.typography.medium },
});
