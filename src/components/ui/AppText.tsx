import { Text, type TextProps } from 'react-native';

export function AppText({ style, ...props }: TextProps) {
  return (
    <Text
      {...props}
      style={[{ writingDirection: 'rtl', flexShrink: 1 }, style]}
    />
  );
}
