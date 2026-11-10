import { AppText } from '@/components/ui/AppText';
import { StyleSheet, TextProps } from 'react-native';

import { formatMoney } from '@/utils/format';
import { theme } from './theme';

export { formatMoney };

export interface MoneyTextProps extends TextProps {
  amount: number;
  size?: number;
  currencyColor?: string;
}

function formatNumber(amount: number): string {
  const value = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return amount < 0 ? `\u200E${value}\u200E` : value;
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
      <AppText>{formatNumber(amount)}</AppText>
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
