import { ScrollView, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import { theme } from '@/theme';

export interface ScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  refreshControl?: ReactElement;
  testID?: string;
}

/**
 * Screen wrapper used by every screen in the app.
 * - Safe area on top and bottom.
 * - ScrollView with a single spacing system:
 *   padding: screenPadding (16) on every side,
 *   gap: cardGap (12) between every direct child,
 *   paddingBottom: tabBarHeight + 24 so content never hides under the tab bar.
 */
export function Screen({
  children,
  style,
  contentContainerStyle,
  refreshControl,
  testID,
}: ScreenProps) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, style]} testID={testID}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacingScale.screenPadding,
          gap: theme.spacingScale.cardGap,
          paddingBottom: theme.sizes.tabBar + 24,
          ...contentContainerStyle,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = {
  root: { flex: 1, backgroundColor: theme.colors.background },
};
