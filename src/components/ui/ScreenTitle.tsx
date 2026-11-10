import { SectionHeader } from './SectionHeader';

export interface ScreenTitleProps {
  title: string;
  subtitle?: string;
}

export function ScreenTitle({ title, subtitle }: ScreenTitleProps) {
  return <SectionHeader title={title} subtitle={subtitle} size="screen" />;
}
