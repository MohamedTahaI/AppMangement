import { SectionHeader } from './SectionHeader';
import type { ViewStyle } from 'react-native';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  style?: ViewStyle;
}

export function ScreenHeader({ title, subtitle, style }: ScreenHeaderProps) {
  return <SectionHeader title={title} subtitle={subtitle} style={style} size="screen" />;
}
