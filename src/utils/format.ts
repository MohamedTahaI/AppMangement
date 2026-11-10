const LTR_MARK = '\u200E';

export function formatMoney(amount: number): string {
  const value = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sign = amount < 0 ? '-' : '';
  return `${LTR_MARK}${sign}${value} ج${LTR_MARK}`;
}

export function formatSignedMoney(amount: number): string {
  const value = Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sign = amount < 0 ? '-' : '+';
  return `${LTR_MARK}${sign}${value} ج${LTR_MARK}`;
}

export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${LTR_MARK}${day}/${month}/${year}${LTR_MARK}`;
}
